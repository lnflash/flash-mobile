import { PaymentSendResult } from "@app/graphql/generated"
import type { AttemptState, SendPaymentOutcome } from "@app/payments/send-payment"
import {
  CHECK_TRANSACTION_HISTORY_MESSAGE,
  UnresolvedAttemptKeyRefusedError,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import type { ExecutionOutcome } from "../../types"

// What one dispatch through sendPayment did, read off its answer and the
// attempt state it leaves (app/payments/send-payment.ts), and what that lets
// the card offer next (spec v0.2.6 §5, the keyless-leg rule).

export type DispatchResult =
  /** Success or Pending: the payment went out, or is on its way. */
  | { kind: "sent" }
  /**
   * Nothing moved, by proof: a Failure sendPayment re-armed on (a resolved
   * Failure, a Breez refusal before dispatch), or an invoice already paid.
   */
  | { kind: "failed"; reason: "paymentFailed" | "alreadyPaid" }
  /**
   * Something may have moved. `sameAttempt`: a keyed GraphQL send whose
   * answer was lost, which a retry under the same key replays. `never`:
   * anything else (a Breez rejection after dispatch, a key reuse answer, a
   * dispatch that went out keyless), which no retry can make safe.
   */
  | { kind: "unknown"; retry: "sameAttempt" | "never" }

/**
 * Run one sendPayment and read what it did. sendPayment leaves its
 * in-flight guard set (Confirm disarmed) whenever it cannot prove nothing
 * moved, and re-arms only on a known failure: the guard decides, and the
 * check-your-history message it answers such cases with is a second guard.
 */
export const dispatchResultOf = async (
  send: () => Promise<SendPaymentOutcome>,
  attempt: AttemptState,
): Promise<DispatchResult> => {
  let outcome: SendPaymentOutcome
  try {
    outcome = await send()
  } catch (err) {
    // A throw is a GraphQL dispatch whose answer never came (sendPayment's
    // Breez branch answers every rejection). Its attempt is kept, key and
    // all, for a retry that the server replays, unless that cannot hold:
    // the key was refused on a retry, or a dispatch went out without it.
    if (err instanceof UnresolvedAttemptKeyRefusedError) {
      return { kind: "unknown", retry: "never" }
    }
    const kept = attempt.attemptRef.current
    if (!kept || kept.wentKeyless) return { kind: "unknown", retry: "never" }
    return { kind: "unknown", retry: "sameAttempt" }
  }

  // The in-flight guard turned this call away: an earlier dispatch of the
  // same attempt is unresolved. Nothing is known about it.
  if (outcome.ignored) return { kind: "unknown", retry: "never" }

  switch (outcome.status) {
    case PaymentSendResult.Success:
    case PaymentSendResult.Pending:
      return { kind: "sent" }
    case PaymentSendResult.AlreadyPaid:
      return { kind: "failed", reason: "alreadyPaid" }
    case PaymentSendResult.Failure:
      if (
        attempt.inFlightRef.current ||
        outcome.errorsMessage === CHECK_TRANSACTION_HISTORY_MESSAGE
      ) {
        return { kind: "unknown", retry: "never" }
      }
      return { kind: "failed", reason: "paymentFailed" }
    default:
      // No status at all: the server's answer says nothing.
      return { kind: "unknown", retry: "never" }
  }
}

/**
 * The executor's outcome for one payment's dispatch result. A known failure
 * of a keyed send may be confirmed again, under a new key, since nothing
 * moved. A keyless send (the BTC rail, an on-chain send) is never retried
 * from its card: a known failure retires the action, so the user prepares a
 * new one, and an unknown outcome disarms the card with the history reply.
 */
export const executionOutcomeOf = (
  result: DispatchResult,
  { keyless }: { keyless: boolean },
): ExecutionOutcome => {
  switch (result.kind) {
    case "sent":
      return { status: "succeeded" }
    case "failed":
      return result.reason === "alreadyPaid"
        ? {
            status: "failed",
            replyKey: "Assistant.invoiceAlreadyPaid",
            next: "reprepare",
          }
        : {
            status: "failed",
            replyKey: "Assistant.paymentFailed",
            next: keyless ? "reprepare" : "confirmAgain",
          }
    case "unknown":
      return {
        status: "unknown",
        replyKey: "Assistant.checkHistory",
        next:
          result.retry === "sameAttempt" && !keyless
            ? "retrySameAttempt"
            : "checkHistory",
      }
  }
}
