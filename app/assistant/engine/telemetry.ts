import {
  AssistantEventOutcome,
  AssistantEventParams,
  logAssistantClarificationAbandoned,
  logAssistantEvent,
  logAssistantThreadOpened,
  logSendOpenToConfirm,
} from "@app/utils/analytics"
import type { Intent, Tier } from "../registry/types"

// What the assistant reports (docs/ai-assistant-tool-registry.md §8). Every
// field is a closed union, a number or a boolean, so no memo, payee or amount
// text can reach analytics through these types. The engine is handed an
// AssistantTelemetry rather than calling Firebase, so tests read the events
// directly. The event's parameters are declared in app/utils/analytics.ts,
// which must not import from app/assistant/ (spec §2); the types here narrow
// them to the engine's closed sets.

/**
 * How a tool call or a Confirm ended.
 *
 * - runTool: `answered`, `clarification`, `prepared`, `error` (the tool
 *   failed or refused), `rejected` (the router refused the call).
 * - executePreparedAction: `confirmed`, `failed`, `unknown` (the outcome of
 *   a dispatch is not known), `denied`, `refreshed` (past expiry with changed
 *   numbers: a new card, nothing executed), and `expired`, reported once per
 *   prepared action whose Confirm came after its expiry. Expired events over
 *   prepared events is the expired rate, which past 3% sends the TTLs back
 *   for review (spec §5.1).
 */
export type AssistantOutcome = AssistantEventOutcome

/**
 * One `assistant_event` as the engine reports it: the parameters
 * app/utils/analytics.ts declares, with the intent and tier narrowed to the
 * engine's own closed sets.
 */
export type AssistantToolEvent = Omit<AssistantEventParams, "intent" | "tier"> & {
  /** "unknown" when the router could not read an intent from the call. */
  intent: Intent | "unknown"
  /** "none" when the router could not read an intent from the call. */
  tier: Tier | "none"
}

export type AssistantTelemetry = {
  tool: (event: AssistantToolEvent) => void
  /** A thread was opened: the weekly-active-users count is built from it. */
  threadOpened: () => void
  /** A thread was left with a clarification still unanswered. */
  clarificationAbandoned: (event: { clarificationCount: number }) => void
  /** From thread open to the first confirmed send in it. */
  openToConfirm: (event: { openToConfirmMs: number }) => void
}

/** The production telemetry: Firebase Analytics, through app/utils/analytics.ts. */
export const analyticsTelemetry: AssistantTelemetry = {
  tool: logAssistantEvent,
  threadOpened: logAssistantThreadOpened,
  clarificationAbandoned: logAssistantClarificationAbandoned,
  openToConfirm: ({ openToConfirmMs }) =>
    logSendOpenToConfirm({ flow: "assistant", openToConfirmMs }),
}

/** Report an event; a reporting failure never reaches the reply. */
export const report = (emit: () => void): void => {
  try {
    emit()
  } catch (err) {
    console.warn("[assistant] telemetry failed", err)
  }
}
