import type { BtcRail } from "@app/payments/btc-rail"
import { cardOf, validateCard } from "../cards/types"
import type { ToolCall } from "../engine/intent-router"
import { report } from "../engine/telemetry"
import { matchGrammar } from "../grammar"
import type { GraphqlRail } from "../rails/graphql-rail"
import type {
  BalancesProjection,
  PricePayload,
  TransactionsProjection,
} from "../registry/projections"
import { DisplayFormatter, isIntent, tierOf, ToolResult } from "../registry/types"
import type { AssistantRuntime } from "./assistant-runtime"
import { ListedTransaction, listedKey, NewEntry } from "./thread-store"

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

/** The payments the projection lists, as their rails handed them to the tool. */
const listedFor = (
  payload: TransactionsProjection,
  listed: ReadonlyMap<string, ListedTransaction>,
): Record<string, ListedTransaction> =>
  Object.fromEntries(
    payload.transactions.flatMap(({ rail, id }) => {
      const key = listedKey(rail, id)
      const row = listed.get(key)
      return row ? [[key, row]] : []
    }),
  )

/**
 * What a tool's result puts in the thread. `listed` is what the rails
 * handed a getTransactions call, by listedKey: the answer keeps the rows it
 * lists, for the app's transaction row.
 */
export const entriesFor = (
  call: ToolCall,
  result: ToolResult<unknown>,
  { stale, listed }: { stale: boolean; listed?: ReadonlyMap<string, ListedTransaction> },
): NewEntry[] => {
  switch (result.kind) {
    case "answer":
      switch (call.intent) {
        case "getBalances":
          return [
            { kind: "balances", payload: result.payload as BalancesProjection, stale },
          ]
        case "getTransactions": {
          const payload = result.payload as TransactionsProjection
          return [
            {
              kind: "transactions",
              payload,
              stale,
              ...(listed ? { listed: listedFor(payload, listed) } : {}),
            },
          ]
        }
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
 * The two rails a getTransactions call reads, each noting the rows it hands
 * the tool, by listedKey. Nothing else changes: each read is the rail's own.
 */
const listingRails = (graphql: GraphqlRail, btcRail: BtcRail) => {
  const listed = new Map<string, ListedTransaction>()
  const listingGraphql: GraphqlRail = {
    ...graphql,
    transactions: async (page) => {
      const result = await graphql.transactions(page)
      result.rows.forEach((transaction) =>
        listed.set(listedKey("graphql", transaction.id), {
          rail: "graphql",
          transaction,
        }),
      )
      return result
    },
  }
  const listingBtcRail: BtcRail = {
    ...btcRail,
    listPayments: async (...args) => {
      const payments = await btcRail.listPayments(...args)
      payments.forEach((payment) =>
        listed.set(listedKey("btc", payment.id), { rail: "btc", payment }),
      )
      return payments
    },
  }
  return { listed, graphql: listingGraphql, btcRail: listingBtcRail }
}

/**
 * Run one call: through runTool, over the cache while offline (and with no
 * action context then, so nothing can be prepared), the network otherwise.
 * What it prepared is held as text-initiated; the result is noted. A
 * history call's rails note the rows they hand the tool, so the answer can
 * draw them with the app's own transaction row.
 */
export const runCall = async (
  runtime: AssistantRuntime,
  call: ToolCall,
  env: TurnEnv,
): Promise<NewEntry[]> => {
  const offline = env.isOffline
  const graphql = offline ? runtime.cachedGraphql : runtime.graphql
  const listing =
    call.intent === "getTransactions" ? listingRails(graphql, runtime.btcRail) : undefined
  const result = await runtime.runTool(call, {
    registry: runtime.registry,
    graphql: listing?.graphql ?? graphql,
    btcRail: listing?.btcRail ?? runtime.btcRail,
    displayCurrency: env.displayCurrency,
    lnAddressHostname: env.lnAddressHostname,
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
  return entriesFor(call, result, { stale: offline, listed: listing?.listed })
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
    // Its example names the account's own currency code, which the grammar
    // and readAmountPhrase read on this account (words.ts, isUnit).
    return [
      {
        kind: "reply",
        replyKey: "Assistant.amountUnclear",
        params: { currency: env.displayCurrency },
      },
    ]
  }
  if (env.isOffline && needsNetwork(match.call)) {
    return [{ kind: "reply", replyKey: "Assistant.actionsOffline" }]
  }
  return runCall(runtime, match.call, env)
}

/**
 * The call a question's pick issues (spec §3, v0.2.12): the same call with
 * the argument the question was about replaced by the option's id
 * (`contact:<username>` for a contact), and only that one. A question names
 * the words it is about, not the argument, and other arguments can hold the
 * same words: "send 5 to bob for bob" has the memo "bob", which a pick must
 * not turn into a contact id that rides the payment as its memo. So the
 * payee is replaced when it is those words, else one payee of a group send
 * (that one, spec §3), else the first argument that is. Undefined when no
 * argument is.
 */
export const reissue = (
  call: ToolCall,
  about: string | undefined,
  optionId: string,
): ToolCall | undefined => {
  if (about === undefined) return undefined
  const args: Record<string, unknown> = { ...(call.args ?? {}) }
  if (args.payee === about) {
    return { intent: call.intent, args: { ...args, payee: optionId } }
  }
  if (Array.isArray(args.payees) && args.payees.includes(about)) {
    const payees = [...args.payees]
    payees[payees.indexOf(about)] = optionId
    return { intent: call.intent, args: { ...args, payees } }
  }
  const key = Object.keys(args).find((name) => args[name] === about)
  return key === undefined
    ? undefined
    : { intent: call.intent, args: { ...args, [key]: optionId } }
}
