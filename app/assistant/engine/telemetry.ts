import {
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
// directly.

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
export type AssistantOutcome =
  | "answered"
  | "clarification"
  | "prepared"
  | "error"
  | "rejected"
  | "confirmed"
  | "failed"
  | "unknown"
  | "denied"
  | "refreshed"
  | "expired"

export type AssistantToolEvent = {
  /** "unknown" when the router could not read an intent from the call. */
  intent: Intent | "unknown"
  /** "none" when the router could not read an intent from the call. */
  tier: Tier | "none"
  outcome: AssistantOutcome
  latencyMs: number
  /** Whether an on-device model served the call. False until Phase 3. */
  onDeviceModelAvailable: boolean
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
