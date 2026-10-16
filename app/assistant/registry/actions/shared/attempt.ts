import type { AttemptState } from "@app/payments/send-payment"
import type { LegStatus } from "../../../cards/types"
import { createAttemptState } from "../../../engine/executor"
import type { DispatchResult } from "./outcome"

// The attempt state of a group send's legs (ENG-688 plan, shared/attempt.ts;
// addendum of 2026-10-13). Each leg is its own payment, so each owns one
// AttemptState, made when the group is prepared and handed to every
// dispatch of that leg, a retry's included: a leg whose answer was lost
// retries under its own key, and two legs never share one (ENG-533). The
// key logic itself stays in sendPayment; this only holds the states and
// what each leg's last dispatch did.

export type LegAttempt = {
  readonly attempt: AttemptState
  status: LegStatus
  /** What the leg's last dispatch did; undefined before its first. */
  last?: DispatchResult
}

/** One fresh AttemptState per leg, every leg pending. */
export const createLegAttempts = (count: number): LegAttempt[] =>
  Array.from({ length: count }, () => ({
    attempt: createAttemptState(),
    status: "pending" as const,
  }))

/** A leg's status after a dispatch. */
export const legStatusOf = (result: DispatchResult): LegStatus => {
  switch (result.kind) {
    case "sent":
      return "success"
    case "failed":
      return "failed"
    case "unknown":
      return "unknown"
  }
}
