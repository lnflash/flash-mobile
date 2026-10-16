import { cardOf, validateCard } from "../cards/types"
import type { ToolCall } from "../engine/intent-router"
import { report } from "../engine/telemetry"
import { matchGrammar } from "../grammar"
import type {
  BalancesProjection,
  PricePayload,
  TransactionsProjection,
} from "../registry/projections"
import { DisplayFormatter, isIntent, tierOf, ToolResult } from "../registry/types"
import type { AssistantRuntime } from "./assistant-runtime"
import type { NewEntry } from "./thread-store"

// One turn of the Ask Flash thread (ENG-689, spec §7, §7.2): the grammar
// reads the utterance; a miss or an amount it cannot read is a templated
// reply, and runTool is never called for it. Offline, nothing that needs
// the network runs: no prepare (a send, a request) and no price, which is
// never estimated (spec §4). Reads run against the cache then, and their
// answers carry the stale label. Every tool result is noted for the
// thread's metrics, and every prepared action is held as text-initiated,
// which the auth policy confirms with a tap (spec §5).
//
// Dispatch order (spec §7): the grammar, then an on-device model (Phase 3)
// and the server (Phase 5), neither of which exists yet.

/** What a turn needs from the screen: the connection, and the account's display currency. */
export type TurnEnv = {
  isOffline: boolean
  /** The display currency's code, as realtimePrice takes it ("JMD"). */
  displayCurrency: string
  /** Its symbol ("J$"), so the grammar can tell a "$" it cannot read. */
  displaySymbol?: string
  /** The display formatter the action tools fill their cards with. */
  display: DisplayFormatter
  /** The instance's GraphQL endpoint and Lightning address host, for sendPayment. */
  graphqlUri: string
  lnAddressHostname: string
}

/**
 * Whether a call needs the network: anything that prepares (an action tool)
 * and the live price. Offline the thread answers these with
 * Assistant.actionsOffline and runs nothing.
 */
export const needsNetwork = (call: ToolCall): boolean =>
  !isIntent(call.intent) || tierOf(call.intent) === "action" || call.intent === "getPrice"

/** What a tool's result puts in the thread. */
export const entriesFor = (
  call: ToolCall,
  result: ToolResult<unknown>,
  { stale }: { stale: boolean },
): NewEntry[] => {
  switch (result.kind) {
    case "answer":
      switch (call.intent) {
        case "getBalances":
          return [
            { kind: "balances", payload: result.payload as BalancesProjection, stale },
          ]
        case "getTransactions":
          return [
            {
              kind: "transactions",
              payload: result.payload as TransactionsProjection,
              stale,
            },
          ]
        case "getPrice":
          return [{ kind: "price", payload: result.payload as PricePayload }]
        default:
          // An answer that is a card (prepareReceive's invoice) shows as one.
          return validateCard(result.payload).valid
            ? [{ kind: "card", card: result.payload }]
            : [{ kind: "reply", replyKey: "Assistant.toolFailed" }]
      }
    case "prepared":
      return [{ kind: "card", card: cardOf(result.preparedAction), call }]
    case "clarification":
      return [{ kind: "card", card: result.card, call }]
    case "error":
      // A refused prepare's card says the refusal's own reply: it is the
      // bubble, as an alert, never the same sentence twice.
      return result.card
        ? [{ kind: "card", card: result.card }]
        : [{ kind: "reply", replyKey: result.userMessage }]
  }
}

/**
 * Run one call: through runTool, over the cache while offline (and with no
 * action context then, so nothing can be prepared), the network otherwise.
 * What it prepared is held as text-initiated; the result is noted.
 */
export const runCall = async (
  runtime: AssistantRuntime,
  call: ToolCall,
  env: TurnEnv,
): Promise<NewEntry[]> => {
  const offline = env.isOffline
  const result = await runtime.runTool(call, {
    registry: runtime.registry,
    graphql: offline ? runtime.cachedGraphql : runtime.graphql,
    btcRail: runtime.btcRail,
    displayCurrency: env.displayCurrency,
    now: runtime.now,
    telemetry: runtime.telemetry,
    ...(offline
      ? {}
      : {
          actionDeps: {
            threadId: runtime.threadId,
            graphqlActions: runtime.graphqlActions,
            btcRail: runtime.btcRail,
            send: {
              mutations: runtime.sendMutations,
              graphqlUri: env.graphqlUri,
              lnAddressHostname: env.lnAddressHostname,
            },
            requestLnurlInvoice: runtime.requestLnurlInvoice,
            display: env.display,
          },
        }),
  })
  if (result.kind === "prepared") {
    // Typed or tapped: text. The auth policy confirms it with a tap.
    runtime.executor.addPrepared(result.preparedAction, "text")
  }
  runtime.executor.noteToolResult(runtime.threadId, result)
  return entriesFor(call, result, { stale: offline })
}

/** The thread's answer to what the user typed. */
export const answerUtterance = async (
  runtime: AssistantRuntime,
  utterance: string,
  env: TurnEnv,
): Promise<NewEntry[]> => {
  const match = matchGrammar(utterance, {
    displayCurrency: env.displayCurrency,
    displaySymbol: env.displaySymbol,
  })
  if (match === undefined) {
    // A miss is counted as the router counts a call it cannot read, so
    // the grammar's coverage shows in the same event.
    report(() =>
      runtime.telemetry.tool({
        intent: "unknown",
        tier: "none",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: false,
      }),
    )
    return [{ kind: "reply", replyKey: "Assistant.unknownIntent" }]
  }
  if (match.kind === "clarifyAmount") {
    return [{ kind: "reply", replyKey: "Assistant.amountUnclear" }]
  }
  if (env.isOffline && needsNetwork(match.call)) {
    return [{ kind: "reply", replyKey: "Assistant.actionsOffline" }]
  }
  return runCall(runtime, match.call, env)
}

/**
 * The call a question's pick issues (spec §3, v0.2.12): the same call with
 * the argument the question was about replaced by the option's id
 * (`contact:<username>` for a contact). Generic over intents. Undefined when
 * no argument is the one the question was about.
 */
export const reissue = (
  call: ToolCall,
  about: string | undefined,
  optionId: string,
): ToolCall | undefined => {
  if (about === undefined) return undefined
  let replaced = false
  const args = Object.fromEntries(
    Object.entries(call.args ?? {}).map(([key, value]) => {
      if (value !== about) return [key, value]
      replaced = true
      return [key, optionId]
    }),
  )
  return replaced ? { intent: call.intent, args } : undefined
}
