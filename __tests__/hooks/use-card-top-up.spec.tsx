/**
 * ENG-616: how a top-up's payment answer is read. This mapping decides whether
 * money is treated as paid, failed (nothing left the wallet: a fresh key, and
 * the user is told so) or unknown (never re-sent under a new key; the mint's
 * quote state settles it), so every answer the server can give is pinned
 * here in the server's own shape, codes included (lnflash/flash
 * src/graphql/public/root/mutation/ln-invoice-payment-send.ts,
 * src/graphql/error-map.ts).
 */
import { AppState } from "react-native"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { PaymentSendResult } from "../../app/graphql/generated"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import {
  nudgeTopUpMinter,
  useCardTopUp,
  useTopUpMinter,
  useUnfinishedTopUps,
} from "../../app/hooks/use-card-top-up"
import type { PayArgs, TopUpRecord } from "../../app/utils/cashu-card-topup"

loadLocale("en")

const mockSend = jest.fn()
const mockProbe = jest.fn()
const mockRunCardOperation = jest.fn()
const mockVerifyCardPin = jest.fn()
const mockLoadTopUp = jest.fn()
const mockProofStates = jest.fn()
const mockUnfinished = jest.fn()
const mockAdvance = jest.fn()
const mockCancel = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useCardTopUpInvoicePaymentSendMutation: () => [mockSend],
  useLnUsdInvoiceFeeProbeMutation: () => [mockProbe],
}))
jest.mock("../../app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ runCardOperation: mockRunCardOperation }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  // No navigator here: a focus effect runs once, as on a focused screen.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}))
jest.mock("@app/utils/cashu-card", () => ({
  ...jest.requireActual("@app/utils/cashu-card"),
  verifyCardPin: (...args: unknown[]) => mockVerifyCardPin(...args),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  loadTopUp: (...args: unknown[]) => mockLoadTopUp(...args),
  proofStatesForLoad: (...args: unknown[]) => mockProofStates(...args),
  unfinishedTopUps: (...args: unknown[]) => mockUnfinished(...args),
  advanceTopUps: (...args: unknown[]) => mockAdvance(...args),
  cancelTopUp: (...args: unknown[]) => mockCancel(...args),
}))

const args = (over: Partial<PayArgs> = {}): PayArgs => ({
  walletId: "cash-wallet",
  paymentRequest: "lnbc1000n1mint",
  idempotencyKey: "key-1",
  isRetry: false,
  ...over,
})

const answer = (status: string, errors: { code?: string; message: string }[] = []) =>
  mockSend.mockResolvedValueOnce({ data: { lnInvoicePaymentSend: { status, errors } } })

const hook = () => renderHook(() => useCardTopUp()).result.current

const KEY_REFUSED = new Error(
  'Variable "$input" got invalid value { walletId: "cash-wallet" }; Field "idempotencyKey" is not defined by type "LnInvoicePaymentInput".',
)

beforeEach(() => {
  jest.clearAllMocks()
  mockAdvance.mockResolvedValue({ waiting: 0 })
  mockUnfinished.mockResolvedValue([])
})

describe("useCardTopUp pay", () => {
  it("pays the mint's invoice from the Cash wallet with the key and a memo", async () => {
    answer(PaymentSendResult.Success)
    await expect(hook().deps.pay(args())).resolves.toEqual({ kind: "paid" })
    expect(mockSend).toHaveBeenCalledWith({
      variables: {
        input: {
          walletId: "cash-wallet",
          paymentRequest: "lnbc1000n1mint",
          memo: "Flashcard top-up",
          idempotencyKey: "key-1",
        },
      },
    })
  })

  const outcomes: [string, string, { code?: string; message: string }[], unknown][] = [
    [
      "an invoice already paid is paid",
      PaymentSendResult.AlreadyPaid,
      [],
      { kind: "paid" },
    ],
    ["a pending payment is pending", PaymentSendResult.Pending, [], { kind: "pending" }],
    [
      "IBEX refusing for balance is a failure, with the server's reason",
      PaymentSendResult.Failure,
      [{ code: "INSUFFICIENT_BALANCE", message: "Insufficient balance" }],
      { kind: "failed", message: "Insufficient balance" },
    ],
    [
      "the send guard's limit is a failure: refused before the payment ran",
      PaymentSendResult.Failure,
      [
        {
          code: "TRANSACTION_RESTRICTED",
          message: "Cannot transfer more than $1000.00 in 24 hours",
        },
      ],
      {
        kind: "failed",
        message: "Cannot transfer more than $1000.00 in 24 hours",
      },
    ],
    [
      "the send guard's attempt budget is a failure",
      PaymentSendResult.Failure,
      [
        {
          code: "TOO_MANY_REQUEST",
          message: "Too many payment attempts, please wait for a while and try again.",
        },
      ],
      {
        kind: "failed",
        message: "Too many payment attempts, please wait for a while and try again.",
      },
    ],
    [
      "IBEX's own corroborated verdict, with no error attached, is a failure",
      PaymentSendResult.Failure,
      [],
      { kind: "failed" },
    ],
    [
      "the busy lock on a same-key request still running is unknown, never a failure",
      PaymentSendResult.Failure,
      // ResourceAttemptsLockServiceError → RouteFindingError with an empty message.
      [{ code: "ROUTE_FINDING_ERROR", message: "" }],
      { kind: "unknown" },
    ],
    [
      "IBEX's generic error is unknown: IBEX may have debited",
      PaymentSendResult.Failure,
      [{ message: "An unexpected error occurred. Please try again later." }],
      {
        kind: "unknown",
        message: "An unexpected error occurred. Please try again later.",
      },
    ],
    [
      "a lock the server could not take is unknown",
      PaymentSendResult.Failure,
      [
        {
          code: "UNKNOWN_CLIENT_ERROR",
          message: "Unknown error occurred (code: UnknownLockServiceError)",
        },
      ],
      {
        kind: "unknown",
        message: "Unknown error occurred (code: UnknownLockServiceError)",
      },
    ],
    [
      "a failure with a reason and no code is unknown",
      PaymentSendResult.Failure,
      [{ message: "Insufficient balance" }],
      { kind: "unknown", message: "Insufficient balance" },
    ],
    [
      "the server replaying this key for other parameters is unknown, never a failure",
      PaymentSendResult.Failure,
      [
        {
          code: "INVALID_INPUT",
          message:
            "This idempotency key was already used for a different payment. Use a new key for a new payment.",
        },
      ],
      {
        kind: "unknown",
        message:
          "This idempotency key was already used for a different payment. Use a new key for a new payment.",
      },
    ],
  ]
  outcomes.forEach(([name, status, errors, expected]) => {
    it(name, async () => {
      answer(status, errors)
      await expect(hook().deps.pay(args())).resolves.toEqual(expected)
    })
  })

  it("an answer with no status is unknown", async () => {
    mockSend.mockResolvedValueOnce({ data: undefined })
    await expect(hook().deps.pay(args())).resolves.toEqual({ kind: "unknown" })
  })

  it("never sends without the key: a server that refuses the field refused this dispatch before it ran", async () => {
    ;[false, true].forEach(() => mockSend.mockRejectedValueOnce(KEY_REFUSED))

    await expect(hook().deps.pay(args())).resolves.toEqual({
      kind: "failed",
      message: KEY_REFUSED.message,
    })
    // On a retry too: the engine, not the wallet, decides what a refused
    // retry means for the dispatch before it.
    await expect(hook().deps.pay(args({ isRetry: true }))).resolves.toMatchObject({
      kind: "failed",
    })
    expect(mockSend).toHaveBeenCalledTimes(2)
    mockSend.mock.calls.forEach(([call]) =>
      expect(call.variables.input.idempotencyKey).toBe("key-1"),
    )
  })

  it("any other thrown error is left to the engine, which reads it as unknown", async () => {
    mockSend.mockRejectedValueOnce(new Error("Network request failed"))
    await expect(hook().deps.pay(args())).rejects.toThrow("Network request failed")
  })
})

describe("useCardTopUp feeFor", () => {
  const record = {
    payment: { walletId: "cash-wallet" },
    quote: { request: "lnbc" },
  } as TopUpRecord

  it("returns the Cash wallet's fee for the invoice", async () => {
    mockProbe.mockResolvedValueOnce({
      data: { lnUsdInvoiceFeeProbe: { amount: 0, errors: [] } },
    })
    await expect(hook().feeFor(record)).resolves.toBe(0)
    expect(mockProbe).toHaveBeenCalledWith({
      variables: { input: { walletId: "cash-wallet", paymentRequest: "lnbc" } },
    })
  })

  it("says nothing it cannot back: a probe with errors, or one that throws, gives no fee", async () => {
    mockProbe.mockResolvedValueOnce({
      data: { lnUsdInvoiceFeeProbe: { amount: 3, errors: [{ message: "x" }] } },
    })
    await expect(hook().feeFor(record)).resolves.toBeUndefined()
    mockProbe.mockRejectedValueOnce(new Error("offline"))
    await expect(hook().feeFor(record)).resolves.toBeUndefined()
  })
})

describe("useCardTopUp load", () => {
  it("asks the mint about each proof before the tap, then runs VERIFY_PIN and the load in the one card session", async () => {
    const order: string[] = []
    const states = new Map([["n1", "SPENT"]])
    mockProofStates.mockImplementation(async () => {
      order.push("mint")
      return states
    })
    mockVerifyCardPin.mockImplementation(async () => order.push("verify"))
    mockLoadTopUp.mockImplementation(async () => {
      order.push("load")
      return { state: "loaded" }
    })
    mockRunCardOperation.mockImplementation(async (op) => {
      order.push("tap")
      return op("transceive")
    })
    const record = { id: "t1", cardPubkey: "02ab" } as TopUpRecord

    await hook().load(record, { maxSlots: 32 }, "1234")

    expect(mockProofStates).toHaveBeenCalledWith(expect.anything(), "t1")
    expect(mockRunCardOperation).toHaveBeenCalledWith(expect.any(Function), "02ab")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", "1234")
    expect(mockLoadTopUp).toHaveBeenCalledWith(expect.anything(), {
      id: "t1",
      transceive: "transceive",
      card: { maxSlots: 32 },
      mintStates: states,
    })
    expect(order).toEqual(["mint", "tap", "verify", "load"])
  })

  it("sends no VERIFY_PIN to a card without a PIN", async () => {
    mockProofStates.mockResolvedValue(undefined)
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    mockRunCardOperation.mockImplementation(async (op) => op("transceive"))

    await hook().load({ id: "t1", cardPubkey: "02ab" } as TopUpRecord, { maxSlots: 32 })
    expect(mockVerifyCardPin).not.toHaveBeenCalled()
  })

  it("no tap when the mint cannot be asked about a resumed load's proofs", async () => {
    mockProofStates.mockRejectedValueOnce(new Error("Network request failed"))

    await expect(
      hook().load({ id: "t1", cardPubkey: "02ab" } as TopUpRecord, { maxSlots: 32 }),
    ).rejects.toThrow("Network request failed")
    expect(mockRunCardOperation).not.toHaveBeenCalled()
  })
})

describe("useUnfinishedTopUps", () => {
  const saved = { id: "t1", cardPubkey: "02ab" } as TopUpRecord

  it("lists at once, lets the mint have its say (mint what landed, drop what never can), then lists again", async () => {
    mockUnfinished.mockResolvedValueOnce([saved]).mockResolvedValueOnce([])
    const { result } = renderHook(() => useUnfinishedTopUps("02ab"))

    await waitFor(() => expect(mockUnfinished).toHaveBeenCalledTimes(2))
    expect(mockAdvance).toHaveBeenCalledTimes(1)
    expect(mockAdvance.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockUnfinished.mock.invocationCallOrder[0],
    )
    await waitFor(() => expect(result.current.records).toEqual([]))
  })

  it("dismiss drops a top-up only through cancelTopUp, which asks the mint", async () => {
    mockUnfinished.mockResolvedValue([saved])
    mockCancel.mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUnfinishedTopUps("02ab"))
    await waitFor(() => expect(result.current.records).toEqual([saved]))

    await act(async () => result.current.dismiss("t1"))

    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "t1")
    expect(result.current.records).toEqual([])
  })

  it("a dismiss the engine refuses keeps the top-up listed", async () => {
    mockUnfinished.mockResolvedValue([saved])
    mockCancel.mockRejectedValueOnce(new Error("this payment may still land"))
    const { result } = renderHook(() => useUnfinishedTopUps("02ab"))
    await waitFor(() => expect(result.current.records).toEqual([saved]))

    await act(async () => {
      await expect(result.current.dismiss("t1")).rejects.toThrow("may still land")
    })
    expect(result.current.records).toEqual([saved])
  })
})

describe("useTopUpMinter", () => {
  it("asks the mint at launch, on a nudge and on a return to the foreground, and not after unmount", async () => {
    let onChange: ((state: string) => void) | undefined
    const remove = jest.fn()
    const listen = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, handler) => {
        onChange = handler as (state: string) => void
        return { remove } as unknown as ReturnType<typeof AppState.addEventListener>
      })
    try {
      const { unmount } = renderHook(() => useTopUpMinter())
      await waitFor(() => expect(mockAdvance).toHaveBeenCalledTimes(1))

      nudgeTopUpMinter()
      await waitFor(() => expect(mockAdvance).toHaveBeenCalledTimes(2))

      act(() => onChange?.("active"))
      await waitFor(() => expect(mockAdvance).toHaveBeenCalledTimes(3))

      unmount()
      expect(remove).toHaveBeenCalled()
      nudgeTopUpMinter()
      await Promise.resolve()
      expect(mockAdvance).toHaveBeenCalledTimes(3)
    } finally {
      listen.mockRestore()
    }
  })
})
