import type { AttemptState } from "@app/payments/send-payment"
import { prepareRefusalResult, PrepareRefusedError } from "../registry/refusals"
import type {
  AssistantReplyKey,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "../registry/types"
import { createActionStore, MAX_PREPARED_PER_THREAD, StoredAction } from "./action-store"
import type { AttemptJournal, DispatchRecord } from "./attempt-journal"
import type { AuthGate } from "./auth-gate"
import { AuthOrigin, AuthPolicy, authPolicy as defaultAuthPolicy } from "./auth-policy"
import { canonicalJson } from "./canonical-json"
import type { Reconcile, ReconcileVerdict } from "./reconcile"
import { AssistantOutcome, AssistantTelemetry, report } from "./telemetry"
import { createThreadMetrics } from "./thread-metrics"

// The single choke point between a card's Confirm and money moving
// (docs/ai-assistant-tool-registry.md §3, §5, §5.1). For one Confirm, in
// order:
//
//   1. The action must still be held, and armed.
//   2. A dispatch of the same payment whose outcome is unknown, from this run
//      or one the app died in, is reconciled against the transaction list
//      first: settled means "already sent", unknown blocks the attempt.
//   3. Past expiresAt, the action is prepared again from the same inputs.
//      Identical numbers execute without a new card; changed numbers come
//      back as a new card to confirm; nothing ever runs on stale numbers.
//   4. The auth policy decides whether the gate runs; the gate fails closed.
//      Expiry is checked again after the prompt, which can outlast the TTL.
//   5. execute() runs once per action at a time, with the action's own
//      AttemptState and a journal hook it awaits before each dispatch.
//   6. The outcome decides what the card offers next.

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
  | { kind: "pendingDispatch"; actionId: string; replyKey: "Assistant.checkHistory" }
  | { kind: "alreadySent"; actionId: string; replyKey: "Assistant.alreadySent" }

export type CanConfirm =
  | { enabled: true }
  | { enabled: false; replyKey: AssistantReplyKey }

export type Executor = {
  openThread: (threadId: string) => void
  /** Leaving a thread drops its prepared actions. */
  leaveThread: (threadId: string) => void
  /** Every tool result the thread shows, for its metrics. */
  noteToolResult: (threadId: string, result: ToolResult<unknown>) => void
  /** Hold a prepared action. Synchronous; returns the ids it evicted. */
  addPrepared: (action: PreparedAction, origin?: AuthOrigin) => string[]
  /** The card was dismissed: its action goes. */
  dismiss: (actionId: string) => void
  /** Whether Confirm is enabled. The card renders for review either way. */
  canConfirm: (actionId: string) => Promise<CanConfirm>
  executePreparedAction: (actionId: string) => Promise<ConfirmResult>
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

export const createExecutor = (deps: ExecutorDeps): Executor => {
  const now = deps.now ?? Date.now
  const policy = deps.authPolicy ?? defaultAuthPolicy
  const store = createActionStore(deps.maxPreparedPerThread ?? MAX_PREPARED_PER_THREAD)
  const metrics = createThreadMetrics({ now, telemetry: deps.telemetry })
  const inFlight = new Map<string, Promise<ConfirmResult>>()

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

  const isExpired = (action: PreparedAction) => now() >= action.expiresAt

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

  // Step 2: an earlier dispatch of the same payment, unaccounted for.
  const reconcileGate = async (
    action: PreparedAction,
  ): Promise<ConfirmResult | undefined> => {
    const identity = action.dispatch
    if (!identity) return undefined
    let pending: readonly DispatchRecord[]
    try {
      pending = await deps.journal.pending()
    } catch {
      // Without the journal there is no telling what was sent: fail closed.
      return {
        kind: "pendingDispatch",
        actionId: action.id,
        replyKey: "Assistant.checkHistory",
      }
    }
    const earlier = pending.filter(
      (record) =>
        record.paymentDetailHash === identity.paymentDetailHash &&
        record.preparedActionId !== action.id,
    )
    for (const record of earlier) {
      const verdict = await reconcileSafely(record)
      if (verdict === "unknown") {
        return {
          kind: "pendingDispatch",
          actionId: action.id,
          replyKey: "Assistant.checkHistory",
        }
      }
      await clearRecord(record.preparedActionId)
      // Settled or superseded: the earlier action, if still on screen, must
      // not dispatch again.
      store.remove(record.preparedActionId)
      if (verdict === "settled") {
        store.remove(action.id)
        return {
          kind: "alreadySent",
          actionId: action.id,
          replyKey: "Assistant.alreadySent",
        }
      }
    }
    return undefined
  }

  // Step 3: prepare again past expiry.
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
    if (isExpired(fresh.action) || !sameNumbers(action.summary, fresh.action.summary)) {
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

  // Step 4: the auth policy, and the gate when it asks for it.
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
    await deps.journal.record({
      preparedActionId: action.id,
      idempotencyKey,
      paymentDetailHash: action.dispatch.paymentDetailHash,
      dispatchedAt: now(),
      match: action.dispatch.match,
    })
  }

  // Step 6: what the outcome leaves the card able to do.
  const settle = async (action: PreparedAction, outcome: ExecutionOutcome) => {
    switch (outcome.status) {
      case "succeeded":
        store.remove(action.id)
        metrics.confirmed(action.threadId)
        await clearRecord(action.id)
        return
      case "failed":
        // Nothing moved: the record goes, and the card re-arms or retires.
        if (outcome.next === "reprepare") store.remove(action.id)
        else store.setState(action.id, "armed")
        await clearRecord(action.id)
        return
      case "unknown":
        // Something may have moved: the record stays for reconciliation.
        store.setState(
          action.id,
          outcome.next === "retrySameAttempt" ? "unresolved" : "disarmed",
        )
    }
  }

  // Step 5.
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
    reportOutcome(action, TELEMETRY_OUTCOME[outcome.status], startedAt)
    return {
      kind: "executed",
      actionId: action.id,
      ...(action.id === requestedId ? {} : { replacedActionId: requestedId }),
      outcome,
    }
  }

  const confirm = async (
    actionId: string,
    claim: (id: string) => void,
  ): Promise<ConfirmResult> => {
    const startedAt = now()
    const held = store.get(actionId)
    if (!held) return notFound(actionId)
    if (store.stateOf(actionId) === "disarmed") {
      return { kind: "disarmed", actionId, replyKey: "Assistant.checkHistory" }
    }

    const blocked = await reconcileGate(held.action)
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

  return {
    openThread: (threadId) => metrics.open(threadId),
    leaveThread: (threadId) => {
      store.removeThread(threadId)
      metrics.leave(threadId)
    },
    noteToolResult: (threadId, result) => metrics.noteResult(threadId, result),
    addPrepared: (action, origin = "text") => store.add({ action, origin }),
    dismiss: (actionId) => store.remove(actionId),

    canConfirm: async (actionId) => {
      const held = store.get(actionId)
      if (!held) return { enabled: false, replyKey: "Assistant.actionNotFound" }
      if (store.stateOf(actionId) === "disarmed") {
        return { enabled: false, replyKey: "Assistant.checkHistory" }
      }
      if (policy(held.action, held.origin) === "biometric") {
        const availability = await deps.auth.availability().catch(() => "none" as const)
        if (availability === "none") {
          return { enabled: false, replyKey: "Assistant.authUnavailable" }
        }
      }
      return { enabled: true }
    },

    executePreparedAction: (actionId) => {
      // One run per action at a time: a second Confirm while the first is in
      // flight gets the first's promise, and execute() runs once.
      const running = inFlight.get(actionId)
      if (running) return running
      const claimed = [actionId]
      const run: Promise<ConfirmResult> = confirm(actionId, (id) => {
        claimed.push(id)
        inFlight.set(id, run)
      })
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
