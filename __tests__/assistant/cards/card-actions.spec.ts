import { afterConfirm, AfterConfirm } from "@app/assistant/cards/card-actions"
import type { ConfirmResult } from "@app/assistant/engine/executor"

const executed = (outcome: Extract<ConfirmResult, { kind: "executed" }>["outcome"]) =>
  ({ kind: "executed", actionId: "a", outcome } as const)

const TABLE: [string, ConfirmResult, AfterConfirm][] = [
  [
    "a payment that went",
    executed({ status: "succeeded" }),
    { done: true, confirmAgain: false, reprepare: false },
  ],
  [
    "a keyed failure: Confirm again, nothing having moved",
    executed({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "confirmAgain",
    }),
    {
      replyKey: "Assistant.paymentFailed",
      done: false,
      confirmAgain: true,
      reprepare: false,
    },
  ],
  [
    "a refusal before dispatch: try again, as a new action",
    executed({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "reprepare",
    }),
    {
      replyKey: "Assistant.paymentFailed",
      done: false,
      confirmAgain: false,
      reprepare: true,
    },
  ],
  [
    "a lost answer: retry from the card, under the same key",
    executed({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "retrySameAttempt",
    }),
    {
      replyKey: "Assistant.checkHistory",
      done: false,
      confirmAgain: true,
      reprepare: false,
    },
  ],
  [
    "an unknown outcome: disarmed, the history, and no way to prepare it again",
    executed({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    }),
    {
      replyKey: "Assistant.checkHistory",
      done: false,
      confirmAgain: false,
      reprepare: false,
    },
  ],
  [
    "a prompt the user did not pass",
    { kind: "denied", actionId: "a", replyKey: "Assistant.authDenied" },
    {
      replyKey: "Assistant.authDenied",
      done: false,
      confirmAgain: true,
      reprepare: false,
    },
  ],
  [
    "an action that is gone",
    { kind: "notFound", actionId: "a", replyKey: "Assistant.actionNotFound" },
    {
      replyKey: "Assistant.actionNotFound",
      done: false,
      confirmAgain: false,
      reprepare: true,
    },
  ],
  [
    "a disarmed card",
    { kind: "disarmed", actionId: "a", replyKey: "Assistant.checkHistory" },
    {
      replyKey: "Assistant.checkHistory",
      done: false,
      confirmAgain: false,
      reprepare: false,
    },
  ],
  [
    "an earlier dispatch in the way",
    {
      kind: "pendingDispatch",
      actionId: "a",
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    },
    {
      replyKey: "Assistant.checkHistory",
      done: false,
      confirmAgain: false,
      reprepare: false,
    },
  ],
  [
    "a payment already sent",
    { kind: "alreadySent", actionId: "a", replyKey: "Assistant.alreadySent" },
    {
      replyKey: "Assistant.alreadySent",
      done: false,
      confirmAgain: false,
      reprepare: false,
    },
  ],
]

describe("afterConfirm", () => {
  TABLE.forEach(([name, result, expected]) =>
    it(`maps ${name}`, () => {
      expect(afterConfirm(result)).toEqual(expected)
    }),
  )

  it("never offers to prepare again after an outcome where money may have moved", () => {
    TABLE.forEach(([, result]) => {
      const mayHaveMoved =
        (result.kind === "executed" && result.outcome.status === "unknown") ||
        result.kind === "disarmed" ||
        result.kind === "pendingDispatch" ||
        result.kind === "alreadySent"
      if (mayHaveMoved) expect(afterConfirm(result).reprepare).toBe(false)
    })
  })
})
