import type { WalletCurrency } from "@app/graphql/generated"
import type { TranslationFunctions } from "@app/i18n/i18n-types"
import type { BtcRail } from "@app/payments/btc-rail"
import type { AttemptState } from "@app/payments/send-payment"
import type { GraphqlRail } from "../rails/graphql-rail"

// The assistant's core contracts (docs/ai-assistant-tool-registry.md §3).

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

/** Tools that answer with data and never move money (spec §4). */
export const READ_INTENTS = [
  "getBalances",
  "getTransactions",
  "getTransactionDetails",
  "resolveContact",
  "getPrice",
  "searchMerchants",
  "getAccountLimits",
  "decodePaymentRequest",
] as const

/** Tools that prepare money movement for a Confirm tap (spec §5). */
export const ACTION_INTENTS = [
  "prepareSend",
  "prepareReceive",
  "prepareGroupSend", // one amount fanned out to several payees
  "prepareConversion",
  "prepareCashout",
] as const

/**
 * Every intent the engine may emit. The set is closed: the router refuses
 * anything else before it reaches a tool.
 */
export const INTENTS = [...READ_INTENTS, ...ACTION_INTENTS] as const

export type ReadIntent = (typeof READ_INTENTS)[number]
export type ActionIntent = (typeof ACTION_INTENTS)[number]
export type Intent = ReadIntent | ActionIntent

export type Tier = "read" | "action"

export const isIntent = (value: unknown): value is Intent =>
  typeof value === "string" && (INTENTS as readonly string[]).includes(value)

export const tierOf = (intent: Intent): Tier =>
  (READ_INTENTS as readonly string[]).includes(intent) ? "read" : "action"

// ---------------------------------------------------------------------------
// Replies and cards
// ---------------------------------------------------------------------------

/**
 * A templated reply: the path of a key in the `Assistant` namespace of the
 * i18n dictionary (app/i18n/en/index.ts). It is never a resolved string,
 * because strings resolve through `useI18nContext().LL`, a hook, in the UI.
 * A path that is not in the dictionary does not type-check.
 */
export type AssistantReplyKey = `Assistant.${keyof TranslationFunctions["Assistant"]}`

export type ClarificationOption = {
  id: string
  label: string
  /** The full username when the option is a Flash user (spec §4, §6). */
  sublabel?: string
}

/**
 * Ambiguous input: a picker, never a guess (spec §3). With no options it
 * asks the user to say it another way.
 */
export type ClarificationCard = {
  type: "clarification"
  prompt: AssistantReplyKey
  options: ClarificationOption[]
}

export type PrepareRefusalReason = "insufficientBalance" | "limitExceeded"

/**
 * The templated error card for an action its `prepare` refused (spec §5.1,
 * "Affordability before a card"): a shortfall or a limit is reported before
 * any confirm card exists. ENG-688 supplies the checks; this card and the
 * path to it (PrepareRefusedError) land with the registry core.
 */
export type PrepareRefusalCard = {
  type: "prepareRefused"
  reason: PrepareRefusalReason
}

export type ToolResult<T> =
  | { kind: "answer"; payload: T }
  | { kind: "prepared"; preparedAction: PreparedAction }
  | { kind: "clarification"; card: ClarificationCard }
  | { kind: "error"; userMessage: AssistantReplyKey; card?: PrepareRefusalCard }

// ---------------------------------------------------------------------------
// Prepared actions
// ---------------------------------------------------------------------------

/** A value a card can show: JSON data only, so summaries compare byte for byte. */
export type SummaryValue =
  | string
  | number
  | boolean
  | null
  | readonly SummaryValue[]
  | { readonly [field: string]: SummaryValue }

/**
 * What the card shows the user to approve: amounts, payee, fees, the source
 * wallet. Past expiry, the executor executes a refreshed action without a new
 * card only when its summary is identical to this one (spec §5.1).
 */
export type ActionSummary = { readonly [field: string]: SummaryValue }

/**
 * How one dispatched payment shows up in the account's transaction list, so
 * a dispatch whose outcome was lost (the app was killed mid-send) can be
 * reconciled after a relaunch (spec §5.1, "Process death"). Each GraphQL
 * kind names an identifier the transaction rows carry. `amount` is in the
 * settlement currency's minor units, unsigned.
 *
 * `btcRail` is a payment the BTC wallet made through Breez (ENG-688). That
 * wallet is self-custodial, so its payments are not in the GraphQL list at
 * all: the list can never show one went, and its absence proves nothing, so
 * reconciling one is always "unknown". A record of one whose outcome was
 * lost therefore blocks the same payment until its day-old record may be
 * cleared on the user's word (executor.ts, `historyChecked`).
 */
