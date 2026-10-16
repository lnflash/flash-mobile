import {
  afterConfirm,
  AfterConfirm,
  afterRetirement,
} from "@app/assistant/cards/card-actions"
import type { ConfirmResult, ConfirmState } from "@app/assistant/engine/executor"

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
  [
    "a Confirm of an action whose payment went before it",
    { kind: "sent", actionId: "a" },
    { done: true, confirmAgain: false, reprepare: false },
  ],
  [
    "a Confirm of a group retired with the rest to prepare",
    { kind: "prepareRest", actionId: "a", replyKey: "Assistant.groupSendRestExpired" },
    {
      replyKey: "Assistant.groupSendRestExpired",
      done: false,
      confirmAgain: false,
      reprepare: true,
    },
  ],
]

describe("afterConfirm", () => {
  TABLE.forEach(([name, result, expected]) =>
    it(`maps ${name}`, () => {
      expect(afterConfirm(result)).toEqual(expected)
    }),
  )

  it("offers to prepare the rest of a group whose other legs went, and nothing else (prepareRest)", () => {
    // The group's refresh prepares only the legs that did not go, and
    // refuses while any leg's dispatch may have gone
    // (prepare-group-send.spec.ts): it never prepares what moved again.
    expect(
      afterConfirm(
        executed({
          status: "unknown",
          replyKey: "Assistant.groupSendRestExpired",
          next: "prepareRest",
        }),
      ),
    ).toEqual({
      replyKey: "Assistant.groupSendRestExpired",
      done: false,
      confirmAgain: false,
      reprepare: true,
    })
  })

  it("never offers to prepare again after an outcome where money may have moved", () => {
    TABLE.forEach(([, result]) => {
      const mayHaveMoved =
        (result.kind === "executed" && result.outcome.status === "unknown") ||
        result.kind === "disarmed" ||
        result.kind === "pendingDispatch" ||
        result.kind === "alreadySent" ||
        result.kind === "sent"
      if (mayHaveMoved) expect(afterConfirm(result).reprepare).toBe(false)
    })
  })
})

describe("afterRetirement: what a remounted card offers for an action the executor retired", () => {
  it("offers what the Confirm that retired it left the card offering", () => {
    expect(afterRetirement({ state: "sent" })).toEqual(
      afterConfirm({ kind: "sent", actionId: "a" }),
    )
    expect(
      afterRetirement({ state: "alreadySent", replyKey: "Assistant.alreadySent" }),
    ).toEqual(
      afterConfirm({
        kind: "alreadySent",
        actionId: "a",
        replyKey: "Assistant.alreadySent",
      }),
    )
    expect(
      afterRetirement({
        state: "prepareRest",
        replyKey: "Assistant.groupSendRestExpired",
      }),
    ).toEqual(
      afterConfirm({
        kind: "prepareRest",
        actionId: "a",
        replyKey: "Assistant.groupSendRestExpired",
      }),
    )
  })

  it("leaves an action the executor holds, or has no word of, to canConfirm", () => {
    const states: (ConfirmState | undefined)[] = [
      "armed",
      "unresolved",
      "disarmed",
      "gone",
      undefined,
    ]
    states.forEach((state) => expect(afterRetirement({ state })).toBeUndefined())
  })
})
