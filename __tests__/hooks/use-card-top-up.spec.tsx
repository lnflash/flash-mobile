/**
 * ENG-616: how a top-up's payment answer is read. This mapping decides whether
 * money is treated as paid, failed (a fresh key and a new attempt) or unknown
 * (never re-sent until the mint says the invoice is unpaid), so every server
 * answer the send flow knows is pinned here.
 */
import { renderHook } from "@testing-library/react-native"

import { PaymentSendResult } from "../../app/graphql/generated"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { useCardTopUp } from "../../app/hooks/use-card-top-up"
import { resetIdempotencyKeySupport } from "../../app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import type { PayArgs, TopUpRecord } from "../../app/utils/cashu-card-topup"

loadLocale("en")

const mockSend = jest.fn()
const mockProbe = jest.fn()
const mockRunCardOperation = jest.fn()
const mockVerifyCardPin = jest.fn()
const mockLoadTopUp = jest.fn()

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useLnInvoicePaymentSendMutation: () => [mockSend],
  useLnUsdInvoiceFeeProbeMutation: () => [mockProbe],
}))
jest.mock("../../app/hooks/use-app-config", () => ({
  useAppConfig: () => ({
    appConfig: { galoyInstance: { graphqlUri: "https://api.test/graphql" } },
  }),
}))
jest.mock("../../app/hooks/useFlashcard", () => ({
  useFlashcard: () => ({ runCardOperation: mockRunCardOperation }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  useI18nContext: () => ({ LL: require("../../app/i18n/i18n-util").i18nObject("en") }),
}))
jest.mock("@app/utils/cashu-card", () => ({
  ...jest.requireActual("@app/utils/cashu-card"),
  verifyCardPin: (...args: unknown[]) => mockVerifyCardPin(...args),
}))
jest.mock("@app/utils/cashu-card-topup", () => ({
  ...jest.requireActual("@app/utils/cashu-card-topup"),
  loadTopUp: (...args: unknown[]) => mockLoadTopUp(...args),
}))

const args = (over: Partial<PayArgs> = {}): PayArgs => ({
  walletId: "cash-wallet",
  paymentRequest: "lnbc1000n1mint",
  idempotencyKey: "key-1",
  isRetry: false,
  onKeylessDispatch: jest.fn(),
  ...over,
})

const answer = (status: string, errors: { message: string }[] = []) =>
  mockSend.mockResolvedValueOnce({ data: { lnInvoicePaymentSend: { status, errors } } })

const hook = () => renderHook(() => useCardTopUp()).result.current

beforeEach(() => {
  jest.clearAllMocks()
  resetIdempotencyKeySupport()
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

  const outcomes: [string, string, { message: string }[], unknown][] = [
    [
      "an invoice already paid is paid",
      PaymentSendResult.AlreadyPaid,
      [],
      { kind: "paid" },
    ],
    ["a pending payment is pending", PaymentSendResult.Pending, [], { kind: "pending" }],
    [
      "a failure is a failure, with the server's reason",
      PaymentSendResult.Failure,
      [{ message: "Insufficient balance" }],
      { kind: "failed", message: "Insufficient balance" },
    ],
    [
      "the server replaying this key for other parameters is unknown, never a failure",
      PaymentSendResult.Failure,
      [{ message: "The idempotency key was already used for a different payment" }],
      { kind: "unknown" },
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

  it("a retry whose key the server refuses is unknown: it never goes out without the key", async () => {
    mockSend.mockRejectedValueOnce(
      new Error('Field "idempotencyKey" is not defined by type "LnInvoicePaymentInput"'),
    )
    await expect(hook().deps.pay(args({ isRetry: true }))).resolves.toEqual({
      kind: "unknown",
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it("a first dispatch whose key the server refuses goes out without it, and says so", async () => {
    mockSend
      .mockRejectedValueOnce(
        new Error(
          'Field "idempotencyKey" is not defined by type "LnInvoicePaymentInput"',
        ),
      )
      .mockResolvedValueOnce({
        data: { lnInvoicePaymentSend: { status: PaymentSendResult.Success, errors: [] } },
      })
    const onKeylessDispatch = jest.fn()

    await expect(hook().deps.pay(args({ onKeylessDispatch }))).resolves.toEqual({
      kind: "paid",
    })
    expect(onKeylessDispatch).toHaveBeenCalledTimes(1)
    expect(mockSend.mock.calls[1][0].variables.input.idempotencyKey).toBeUndefined()
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
  it("runs VERIFY_PIN before the load, in the one card session, against the top-up's card", async () => {
    const order: string[] = []
    mockVerifyCardPin.mockImplementation(async () => order.push("verify"))
    mockLoadTopUp.mockImplementation(async () => {
      order.push("load")
      return { state: "loaded" }
    })
    mockRunCardOperation.mockImplementation(async (op) => op("transceive"))
    const record = { id: "t1", cardPubkey: "02ab" } as TopUpRecord

    await hook().load(record, { maxSlots: 32 }, "1234")

    expect(mockRunCardOperation).toHaveBeenCalledWith(expect.any(Function), "02ab")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", "1234")
    expect(mockLoadTopUp).toHaveBeenCalledWith(expect.anything(), {
      id: "t1",
      transceive: "transceive",
      card: { maxSlots: 32 },
    })
    expect(order).toEqual(["verify", "load"])
  })

  it("sends no VERIFY_PIN to a card without a PIN", async () => {
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    mockRunCardOperation.mockImplementation(async (op) => op("transceive"))

    await hook().load({ id: "t1", cardPubkey: "02ab" } as TopUpRecord, { maxSlots: 32 })
    expect(mockVerifyCardPin).not.toHaveBeenCalled()
  })
})