export type SingleTransactionMatch =
  | { kind: "lightning"; paymentHash: string }
  | {
      kind: "intraledger"
      counterPartyWalletId: string
      settlementCurrency: WalletCurrency
      amount: number
    }
  | { kind: "onchain"; address: string }
  | { kind: "btcRail" }

/**
 * A dispatched action's payments as the transaction list shows them: one,
 * or, for a group send (ENG-688), every leg it may dispatch, `anyOf`. An
 * action whose list shows any of its legs went is one that sent money.
 */
export type TransactionMatch =
  | SingleTransactionMatch
  | { kind: "anyOf"; matches: readonly SingleTransactionMatch[] }

/**
 * What the dispatch journal needs to know about an action that moves money:
 * a hash of the payment it makes (hashPaymentDetail) and how to find it in
 * the transaction list.
 */
export type DispatchIdentity = {
  paymentDetailHash: string
  match: TransactionMatch
}

/**
 * What an action's execute() learns from the executor on each Confirm.
 *
 * - `attempt` is the action's own AttemptState, the same object on every
 *   Confirm of this action, so a retry after a dropped response reuses its
 *   idempotency key (ENG-533). A refreshed action has a new one.
 * - `journalDispatch` must be awaited immediately before each dispatch, a
 *   retry's included: it persists the dispatch record (a retry moves the
 *   record's lastDispatchedAt), and rejects (so nothing is sent) when it
 *   cannot. journalMutations (engine/attempt-journal.ts) wires it into the
 *   GraphQL triggers.
 */
export type ExecuteContext = {
  attempt: AttemptState
  journalDispatch: (idempotencyKey: string | null) => Promise<void>
}

/**
 * What one Confirm did. The executor follows `next` and keeps no other
 * knowledge of payment rails.
 *
 * - succeeded: the action did what it was for.
 * - failed: nothing moved, by proof (a resolved Failure status, or a refusal
 *   before dispatch). `confirmAgain` keeps the card armed for a new attempt;
 *   `reprepare` retires the action, so a retry starts from a new one.
 * - unknown: something may have moved. `retrySameAttempt` keeps the card
 *   armed and the same AttemptState (a GraphQL send whose response was lost
 *   retries under its key); `checkHistory` disarms the card and sends the
 *   user to their history, with no re-prepare (a keyless send that may have
 *   left, spec v0.2.6).
 */
export type ExecutionOutcome =
  | { status: "succeeded" }
  | { status: "failed"; replyKey: AssistantReplyKey; next: "confirmAgain" | "reprepare" }
  | {
      status: "unknown"
      replyKey: AssistantReplyKey
      next: "retrySameAttempt" | "checkHistory"
    }

export type PreparedAction = {
  /** A uuid; also identifies the action's dispatch record. */
  id: string
  intent: ActionIntent
  threadId: string
  createdAt: number
  /** The shortest-lived input's expiry: a fee probe, a rate, an invoice (spec §5). */
  expiresAt: number
  summary: ActionSummary
  /** Created at prepare time, one per action, reused on every Confirm. */
  attempt: AttemptState
  /** Present on every action that dispatches money. */
  dispatch?: DispatchIdentity
  /** Reachable only through executePreparedAction, which checks expiry first. */
  execute: (ctx: ExecuteContext) => Promise<ExecutionOutcome>
  /** Prepare again from the same inputs: a new action with a new id and AttemptState. */
  refresh: () => Promise<ToolResult<unknown>>
}

// ---------------------------------------------------------------------------
// Tool context
// ---------------------------------------------------------------------------

/** The BTC rail's two reads, and nothing that sends. */
export type BtcReadRail = Pick<BtcRail, "getBalanceSats" | "listPayments">

/**
 * What a read tool is handed. Neither rail in it has a send method, so a read
 * tool cannot move money by construction.
 */
export type ReadToolCtx = {
  graphql: GraphqlRail
  btcRail: BtcReadRail
  /** The account's display currency, as `realtimePrice` takes it ("USD", "JMD"). */
  displayCurrency: string
  /** Epoch milliseconds. */
  now: () => number
}
