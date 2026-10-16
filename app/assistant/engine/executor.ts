import type { AttemptState } from "@app/payments/send-payment"
import { prepareRefusalResult, PrepareRefusedError } from "../registry/refusals"
import type {
  AssistantReplyKey,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "../registry/types"
import {
  ActionState,
  createActionStore,
  MAX_PREPARED_PER_THREAD,
  StoredAction,
} from "./action-store"
import type { AttemptJournal, DispatchRecord } from "./attempt-journal"
import type { AuthGate } from "./auth-gate"
import {
  AuthOrigin,
  AuthPolicy,
  authPolicy as defaultAuthPolicy,
  isAuthOrigin,
} from "./auth-policy"
import { canonicalJson } from "./canonical-json"
import { RECONCILE_STALE_AFTER_MS, Reconcile, ReconcileVerdict } from "./reconcile"
import { AssistantOutcome, AssistantTelemetry, report } from "./telemetry"
import { createThreadMetrics } from "./thread-metrics"

// The single choke point between a card's Confirm and money moving
// (docs/ai-assistant-tool-registry.md §3, §5, §5.1). For one Confirm, in
// order:
//
//   1. The action must still be held, and armed. A card holds the id it was
//      prepared under; an identical refresh (step 4) runs a new action in
//      that id's place, and the card's Confirms, and canConfirm, follow the
//      link to it, so a retry of its dispatch runs under its own
//      AttemptState. An action the executor no longer holds is answered
//      from what became of it (sent, disarmed, already sent, the rest of a
//      group to prepare), never with an offer to prepare again a payment
//      that may have gone.
//   2. Confirms of one payment run one at a time, from here to the outcome.
//      Two actions are one payment when their paymentDetailHash matches,
//      which leaves the memo out (attempt-journal.ts). A Confirm that waited
//      behind a send of its payment which went through is answered "already
//      sent": it was given before that outcome was known. The reply claims
//      only what the executor knows, that a payment of this amount to this
//      recipient went, not that this card's did.
//   3. A dispatch of the same payment whose outcome is unknown blocks the
//      attempt. While this run still holds that dispatch's action, the
//      action's own card is the way to retry it, under its own key, and its
//      record is not reconciled. Once the action is gone (a relaunch, an
//      eviction, a thread left), the record is reconciled against the
//      transaction list: settled means "already sent", absent lets the
//      attempt through, unknown blocks it. A day-old record the list cannot
//      settle may be cleared on the user's word that their history does not
//      show the payment.
//   4. Past expiresAt, the action is prepared again from the same inputs.
//      Identical numbers for the same payment execute without a new card;
//      anything else comes back as a new card to confirm; nothing ever runs
//      on stale numbers.
//   5. The auth policy decides whether the gate runs; the gate fails closed.
//      Expiry is checked again after the prompt, which can outlast the TTL.
//   6. execute() runs once per action at a time, with the action's own
//      AttemptState and a journal hook it awaits before each dispatch.
//   7. The outcome decides what the card offers next.

/** One Confirm's result, for the card to render. */
export type ConfirmResult =
  | {
      kind: "executed"
      actionId: string
      /** Set when expiry swapped the action for an identical refreshed one. */
      replacedActionId?: string
      outcome: ExecutionOutcome
    }
  | {
      kind: "refreshed"
      /** The new action, whose card replaces the old one's. */
      actionId: string
      replacedActionId: string
      preparedAction: PreparedAction
      replyKey: "Assistant.refreshed"
    }
  | {
      kind: "expired"
      actionId: string
      replyKey: AssistantReplyKey
      /** What preparing again answered: a refusal card, an error, a question. */
      refresh: ToolResult<unknown>
    }
  | {
      kind: "denied"
      actionId: string
      replyKey: "Assistant.authUnavailable" | "Assistant.authDenied"
    }
  | { kind: "notFound"; actionId: string; replyKey: "Assistant.actionNotFound" }
  | { kind: "disarmed"; actionId: string; replyKey: "Assistant.checkHistory" }
  | {
      kind: "pendingDispatch"
      actionId: string
      replyKey: "Assistant.checkHistory"
      /**
       * True when every dispatch in the way is at least
       * RECONCILE_STALE_AFTER_MS old and the transaction list could not
       * settle it. The card may then offer "I checked my history": a Confirm
       * with `historyChecked` clears those dispatches and sends.
       */
      historyCheckable: boolean
    }
  | {
      /**
       * A payment of this amount to this recipient, from this wallet, was
       * already sent: this Confirm waited behind it, or the transaction list
       * shows it. The action is retired; asking again prepares a new one.
       */
      kind: "alreadySent"
      actionId: string
      replyKey: "Assistant.alreadySent"
    }
  | {
      /**
       * The action's payment went before this Confirm (a second tap, or a
       * card that remounted): nothing ran, and there is nothing to offer.
       */
      kind: "sent"
      actionId: string
    }
  | {
      /**
       * The action retired with part of what it owed sent and the rest a new
       * action's (an outcome whose `next` was prepareRest): nothing ran. The
       * card may prepare the rest, which the action's refresh() limits to
       * what did not go.
       */
      kind: "prepareRest"
      actionId: string
      replyKey: AssistantReplyKey
    }

export type ConfirmOptions = {
  /**
   * The user checked their transaction history and the payment is not in
   * it. This clears only dispatches a pendingDispatch result called
   * historyCheckable; a younger one, or one whose action this run still
   * holds, blocks as before.
   */
  historyChecked?: boolean
}

/**
 * What the executor remembers of an action after it leaves the store, so
 * that its card, remounted or still on screen, offers what became of it.
 *
 * - sent: its payment went, in this run of the app.
 * - disarmed: it was let go (dismissed, evicted, left with its thread)
 *   while a dispatch of its may have gone. Its Confirm can no longer run,
 *   and its card offers only the history (spec §5).
 * - alreadySent: it was retired because a payment of this amount to this
 *   recipient went, from another card or as the list shows (spec §5.1). Its
 *   card keeps that reply, and offers no Refresh.
 * - prepareRest: part of what it owed went and the rest is a new action's
 *   (ExecutionOutcome `prepareRest`). Its card offers to prepare the rest.
 */
type Retirement =
  | { state: "sent" }
  | { state: "disarmed"; replyKey: "Assistant.checkHistory" }
  | { state: "alreadySent"; replyKey: "Assistant.alreadySent" }
  | { state: "prepareRest"; replyKey: AssistantReplyKey }

/**
 * Where an action stands, as canConfirm reports it (ENG-688). A card renders
 * from this rather than from what it remembers, since a card that remounts
 * (a virtualized thread row, a thread re-render) remembers nothing.
 *
 * - armed, unresolved, disarmed: the executor holds the action in that state
 *   (action-store.ts). Only an armed action's card turns into the expired
 *   card past expiresAt, with Refresh. An unresolved action retries its own
 *   attempt whatever the time, and a disarmed one is never prepared again
 *   (spec §5): their cards keep the retry, or the history notice.
 * - sent, disarmed, alreadySent, prepareRest: the executor no longer holds
 *   the action, and remembers what became of it (Retirement).
 * - gone: the executor does not hold it, and nothing of it may have gone:
 *   dismissed, evicted or left before any dispatch, or retired after a
 *   failure that moved nothing. Preparing it again makes a new action, which
 *   the dispatch journal keeps from repeating a payment of it that went.
 *
 * An id that an identical refresh replaced reports the state of the action
 * that runs in its place.
 */
export type ConfirmState = ActionState | Retirement["state"] | "gone"

export type CanConfirm = {
  /** Whether Confirm would run now. */
  enabled: boolean
  state: ConfirmState
  /**
   * Why Confirm is off, or, for an unresolved or disarmed action, what its
   * last Confirm left the card saying.
   */
  replyKey?: AssistantReplyKey
}

/**
 * How many actions canConfirm remembers after they leave the store (a
 * Retirement), and how many ids an identical refresh replaced it links to
 * the action that runs in their place: the newest only, of each.
 */
export const RETIRED_ACTIONS_REMEMBERED = 100

/** Hold `key` as the newest entry of a map kept to its RETIRED_ACTIONS_REMEMBERED newest. */
const keepNewest = <V>(map: Map<string, V>, key: string, value: V) => {
  map.delete(key)
  map.set(key, value)
  if (map.size > RETIRED_ACTIONS_REMEMBERED) {
    const [oldest] = map.keys()
    map.delete(oldest)
  }
}

/** One Confirm, as the steps after the queue need it. */
type Confirming = {
  /** The id the card holds, which its result carries. */
  requestedId: string
  startedAt: number
  /** Mark another action as in flight under this Confirm. */
  claim: (actionId: string) => void
}

export type Executor = {
  openThread: (threadId: string) => void
  /** Leaving a thread drops its prepared actions. */
  leaveThread: (threadId: string) => void
  /** Every tool result the thread shows, for its metrics. */
  noteToolResult: (threadId: string, result: ToolResult<unknown>) => void
  /**
   * Hold a prepared action. Synchronous; returns the ids it evicted. The
   * origin decides the auth policy, so it has no default, and an action
   * whose origin is not "text" or "voice" is refused with a throw.
   */
  addPrepared: (action: PreparedAction, origin: AuthOrigin) => string[]
  /** The card was dismissed: its action goes. */
  dismiss: (actionId: string) => void
  /** Whether Confirm is enabled. The card renders for review either way. */
  canConfirm: (actionId: string) => Promise<CanConfirm>
  /**
   * The card's Confirm. A second call while the first is running gets the
   * first's result, whatever options it passed.
   */
  executePreparedAction: (
    actionId: string,
    options?: ConfirmOptions,
  ) => Promise<ConfirmResult>
}

export type ExecutorDeps = {
  auth: AuthGate
  journal: AttemptJournal
  reconcile: Reconcile
  telemetry: AssistantTelemetry
  authPolicy?: AuthPolicy
  /** Epoch milliseconds. */
  now?: () => number
  maxPreparedPerThread?: number
}

/**
 * A fresh AttemptState: one per prepared action, created when it is
 * prepared and handed to every Confirm of it (ENG-533). A refreshed action
 * gets a new one, since its amounts may differ.
 */
export const createAttemptState = (): AttemptState => ({
  inFlightRef: { current: false },
  attemptRef: { current: null },
  // Whether the card is armed is the executor's to say, not React's.
  setHasAttemptedSend: () => undefined,
})

const TELEMETRY_OUTCOME: Record<ExecutionOutcome["status"], AssistantOutcome> = {
  succeeded: "confirmed",
  failed: "failed",
  unknown: "unknown",
}

/** An outcome execute() could not report: assume something may have moved. */
const UNREPORTED_OUTCOME: ExecutionOutcome = {
  status: "unknown",
  replyKey: "Assistant.checkHistory",
  next: "checkHistory",
}

const isResult = (value: StoredAction | ConfirmResult): value is ConfirmResult =>
  "kind" in value

/** Whether two summaries show the user the same numbers, byte for byte. */
const sameNumbers = (approved: unknown, refreshed: unknown): boolean => {
  try {
    return canonicalJson(approved) === canonicalJson(refreshed)
  } catch {
    return false
  }
}

/** The payment an action makes, as the journal and the per-payment queue know it. */
const paymentOf = (action: PreparedAction): string | undefined =>
  action.dispatch?.paymentDetailHash

export const createExecutor = (deps: ExecutorDeps): Executor => {
  const now = deps.now ?? Date.now
  const policy = deps.authPolicy ?? defaultAuthPolicy
  const store = createActionStore(deps.maxPreparedPerThread ?? MAX_PREPARED_PER_THREAD)
  const metrics = createThreadMetrics({ now, telemetry: deps.telemetry })
  const inFlight = new Map<string, Promise<ConfirmResult>>()
  // Step 2: for each payment, the tail of its queue of Confirms, and how
  // many of its sends have gone through in this run of the app.
  const paymentQueues = new Map<string, Promise<void>>()
  const sendsThrough = new Map<string, number>()
  // Actions that left the store with something to say about them, oldest
  // first, so a card, remounted or not, still shows what became of its
  // action (canConfirm), and its Confirm answers with it.
  const retired = new Map<string, Retirement>()
  // Ids an identical refresh replaced, each with the id of the action that
  // runs in its place (refreshExpired), oldest first.
  const replacedBy = new Map<string, string>()

  const remember = (actionId: string, retirement: Retirement) =>
    keepNewest(retired, actionId, retirement)

  /**
   * The action that answers for an id now: the id itself, or the action an
   * identical refresh ran in its place, followed to the newest. Each link
   * points to a newer action, so the walk ends; the bound only caps it.
   */
  const current = (actionId: string): string => {
    let id = actionId
    for (let hops = 0; hops < RETIRED_ACTIONS_REMEMBERED; hops += 1) {
      const next = replacedBy.get(id)
      if (next === undefined) return id
      id = next
    }
    return id
  }

  /**
   * Drop actions the user let go of (dismissed, evicted, left with their
   * thread): one whose dispatch may have gone is remembered as disarmed,
   * since its card must never offer to prepare it again (spec §5).
   */
  const letGo = (actionIds: readonly string[], drop: () => void) => {
    const unresolved = actionIds.filter((id) => {
      const state = store.stateOf(id)
      return state === "unresolved" || state === "disarmed"
    })
    drop()
    unresolved.forEach((id) => {
      if (!store.get(id)) {
        remember(id, { state: "disarmed", replyKey: "Assistant.checkHistory" })
      }
    })
  }

  const sendsThroughOf = (payment: string | undefined): number =>
    payment === undefined ? 0 : sendsThrough.get(payment) ?? 0

  const reportOutcome = (
    action: PreparedAction,
    outcome: AssistantOutcome,
    startedAt: number,
  ) =>
    report(() =>
      deps.telemetry.tool({
        intent: action.intent,
        tier: "action",
        outcome,
        latencyMs: now() - startedAt,
        onDeviceModelAvailable: false,
      }),
    )

  const notFound = (actionId: string): ConfirmResult => ({
    kind: "notFound",
    actionId,
    replyKey: "Assistant.actionNotFound",
  })

  const pendingDispatch = (
    actionId: string,
    historyCheckable: boolean,
  ): ConfirmResult => ({
    kind: "pendingDispatch",
    actionId,
    replyKey: "Assistant.checkHistory",
    historyCheckable,
  })

  /**
   * The same payment already went: the action is retired, and its card says
   * a payment of this amount to this recipient was sent. It does not say this
   * card's payment was: the memo is not part of a payment's identity, so the
   * executor cannot tell. Its card keeps that reply, remounted or not, and
   * offers no Refresh: the payment it would prepare again went.
   */
  const alreadySent = (actionId: string, requestedId: string): ConfirmResult => {
    store.remove(actionId)
    const retirement = {
      state: "alreadySent",
      replyKey: "Assistant.alreadySent",
    } as const
    remember(actionId, retirement)
    remember(requestedId, retirement)
    return {
      kind: "alreadySent",
      actionId: requestedId,
      replyKey: "Assistant.alreadySent",
    }
  }

  /**
   * A Confirm of an action the store no longer holds: what became of it, as
   * canConfirm reports it. Only an action that left with nothing that may
   * have moved is notFound, which a card answers with an offer to prepare it
   * again.
   */
  const answerRetired = (actionId: string, requestedId: string): ConfirmResult => {
    const retirement = retired.get(actionId) ?? retired.get(requestedId)
    switch (retirement?.state) {
      case "sent":
        return { kind: "sent", actionId: requestedId }
      case "disarmed":
        return { kind: "disarmed", actionId: requestedId, replyKey: retirement.replyKey }
      case "alreadySent":
        return {
          kind: "alreadySent",
          actionId: requestedId,
          replyKey: retirement.replyKey,
        }
      case "prepareRest":
        return {
          kind: "prepareRest",
          actionId: requestedId,
          replyKey: retirement.replyKey,
        }
      default:
        return notFound(requestedId)
    }
  }

  const isExpired = (action: PreparedAction) => now() >= action.expiresAt

  /** Whether this run still holds an action, or has a Confirm of it running or queued. */
  const isLive = (actionId: string) =>
    store.get(actionId) !== undefined || inFlight.has(actionId)

  /** Whether nothing about a dispatch can still be on its way. */
  const isStale = (record: DispatchRecord) =>
    now() - record.lastDispatchedAt >= RECONCILE_STALE_AFTER_MS

  /**
   * Step 2. Run `confirm` once every earlier Confirm of the same payment has
   * settled, so its gate reads the journal after their dispatches were
   * written down or crossed off. Two cards for one payment confirmed
   * together would otherwise both read a journal without the other's
   * dispatch, and both send. An action that moves no money has no payment
   * and does not queue.
   *
   * Either way `confirm` starts on a later microtask, never inside this
   * call: it may claim an action as in flight (Confirming.claim) before its
   * first await, and a claim needs the run it belongs to, which
   * executePreparedAction has only once this call has returned.
   */
  const onePerPayment = <T>(
    payment: string | undefined,
    confirm: () => Promise<T>,
  ): Promise<T> => {
    if (payment === undefined) return Promise.resolve().then(confirm)
    const ahead = paymentQueues.get(payment) ?? Promise.resolve()
    const result = ahead.then(confirm)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    paymentQueues.set(payment, settled)
    settled.then(() => {
      if (paymentQueues.get(payment) === settled) paymentQueues.delete(payment)
    })
    return result
  }

  const clearRecord = async (preparedActionId: string) => {
    try {
      await deps.journal.clear(preparedActionId)
    } catch (err) {
      // A record left behind is reconciled before its payment is attempted
      // again; it cannot cause a second send.
      console.warn("[assistant] could not clear a dispatch record", err)
    }
  }

  const reconcileSafely = async (record: DispatchRecord): Promise<ReconcileVerdict> => {
    try {
      return await deps.reconcile(record)
    } catch {
      return "unknown"
    }
  }

  // Step 3: earlier dispatches of the same payment, unaccounted for.
  const reconcileGate = async (
    action: PreparedAction,
    requestedId: string,
    historyChecked: boolean,
  ): Promise<ConfirmResult | undefined> => {
    const payment = paymentOf(action)
    if (payment === undefined) return undefined
    let pending: readonly DispatchRecord[]
    try {
      pending = await deps.journal.pending()
    } catch {
      // Without the journal there is no telling what was sent: fail closed.
      return pendingDispatch(requestedId, false)
    }
    const earlier = pending.filter(
      (record) =>
        record.paymentDetailHash === payment && record.preparedActionId !== action.id,
    )
    // An earlier action this run still holds, or is confirming, is retried
    // from its own card under its own key, never by a new action under a new
    // one (spec §5, "Idempotency"). Its record is not reconciled meanwhile:
    // a retry of it can land after any read of the list, and the payment
    // would then go twice.
    if (earlier.some(({ preparedActionId }) => isLive(preparedActionId))) {
      return pendingDispatch(requestedId, false)
    }
    const unsettled: DispatchRecord[] = []
    for (const record of earlier) {
      const verdict = await reconcileSafely(record)
      if (verdict === "settled") {
        await clearRecord(record.preparedActionId)
        return alreadySent(action.id, requestedId)
      }
      if (verdict === "absent") await clearRecord(record.preparedActionId)
      else unsettled.push(record)
    }
    if (unsettled.length === 0) return undefined
    // The list reads back only so far (each wallet's newest
    // RECONCILE_PAGE_SIZE rows, reconcile.ts), so a dispatch older than those
    // is never settled by it. Once nothing about it can still be on its way,
    // the user's word that their history does not show the payment clears
    // it. Without that, every later identical payment (rent, payroll) would
    // be refused for good.
    const historyCheckable = unsettled.every(isStale)
    if (!historyCheckable || !historyChecked) {
      return pendingDispatch(requestedId, historyCheckable)
    }
    for (const record of unsettled) await clearRecord(record.preparedActionId)
    return undefined
  }

  // Step 4: prepare again past expiry.
  const refreshExpired = async (
    stored: StoredAction,
    { requestedId, startedAt, claim }: Confirming,
  ): Promise<StoredAction | ConfirmResult> => {
    const { action } = stored
    // The expired rate per prepared action counts each action once.
    if (store.firstExpiry(action.id)) reportOutcome(action, "expired", startedAt)

    let refresh: ToolResult<unknown>
    try {
      refresh = await action.refresh()
    } catch (err) {
      refresh =
        err instanceof PrepareRefusedError
          ? prepareRefusalResult(err.reason)
          : { kind: "error", userMessage: "Assistant.toolFailed" }
    }

    if (refresh.kind !== "prepared") {
      const refused = refresh.kind === "error" && refresh.card !== undefined
      // A refusal (now short, or over a limit) or a question ends the action.
      // A failed refresh leaves it, expired, for another try.
      if (refused || refresh.kind === "clarification") store.remove(action.id)
      return {
        kind: "expired",
        actionId: requestedId,
        replyKey:
          refused && refresh.kind === "error" ? refresh.userMessage : "Assistant.expired",
        refresh,
      }
    }

    const fresh: StoredAction = { action: refresh.preparedAction, origin: stored.origin }
    if (!store.replace(action.id, fresh)) return notFound(requestedId)
    if (
      isExpired(fresh.action) ||
      !sameNumbers(action.summary, fresh.action.summary) ||
      // The approved card's payment is the one this Confirm queued and was
      // gated for. A refreshed action that makes another is shown, not run.
      paymentOf(fresh.action) !== paymentOf(action)
    ) {
      reportOutcome(action, "refreshed", startedAt)
      return {
        kind: "refreshed",
        actionId: fresh.action.id,
        replacedActionId: requestedId,
        preparedAction: fresh.action,
        replyKey: "Assistant.refreshed",
      }
    }
    // The same numbers the user approved: run the fresh action, which is now
    // in flight under its own id too. It runs in the old one's place from
    // here on: the card still holds the old id, and its next Confirm, and
    // canConfirm, follow this link to the fresh action, so a retry of the
    // fresh one's dispatch runs under its AttemptState and its key.
    keepNewest(replacedBy, action.id, fresh.action.id)
    claim(fresh.action.id)
    return fresh
  }

  const freshIfExpired = (
    stored: StoredAction,
    confirming: Confirming,
  ): Promise<StoredAction | ConfirmResult> | StoredAction => {
    // An unresolved dispatch is retried with its own attempt and key, never
    // re-prepared: a new action would mint a new key for a payment that may
    // already have gone.
    if (!isExpired(stored.action) || store.stateOf(stored.action.id) !== "armed") {
      return stored
    }
    return refreshExpired(stored, confirming)
  }

  // Step 5: the auth policy, and the gate when it asks for it.
  const authorize = async (
    stored: StoredAction,
    confirming: Confirming,
  ): Promise<StoredAction | ConfirmResult> => {
    const { action } = stored
    const { requestedId, startedAt } = confirming
    if (policy(action, stored.origin) !== "biometric") return stored
    let verdict: "unavailable" | "denied" | "allowed"
    try {
      if ((await deps.auth.availability()) === "none") verdict = "unavailable"
      else verdict = (await deps.auth.authenticate()) ? "allowed" : "denied"
    } catch {
      verdict = "unavailable"
    }
    if (verdict !== "allowed") {
      reportOutcome(action, "denied", startedAt)
      return {
        kind: "denied",
        actionId: requestedId,
        replyKey:
          verdict === "unavailable"
            ? "Assistant.authUnavailable"
            : "Assistant.authDenied",
      }
    }
    // Identical refreshed numbers run without a second prompt: the user just
    // proved it is them for these numbers.
    return freshIfExpired(stored, confirming)
  }

  const journalDispatch = async (
    action: PreparedAction,
    idempotencyKey: string | null,
  ) => {
    if (!action.dispatch) {
      throw new Error(`${action.intent} dispatched a payment with no dispatch identity`)
    }
    const dispatchedAt = now()
    // A retry's write keeps the record's first dispatch and moves its
    // lastDispatchedAt to now (attempt-journal.ts).
    await deps.journal.record({
      preparedActionId: action.id,
      idempotencyKey,
      paymentDetailHash: action.dispatch.paymentDetailHash,
      dispatchedAt,
      lastDispatchedAt: dispatchedAt,
      match: action.dispatch.match,
    })
  }

  // Step 7: what the outcome leaves the card able to do.
  const settle = async (action: PreparedAction, outcome: ExecutionOutcome) => {
    switch (outcome.status) {
      case "succeeded": {
        store.remove(action.id)
        metrics.confirmed(action.threadId)
        const payment = paymentOf(action)
        if (payment !== undefined) sendsThrough.set(payment, sendsThroughOf(payment) + 1)
        await clearRecord(action.id)
        return
      }
      case "failed":
        // Nothing moved: the record goes, and the card re-arms or retires.
        if (outcome.next === "reprepare") store.remove(action.id)
        else store.setState(action.id, "armed")
        await clearRecord(action.id)
        return
      case "unknown":
        // Something may have moved: the record stays for reconciliation.
        if (outcome.next === "prepareRest") {
          // What went is done and the rest is a new action's: this one
          // retires, and its record keeps what went from going again. Its
          // card, remounted or not, still offers to prepare the rest.
          store.remove(action.id)
          remember(action.id, { state: "prepareRest", replyKey: outcome.replyKey })
          return
        }
        // Let go while its Confirm ran (dismissed, evicted, left): its
        // card can no longer retry it, and must not prepare it again.
        if (!store.get(action.id)) {
          remember(action.id, { state: "disarmed", replyKey: "Assistant.checkHistory" })
          return
        }
        store.setState(
          action.id,
          outcome.next === "retrySameAttempt" ? "unresolved" : "disarmed",
          outcome.replyKey,
        )
    }
  }

  // Step 6.
  const execute = async (
    stored: StoredAction,
    requestedId: string,
    startedAt: number,
  ): Promise<ConfirmResult> => {
    const { action } = stored
    let outcome: ExecutionOutcome
    try {
      outcome = await action.execute({
        attempt: action.attempt,
        journalDispatch: (idempotencyKey) => journalDispatch(action, idempotencyKey),
      })
    } catch (err) {
      // execute() turns every answer a rail gives into an outcome. A throw
      // means it could not tell what happened.
      console.warn("[assistant] execute() threw", err)
      outcome = UNREPORTED_OUTCOME
    }
    await settle(action, outcome)
    // The card that was confirmed holds the id it was prepared under, which
    // an identical refresh replaced: what became of the action that ran is
    // remembered under both.
    if (outcome.status === "succeeded") {
      remember(requestedId, { state: "sent" })
      remember(action.id, { state: "sent" })
    } else {
      const retirement = retired.get(action.id)
      if (retirement && !store.get(action.id)) remember(requestedId, retirement)
    }
    reportOutcome(action, TELEMETRY_OUTCOME[outcome.status], startedAt)
    return {
      kind: "executed",
      actionId: action.id,
      ...(action.id === requestedId ? {} : { replacedActionId: requestedId }),
      outcome,
    }
  }

  // Steps 1 and 3 to 7, with this payment's earlier Confirms settled.
  // `requestedId` is the id the card holds; the action that answers for it
  // may be a newer one (current).
  const confirmQueued = async (
    requestedId: string,
    {
      startedAt,
      sentBefore,
      historyChecked,
      claim,
    }: {
      startedAt: number
      /** sendsThroughOf the action's payment when Confirm was tapped. */
      sentBefore: number
      historyChecked: boolean
      claim: (id: string) => void
    },
  ): Promise<ConfirmResult> => {
    // Looked up again: a Confirm this one waited behind may have changed it,
    // replaced it by an identical refresh, or retired it.
    const actionId = current(requestedId)
    const held = store.get(actionId)
    if (!held) return answerRetired(actionId, requestedId)
    if (actionId !== requestedId) claim(actionId)
    if (store.stateOf(actionId) === "disarmed") {
      return {
        kind: "disarmed",
        actionId: requestedId,
        replyKey: "Assistant.checkHistory",
      }
    }
    // A send of the same payment went through while this Confirm waited. It
    // was tapped before that outcome was known, so it does not send again;
    // the reply tells the user to ask again if they meant another payment.
    if (sendsThroughOf(paymentOf(held.action)) > sentBefore) {
      return alreadySent(actionId, requestedId)
    }

    const blocked = await reconcileGate(held.action, requestedId, historyChecked)
    if (blocked) return blocked

    const confirming: Confirming = { requestedId, startedAt, claim }
    const fresh = await freshIfExpired(held, confirming)
    if (isResult(fresh)) return fresh

    const allowed = await authorize(fresh, confirming)
    if (isResult(allowed)) return allowed

    // Dismissed, evicted or left while the prompt was up: nothing runs.
    if (store.get(allowed.action.id)?.action !== allowed.action) {
      return answerRetired(allowed.action.id, requestedId)
    }
    return execute(allowed, requestedId, startedAt)
  }

  const confirm = async (
    requestedId: string,
    claim: (id: string) => void,
    { historyChecked = false }: ConfirmOptions,
  ): Promise<ConfirmResult> => {
    const startedAt = now()
    const actionId = current(requestedId)
    const held = store.get(actionId)
    if (!held) return answerRetired(actionId, requestedId)
    const payment = paymentOf(held.action)
    const sentBefore = sendsThroughOf(payment)
    return onePerPayment(payment, () =>
      confirmQueued(requestedId, { startedAt, sentBefore, historyChecked, claim }),
    )
  }

  return {
    openThread: (threadId) => metrics.open(threadId),
    leaveThread: (threadId) => {
      letGo(store.idsOf(threadId), () => store.removeThread(threadId))
      metrics.leave(threadId)
    },
    noteToolResult: (threadId, result) => metrics.noteResult(threadId, result),
    addPrepared: (action, origin) => {
      // The type requires an origin; this holds untyped callers to it too.
      // The origin is what the auth policy decides on, so an action must
      // never be held under a guessed one.
      if (!isAuthOrigin(origin)) {
        throw new Error(
          `addPrepared needs the action's origin, "text" or "voice"; got ${String(
            origin,
          )}`,
        )
      }
      let evicted: string[] = []
      letGo(store.idsOf(action.threadId), () => {
        evicted = store.add({ action, origin })
      })
      return evicted
    },
    dismiss: (cardId) => {
      // The card's id, or the action an identical refresh ran in its place.
      const actionId = current(cardId)
      letGo([actionId], () => store.remove(actionId))
    },

    canConfirm: async (cardId) => {
      // The action that answers for the card now (an identical refresh may
      // have replaced the one it was prepared under).
      const actionId = current(cardId)
      const held = store.get(actionId)
      if (!held) {
        const retirement = retired.get(actionId) ?? retired.get(cardId)
        if (retirement) return { enabled: false, ...retirement }
        return { enabled: false, state: "gone", replyKey: "Assistant.actionNotFound" }
      }
      const state = store.stateOf(actionId) ?? "armed"
      const reply = store.replyOf(actionId)
      if (state === "disarmed") {
        return { enabled: false, state, replyKey: reply ?? "Assistant.checkHistory" }
      }
      if (policy(held.action, held.origin) === "biometric") {
        const availability = await deps.auth.availability().catch(() => "none" as const)
        if (availability === "none") {
          return { enabled: false, state, replyKey: "Assistant.authUnavailable" }
        }
      }
      // A lost answer: Confirm retries it, and the card says why.
      if (state === "unresolved") {
        return { enabled: true, state, replyKey: reply ?? "Assistant.checkHistory" }
      }
      return { enabled: true, state }
    },

    executePreparedAction: (actionId, options = {}) => {
      // One run per action at a time: a second Confirm while the first is in
      // flight gets the first's promise, and execute() runs once. A card
      // whose id an identical refresh replaced joins a run of the action
      // that runs in its place.
      const target = current(actionId)
      const running = inFlight.get(actionId) ?? inFlight.get(target)
      if (running) return running
      const claimed = target === actionId ? [actionId] : [actionId, target]
      const run: Promise<ConfirmResult> = confirm(
        actionId,
        (id) => {
          claimed.push(id)
          inFlight.set(id, run)
        },
        options,
      )
        .catch((err): ConfirmResult => {
          // Nothing above should throw. If something does, the outcome is not
          // known, so the action is disarmed rather than left to be retried.
          console.warn("[assistant] Confirm failed", err)
          claimed.forEach((id) => store.setState(id, "disarmed"))
          return { kind: "disarmed", actionId, replyKey: "Assistant.checkHistory" }
        })
        .finally(() => claimed.forEach((id) => inFlight.delete(id)))
      claimed.forEach((id) => inFlight.set(id, run))
      return run
    },
  }
}
