import type { AssistantReplyKey, PrepareRefusalReason, ToolResult } from "./types"

// The path a prepare-time refusal takes to the user (spec §5.1,
// "Affordability before a card"). A `prepare` that finds the source wallet
// short, or the payment over a limit, throws PrepareRefusedError from
// wherever the check sits; runTool, and the executor when a silent
// re-prepare is refused, turn it into a templated error card. No confirm
// card is ever built for a payment that would fail after the tap. ENG-688
// supplies the checks, and refuses a payment whose branch is gated on an
// open bug the same way. A payee that names no contact and no Flash user
// (ENG-730) gets the same card, returned by the payee lookup
// (prepareRefusalResult) rather than thrown.

export const PREPARE_REFUSAL_REPLY: Record<PrepareRefusalReason, AssistantReplyKey> = {
  insufficientBalance: "Assistant.insufficientBalance",
  limitExceeded: "Assistant.limitExceeded",
  // A gated branch (ENG-688): the same reply as an intent with no tool.
  notAvailableYet: "Assistant.notYetAvailable",
  // No contact and no Flash user by the payee's words (ENG-730).
  payeeNotFound: "Assistant.payeeNotFound",
}

export class PrepareRefusedError extends Error {
  readonly reason: PrepareRefusalReason

  constructor(reason: PrepareRefusalReason) {
    super(`Prepare refused: ${reason}`)
    this.name = "PrepareRefusedError"
    this.reason = reason
  }
}

/** The templated error card for a refusal. */
export const prepareRefusalResult = (
  reason: PrepareRefusalReason,
): ToolResult<never> => ({
  kind: "error",
  userMessage: PREPARE_REFUSAL_REPLY[reason],
  card: { type: "prepareRefused", reason },
})
