import { createAttemptState } from "@app/assistant/engine/executor"
import {
  DispatchResult,
  dispatchResultOf,
  executionOutcomeOf,
} from "@app/assistant/registry/actions/shared/outcome"
import { PaymentSendResult } from "@app/graphql/generated"
import type { AttemptState, SendPaymentOutcome } from "@app/payments/send-payment"
import {
  CHECK_TRANSACTION_HISTORY_MESSAGE,
  UnresolvedAttemptKeyRefusedError,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"

/** An attempt state as sendPayment leaves it: Confirm armed or not, an attempt kept or not. */
const stateAfter = ({
  disarmed,
  kept,
}: {
  disarmed: boolean
  kept?: { wentKeyless: boolean }
}): AttemptState => {
  const state = createAttemptState()
  state.inFlightRef.current = disarmed
  state.attemptRef.current = kept
    ? { key: "k1", dispatched: true, wentKeyless: kept.wentKeyless, run: jest.fn() }
    : null
  return state
}

const answering = (outcome: SendPaymentOutcome) => async () => outcome
const throwing = (err: unknown) => async (): Promise<SendPaymentOutcome> => {
  throw err
}

describe("dispatchResultOf", () => {
  it("reads Success and Pending as sent", async () => {
    const state = stateAfter({ disarmed: true })
    for (const status of [PaymentSendResult.Success, PaymentSendResult.Pending]) {
      await expect(dispatchResultOf(answering({ status }), state)).resolves.toEqual({
        kind: "sent",
      })
    }
  })

  it("reads a Failure sendPayment re-armed on as a known failure", async () => {
    await expect(
      dispatchResultOf(
        answering({ status: PaymentSendResult.Failure, errorsMessage: "No route" }),
        stateAfter({ disarmed: false }),
      ),
    ).resolves.toEqual({ kind: "failed", reason: "paymentFailed" })
  })

  it("reads a Failure that left Confirm disarmed as unknown, never retried", async () => {
    // A Breez rejection after dispatch (ENG-711), a key reuse answer, a
    // retry of an attempt that went out keyless: sendPayment keeps Confirm
    // disarmed for all of them.
    await expect(
      dispatchResultOf(
        answering({
          status: PaymentSendResult.Failure,
          errorsMessage: "lnurlPay failed",
        }),
        stateAfter({ disarmed: true }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
  })

  it("reads the check-your-history answer as unknown even if the guard were re-armed", async () => {
    await expect(
      dispatchResultOf(
        answering({
          status: PaymentSendResult.Failure,
          errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
        }),
        stateAfter({ disarmed: false }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
  })

  it("reads an invoice already paid as a known failure of its own", async () => {
    await expect(
      dispatchResultOf(
        answering({ status: PaymentSendResult.AlreadyPaid }),
        stateAfter({ disarmed: true }),
      ),
    ).resolves.toEqual({ kind: "failed", reason: "alreadyPaid" })
  })

  it("reads a call the in-flight guard turned away, or an answer with no status, as unknown", async () => {
    await expect(
      dispatchResultOf(
        answering({ status: undefined, ignored: true }),
        stateAfter({ disarmed: true }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
    await expect(
      dispatchResultOf(answering({ status: null }), stateAfter({ disarmed: true })),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
  })

  it("reads a throw with the keyed attempt kept as unknown, retried under the same key", async () => {
    await expect(
      dispatchResultOf(
        throwing(new Error("Network request failed")),
        stateAfter({ disarmed: false, kept: { wentKeyless: false } }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "sameAttempt" })
  })

  it("never retries a throw whose attempt went out keyless, or whose key was refused", async () => {
    await expect(
      dispatchResultOf(
        throwing(new Error("Network request failed")),
        stateAfter({ disarmed: false, kept: { wentKeyless: true } }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
    await expect(
      dispatchResultOf(
        throwing(new UnresolvedAttemptKeyRefusedError()),
        stateAfter({ disarmed: false, kept: { wentKeyless: false } }),
      ),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
    // A throw that left no attempt behind has no key to retry under.
    await expect(
      dispatchResultOf(throwing(new Error("boom")), stateAfter({ disarmed: false })),
    ).resolves.toEqual({ kind: "unknown", retry: "never" })
  })
})

describe("executionOutcomeOf", () => {
  const cases: [string, DispatchResult, boolean, unknown][] = [
    ["a sent payment", { kind: "sent" }, false, { status: "succeeded" }],
    [
      "a keyed known failure: confirm again, under a new key",
      { kind: "failed", reason: "paymentFailed" },
      false,
      { status: "failed", replyKey: "Assistant.paymentFailed", next: "confirmAgain" },
    ],
    [
      "a keyless known failure: a fresh prepare",
      { kind: "failed", reason: "paymentFailed" },
      true,
      { status: "failed", replyKey: "Assistant.paymentFailed", next: "reprepare" },
    ],
    [
      "an invoice already paid",
      { kind: "failed", reason: "alreadyPaid" },
      false,
      { status: "failed", replyKey: "Assistant.invoiceAlreadyPaid", next: "reprepare" },
    ],
    [
      "a keyed lost answer: retry the same attempt",
      { kind: "unknown", retry: "sameAttempt" },
      false,
      { status: "unknown", replyKey: "Assistant.checkHistory", next: "retrySameAttempt" },
    ],
    [
      "a keyless lost answer: never retried, check history",
      { kind: "unknown", retry: "sameAttempt" },
      true,
      { status: "unknown", replyKey: "Assistant.checkHistory", next: "checkHistory" },
    ],
    [
      "an unknown that cannot be retried",
      { kind: "unknown", retry: "never" },
      false,
      { status: "unknown", replyKey: "Assistant.checkHistory", next: "checkHistory" },
    ],
  ]
  cases.forEach(([name, result, keyless, outcome]) =>
    it(`maps ${name}`, () => {
      expect(executionOutcomeOf(result, { keyless })).toEqual(outcome)
    }),
  )
})
