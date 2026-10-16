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
//   1. The action must still be held, and armed.
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
 * Where an action stands, as canConfirm reports it (ENG-688). A card renders
 * from this rather than from what it remembers, since a card that remounts
 * (a virtualized thread row, a thread re-render) remembers nothing.
 *
 * - armed, unresolved, disarmed: the executor holds the action in that state
 *   (action-store.ts). Only an armed action's card turns into the expired
 *   card past expiresAt, with Refresh. An unresolved action retries its own
 *   attempt whatever the time, and a disarmed one is never prepared again
 *   (spec §5): their cards keep the retry, or the history notice.
 *   An action the executor dropped (dismissed, evicted, left with its
 *   thread) while a dispatch of its may have gone stays disarmed: its
 *   Confirm can no longer run, and its card offers only the history.
 * - sent: its payment went, in this run of the app.
 * - gone: the executor does not hold it, and nothing of it may have gone:
 *   dismissed, evicted or left before any dispatch, or retired. Preparing
 *   it again makes a new action, which the dispatch journal keeps from
 *   repeating a payment of it that went.
 */
export type ConfirmState = ActionState | "sent" | "gone"

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
 * How many actions canConfirm remembers after they leave the store, as sent
 * or as disarmed: the newest only.
 */
export const RETIRED_ACTIONS_REMEMBERED = 100

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
  // Actions that left the store after their payment went, or while a
  // dispatch of theirs may have gone, oldest first, so a card that remounts
  // still shows what became of its action (canConfirm).
  const retired = new Map<string, "sent" | "disarmed">()

  const remember = (actionId: string, as: "sent" | "disarmed") => {
    retired.delete(actionId)
    retired.set(actionId, as)
    if (retired.size > RETIRED_ACTIONS_REMEMBERED) {
      const [oldest] = retired.keys()
      retired.delete(oldest)
    }
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
      if (!store.get(id)) remember(id, "disarmed")
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
   * executor cannot tell.
   */
  const alreadySent = (actionId: string): ConfirmResult => {
    store.remove(actionId)
    return { kind: "alreadySent", actionId, replyKey: "Assistant.alreadySent" }
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
   */
  const onePerPayment = <T>(
    payment: string | undefined,
    confirm: () => Promise<T>,
  ): Promise<T> => {
    if (payment === undefined) return confirm()
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
    historyChecked: boolean,
  ): Promise<ConfirmResult | undefined> => {
    const payment = paymentOf(action)
    if (payment === undefined) return undefined
    let pending: readonly DispatchRecord[]
    try {
      pending = await deps.journal.pending()
    } catch {
      // Without the journal there is no telling what was sent: fail closed.
      return pendingDispatch(action.id, false)
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
      return pendingDispatch(action.id, false)
    }
    const unsettled: DispatchRecord[] = []
    for (const record of earlier) {
      const verdict = await reconcileSafely(record)
      if (verdict === "settled") {
        await clearRecord(record.preparedActionId)
        return alreadySent(action.id)
      }
      if (verdict === "absent") await clearRecord(record.preparedActionId)
      else unsettled.push(record)
    }
    if (unsettled.length === 0) return undefined
    // The list reads back only so far (RECONCILE_MAX_PAGES), so a dispatch
    // older than the newest hundred payments is never settled by it. Once
    // nothing about it can still be on its way, the user's word that their
    // history does not show the payment clears it. Without that, every later
    // identical payment (rent, payroll) would be refused for good.
    const historyCheckable = unsettled.every(isStale)
    if (!historyCheckable || !historyChecked) {
      return pendingDispatch(action.id, historyCheckable)
    }
    for (const record of unsettled) await clearRecord(record.preparedActionId)
    return undefined
  }

  // Step 4: prepare again past expiry.
  const refreshExpired = async (
    stored: StoredAction,
    startedAt: number,
    claim: (actionId: string) => void,
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
        actionId: action.id,
        replyKey:
          refused && refresh.kind === "error" ? refresh.userMessage : "Assistant.expired",
        refresh,
      }
    }

    const fresh: StoredAction = { action: refresh.preparedAction, origin: stored.origin }
    if (!store.replace(action.id, fresh)) return notFound(action.id)
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
        replacedActionId: action.id,
        preparedAction: fresh.action,
        replyKey: "Assistant.refreshed",
      }
    }
    // The same numbers the user approved: run the fresh action, which is now
    // in flight under its own id too.
    claim(fresh.action.id)
    return fresh
  }

  const freshIfExpired = (
    stored: StoredAction,
    startedAt: number,
    claim: (actionId: string) => void,
  ): Promise<StoredAction | ConfirmResult> | StoredAction => {
    // An unresolved dispatch is retried with its own attempt and key, never
    // re-prepared: a new action would mint a new key for a payment that may
    // already have gone.
    if (!isExpired(stored.action) || store.stateOf(stored.action.id) !== "armed") {
      return stored
    }
    return refreshExpired(stored, startedAt, claim)
  }

  // Step 5: the auth policy, and the gate when it asks for it.
  const authorize = async (
    stored: StoredAction,
    startedAt: number,
    claim: (actionId: string) => void,
  ): Promise<StoredAction | ConfirmResult> => {
    const { action } = stored
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
        actionId: action.id,
        replyKey:
          verdict === "unavailable"
            ? "Assistant.authUnavailable"
            : "Assistant.authDenied",
      }
    }
    // Identical refreshed numbers run without a second prompt: the user just
    // proved it is them for these numbers.
    return freshIfExpired(stored, startedAt, claim)
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
          // retires, and its record keeps what went from going again.
          store.remove(action.id)
          return
        }
        // Let go while its Confirm ran (dismissed, evicted, left): its
        // card can no longer retry it, and must not prepare it again.
        if (!store.get(action.id)) {
          remember(action.id, "disarmed")
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
    // an identical refresh replaced: both went.
    if (outcome.status === "succeeded") {
      remember(requestedId, "sent")
      remember(action.id, "sent")
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
  const confirmQueued = async (
    actionId: string,
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
    // Looked up again: a Confirm this one waited behind may have changed it.
    const held = store.get(actionId)
    if (!held) return notFound(actionId)
    if (store.stateOf(actionId) === "disarmed") {
      return { kind: "disarmed", actionId, replyKey: "Assistant.checkHistory" }
    }
    // A send of the same payment went through while this Confirm waited. It
    // was tapped before that outcome was known, so it does not send again;
    // the reply tells the user to ask again if they meant another payment.
    if (sendsThroughOf(paymentOf(held.action)) > sentBefore) return alreadySent(actionId)

    const blocked = await reconcileGate(held.action, historyChecked)
    if (blocked) return blocked

    const current = await freshIfExpired(held, startedAt, claim)
    if (isResult(current)) return current

    const allowed = await authorize(current, startedAt, claim)
    if (isResult(allowed)) return allowed

    // Dismissed, evicted or left while the prompt was up: nothing runs.
    if (store.get(allowed.action.id)?.action !== allowed.action) {
      return notFound(allowed.action.id)
    }
    return execute(allowed, actionId, startedAt)
  }

  const confirm = async (
    actionId: string,
    claim: (id: string) => void,
    { historyChecked = false }: ConfirmOptions,
  ): Promise<ConfirmResult> => {
    const startedAt = now()
    const held = store.get(actionId)
    if (!held) return notFound(actionId)
    const payment = paymentOf(held.action)
    const sentBefore = sendsThroughOf(payment)
    return onePerPayment(payment, () =>
      confirmQueued(actionId, { startedAt, sentBefore, historyChecked, claim }),
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
    dismiss: (actionId) => letGo([actionId], () => store.remove(actionId)),

    canConfirm: async (actionId) => {
      const held = store.get(actionId)
      if (!held) {
        switch (retired.get(actionId)) {
          case "sent":
            return { enabled: false, state: "sent" }
          case "disarmed":
            return {
              enabled: false,
              state: "disarmed",
              replyKey: "Assistant.checkHistory",
            }
          default:
            return { enabled: false, state: "gone", replyKey: "Assistant.actionNotFound" }
        }
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
      // flight gets the first's promise, and execute() runs once.
      const running = inFlight.get(actionId)
      if (running) return running
      const claimed = [actionId]
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
      inFlight.set(actionId, run)
      return run
    },
  }
}
