import type { BtcRail } from "@app/payments/btc-rail"
import { cardOf, validateCard } from "../cards/types"
import type { ToolCall } from "../engine/intent-router"
import { ModelTierResult, refusalOf, tryOnDeviceModel } from "../engine/model-tier"
import { report } from "../engine/telemetry"
import { readGrammar } from "../grammar"
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
// reads the utterance; an amount it cannot read is a templated reply, and
// runTool is never called for it. Offline, nothing that needs the network
// runs: no prepare (a send, a request) and no price, which is never
// estimated (spec §4). Reads run against the cache then, and their answers
// carry the stale label. Every tool result is noted for the thread's
// metrics, and every prepared action is held as text-initiated, which the
// auth policy confirms with a tap (spec §5).
//
// Dispatch order (spec §7): the grammar, then, only for what it missed, the
// on-device model (ENG-690, engine/model-tier.ts) where the flags allow it
// (TurnEnv.onDeviceModel), then the server (Phase 5), which does not exist
// yet. A grammar hit, an amount question or a refusal (an ask v1 does not
// serve, which readGrammar in grammar/index.ts names) never waits on the
// model. The model's call goes through runTool as the grammar's does, held
// as text, so the person taps to confirm whatever it prepared; nothing it
// said reaches execute(). No answer from it, or an answer the model tier
// refuses or a guard of it makes none (ENG-751), is the templated miss
// reply, as before. Each utterance reports one `assistant_event`: runTool's
// for a call, else a rejected one whose onDeviceModelAvailable says whether
// the model answered with a call that was refused (its rejection rate) or
// did not answer with one at all, and whose onDeviceModelReason says why a
// call it answered with was refused (refusalOf). A pick, a Try again or a
// Refresh of a card the model prepared re-issues the model's call, and its
// event says so too (CallOrigin).

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
  /**
   * Whether the on-device model may read what the grammar misses: both
   * assistantEnabled and assistantOnDeviceModel are on (ENG-690, architect
   * decision 2). Off, or absent, every miss is the miss reply, as before.
   */
  onDeviceModel?: boolean
}

/** How a call came to run: the on-device model emitted it (ENG-690). */
export type CallOrigin = {
  /** Its event says a model served it (RunToolDeps.servedByOnDeviceModel). */
  servedByOnDeviceModel?: boolean
}

/**
 * The origin of a card's call, for issuing it again: a pick, a Try again or
 * a Refresh of a card the model prepared still runs the model's call.
 */
export const originOf = (entry: CallOrigin): CallOrigin =>
  entry.servedByOnDeviceModel ? { servedByOnDeviceModel: true } : {}

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
 * lists, for the app's transaction row. A card that holds its call holds
 * the call's origin too (CallOrigin), for the calls issued from it.
 */
export const entriesFor = (
  call: ToolCall,
  result: ToolResult<unknown>,
  {
    stale,
    listed,
    servedByOnDeviceModel,
  }: {
    stale: boolean
    listed?: ReadonlyMap<string, ListedTransaction>
  } & CallOrigin,
): NewEntry[] => {
  const origin = originOf({ servedByOnDeviceModel })
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
      return [{ kind: "card", card: cardOf(result.preparedAction), call, ...origin }]
    case "clarification":
      return [{ kind: "card", card: result.card, call, ...origin }]
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
 * draw them with the app's own transaction row. A call the on-device model
 * emitted says so in its event (CallOrigin).
 */
export const runCall = async (
  runtime: AssistantRuntime,
  call: ToolCall,
  env: TurnEnv & CallOrigin,
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
    ...originOf(env),
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
  return entriesFor(call, result, {
    stale: offline,
    listed: listing?.listed,
    ...originOf(env),
  })
}

/** The thread's answer to what the user typed. */
export const answerUtterance = async (
  runtime: AssistantRuntime,
  utterance: string,
  env: TurnEnv,
): Promise<NewEntry[]> => {
  const account = {
    displayCurrency: env.displayCurrency,
    displaySymbol: env.displaySymbol,
  }
  const match = readGrammar(utterance, account)
  if (match === undefined || match.kind === "refused") {
    // Only a miss goes to the model: what the grammar refused (readGrammar
    // names it: an invoice, a question, a send it cannot read) is the v1
    // boundary.
    const model: ModelTierResult =
      env.onDeviceModel && match === undefined
        ? await tryOnDeviceModel(runtime, utterance, account)
        : { kind: "none", reason: "unavailable" }
    if (model.kind === "call") {
      if (env.isOffline && needsNetwork(model.call)) {
        return [{ kind: "reply", replyKey: "Assistant.actionsOffline" }]
      }
      return runCall(runtime, model.call, { ...env, servedByOnDeviceModel: true })
    }
    // A miss is counted as the router counts a call it cannot read, so
    // the grammar's coverage shows in the same event. A call the model tier
    // refused, or a guard made none, carries the intent the model named,
    // the model's flag, and why (ENG-751).
    const refused = refusalOf(model)
    const intent = refused?.intent ?? "unknown"
    report(() =>
      runtime.telemetry.tool({
        intent,
        tier: intent === "unknown" ? "none" : tierOf(intent),
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: refused !== undefined,
        ...(refused ? { onDeviceModelReason: refused.reason } : {}),
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
