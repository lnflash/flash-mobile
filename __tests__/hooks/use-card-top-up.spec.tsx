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
import type { CardProofSlot } from "../../app/utils/cashu-card"
import {
  PayArgs,
  ReclaimResult,
  TopUpError,
  TopUpMintError,
  TopUpRecord,
} from "../../app/utils/cashu-card-topup"

loadLocale("en")

const mockSend = jest.fn()
const mockProbe = jest.fn()
const mockRunCardOperation = jest.fn()
const mockVerifyCardPin = jest.fn()
const mockLoadTopUp = jest.fn()
const mockProofStates = jest.fn()
const mockReclaimVerdicts = jest.fn()
const mockReclaimSpentSlots = jest.fn()
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
  reclaimVerdicts: (...args: unknown[]) => mockReclaimVerdicts(...args),
  reclaimSpentSlots: (...args: unknown[]) => mockReclaimSpentSlots(...args),
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

/** What a load tap's reclaim found on a card with no spent slots. */
const NO_RECLAIM: ReclaimResult = { reclaimable: 0, settling: 0, cleared: 0, spent: 0 }
/** A spent slot as the last tap read it. */
const spentSlot = (slot: number): CardProofSlot => ({
  slot,
  status: "spent",
  keysetId: "0059534ce0bfa19a",
  amount: 1,
  // Never all zero: that is a CLEAR_SPENT remnant, not a proof.
  nonce: (slot + 1).toString(16).padStart(64, "0"),
  C: "02" + "ab".repeat(32),
})
/** A card with `spent` spent slots, as the top-up screen hands it to `load`. */
const cardWith = (spent: number) => ({
  pubkey: "02ab",
  maxSlots: 32,
  spentSlots: Array.from({ length: spent }, (_, i) => spentSlot(i)),
})

beforeEach(() => {
  jest.clearAllMocks()
  mockAdvance.mockResolvedValue({ waiting: 0 })
  mockUnfinished.mockResolvedValue([])
  mockReclaimVerdicts.mockResolvedValue(new Map())
  mockReclaimSpentSlots.mockResolvedValue(NO_RECLAIM)
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
      "IBEX's own corroborated verdict, with no error attached, is a failure, and definitive: the server caches it under the key",
      PaymentSendResult.Failure,
      [],
      { kind: "failed", definitive: true },
    ],
    [
      "the busy lock on a same-key request still running is unknown, never a failure",
      PaymentSendResult.Failure,
      // flash maps ResourceAttemptsLockServiceError to UnexpectedClientError
      // (src/graphql/error-map.ts, error.ts): this, word for word.
      [
        {
          code: "UNEXPECTED_CLIENT_ERROR",
          message:
            "Unexpected error occurred, please try again or contact support if it persists (code: ResourceAttemptsLockServiceError: Unknown error)",
        },
      ],
      {
        kind: "unknown",
        message:
          "Unexpected error occurred, please try again or contact support if it persists (code: ResourceAttemptsLockServiceError: Unknown error)",
      },
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
  const record = { id: "t1", cardPubkey: "02ab" } as TopUpRecord
  const tapRuns = () =>
    mockRunCardOperation.mockImplementation(async (op) => op("transceive"))

  it("asks the mint about each proof before the tap, then runs VERIFY_PIN, the reclaim and the load in the one card session", async () => {
    const order: string[] = []
    const states = new Map([["n1", "SPENT"]])
    mockProofStates.mockImplementation(async () => {
      order.push("mint")
      return states
    })
    mockVerifyCardPin.mockImplementation(async () => order.push("verify"))
    mockReclaimSpentSlots.mockImplementation(async () => {
      order.push("reclaim")
      return NO_RECLAIM
    })
    mockLoadTopUp.mockImplementation(async () => {
      order.push("load")
      return { state: "loaded" }
    })
    mockRunCardOperation.mockImplementation(async (op) => {
      order.push("tap")
      return op("transceive")
    })
    const card = cardWith(0)

    const result = await hook().load(record, card, "1234")

    expect(mockProofStates).toHaveBeenCalledWith(expect.anything(), "t1")
    expect(mockRunCardOperation).toHaveBeenCalledWith(expect.any(Function), "02ab")
    expect(mockVerifyCardPin).toHaveBeenCalledWith("transceive", "1234")
    expect(mockReclaimSpentSlots).toHaveBeenCalledWith("transceive", {
      maxSlots: 32,
      verdicts: new Map(),
    })
    expect(mockLoadTopUp).toHaveBeenCalledWith(expect.anything(), {
      id: "t1",
      transceive: "transceive",
      card,
      mintStates: states,
    })
    expect(order).toEqual(["mint", "tap", "verify", "reclaim", "load"])
    expect(result).toEqual({ record: { state: "loaded" }, reclaim: NO_RECLAIM })
  })

  it("hands the reclaim's read of the card to the load, so the tap reads no slot twice", async () => {
    mockProofStates.mockResolvedValue(undefined)
    const inventory = {
      statuses: ["spent", "unspent", ...new Array(30).fill("empty")],
      spent: [spentSlot(0)],
    }
    mockReclaimSpentSlots.mockResolvedValue({
      ...NO_RECLAIM,
      settling: 1,
      spent: 1,
      inventory,
    })
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    tapRuns()

    await hook().load(record, cardWith(1))

    expect(mockLoadTopUp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "t1", transceive: "transceive", inventory }),
    )
  })

  it("sends no VERIFY_PIN to a card without a PIN", async () => {
    mockProofStates.mockResolvedValue(undefined)
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    tapRuns()

    await hook().load(record, cardWith(0))
    expect(mockVerifyCardPin).not.toHaveBeenCalled()
  })

  it("a card with no spent slots costs no mint call for the reclaim", async () => {
    mockProofStates.mockResolvedValue(undefined)
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    tapRuns()

    await hook().load(record, cardWith(0))
    await hook().load(record, { pubkey: "02ab", maxSlots: 32, spentSlots: undefined })
    expect(mockReclaimVerdicts).not.toHaveBeenCalled()
    expect(mockReclaimSpentSlots).toHaveBeenCalledTimes(2)
  })

  it("asks the mint about the card's spent slots before the tap, and hands the verdicts to the reclaim", async () => {
    const order: string[] = []
    const verdicts = new Map([[spentSlot(0).nonce, "SPENT"]])
    mockProofStates.mockResolvedValue(undefined)
    mockReclaimVerdicts.mockImplementation(async () => {
      order.push("verdicts")
      return verdicts
    })
    mockReclaimSpentSlots.mockResolvedValue({ ...NO_RECLAIM, cleared: 2, spent: 2 })
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    mockRunCardOperation.mockImplementation(async (op) => {
      order.push("tap")
      return op("transceive")
    })
    const card = cardWith(2)

    const result = await hook().load(record, card)

    expect(mockReclaimVerdicts).toHaveBeenCalledWith(
      expect.anything(),
      "02ab",
      card.spentSlots,
    )
    expect(mockReclaimSpentSlots).toHaveBeenCalledWith("transceive", {
      maxSlots: 32,
      verdicts,
    })
    expect(order).toEqual(["verdicts", "tap"])
    expect(result.reclaim).toEqual({ ...NO_RECLAIM, cleared: 2, spent: 2 })
  })

  it("a mint that cannot say which spent slots are settled costs no tap: the reclaim runs without verdicts, and says what is still settling", async () => {
    mockProofStates.mockResolvedValue(undefined)
    mockReclaimVerdicts.mockRejectedValue(new Error("Network request failed"))
    mockReclaimSpentSlots.mockResolvedValue({ ...NO_RECLAIM, settling: 2, spent: 2 })
    mockLoadTopUp.mockResolvedValue({ state: "loaded" })
    tapRuns()

    const result = await hook().load(record, cardWith(2))

    expect(mockRunCardOperation).toHaveBeenCalledTimes(1)
    expect(mockReclaimSpentSlots).toHaveBeenCalledWith("transceive", {
      maxSlots: 32,
      verdicts: undefined,
    })
    expect(mockLoadTopUp).toHaveBeenCalledTimes(1)
    expect(result.reclaim).toEqual({ ...NO_RECLAIM, settling: 2, spent: 2 })
  })

  it("a load the engine refuses after the reclaim keeps its reason and carries what the reclaim found", async () => {
    mockProofStates.mockResolvedValue(undefined)
    const reclaim = { ...NO_RECLAIM, settling: 3, spent: 3 }
    mockReclaimSpentSlots.mockResolvedValue(reclaim)
    mockLoadTopUp.mockRejectedValue(new TopUpError("slots", "no room"))
    tapRuns()

    await expect(hook().load(record, cardWith(3))).rejects.toMatchObject({
      reason: "slots",
      message: "no room",
      reclaim,
    })
  })

  it("rethrows the engine's own error, so its stack still names the check that refused", async () => {
    mockProofStates.mockResolvedValue(undefined)
    const reclaim = { ...NO_RECLAIM, settling: 3, spent: 3 }
    mockReclaimSpentSlots.mockResolvedValue(reclaim)
    const refused = new TopUpError("slots", "no room")
    mockLoadTopUp.mockRejectedValue(refused)
    tapRuns()

    await expect(hook().load(record, cardWith(3))).rejects.toBe(refused)
    expect(refused.reclaim).toBe(reclaim)
  })

  it("anything else the tap throws is left as it is", async () => {
    mockProofStates.mockResolvedValue(undefined)
    mockLoadTopUp.mockRejectedValue(new Error("Tag was lost"))
    tapRuns()

    await expect(hook().load(record, cardWith(3))).rejects.toThrow("Tag was lost")
  })

  it("no tap when the mint cannot be asked about a resumed load's proofs, and the failure says the mint, not the card", async () => {
    const failures = [
      new Error("Network request failed"),
      new TopUpMintError("the mint gave no known state for proof 02ab"),
    ]
    for (const failure of failures) {
      mockProofStates.mockRejectedValueOnce(failure)
      await expect(hook().load(record, cardWith(2))).rejects.toMatchObject({
        reason: "mint-unreachable",
      })
    }
    expect(mockRunCardOperation).not.toHaveBeenCalled()
    // The spent slots were never asked about: that question comes after.
    expect(mockReclaimVerdicts).not.toHaveBeenCalled()
  })

  it("keeps the engine's own refusal before the tap as it is", async () => {
    mockProofStates.mockRejectedValueOnce(
      new TopUpError("not-found", "top-up t1 is not saved"),
    )

    await expect(hook().load(record, cardWith(0))).rejects.toMatchObject({
      reason: "not-found",
    })
    expect(mockRunCardOperation).not.toHaveBeenCalled()
  })
})

describe("useCardTopUp reclaimPlanFor", () => {
  it("plans nothing for a card with no spent slots, without asking the mint", async () => {
    await expect(hook().reclaimPlanFor(cardWith(0))).resolves.toEqual({
      reclaimable: 0,
      settling: 0,
    })
    await expect(
      hook().reclaimPlanFor({ pubkey: "02ab", spentSlots: undefined }),
    ).resolves.toEqual({ reclaimable: 0, settling: 0 })
    expect(mockReclaimVerdicts).not.toHaveBeenCalled()
  })

  it("asks the mint about the spent slots and counts every one as room only when all are settled", async () => {
    const card = cardWith(2)
    const [a, b] = card.spentSlots
    mockReclaimVerdicts.mockResolvedValueOnce(
      new Map([
        [a.nonce, "SPENT"],
        [b.nonce, "SPENT"],
      ]),
    )
    await expect(hook().reclaimPlanFor(card)).resolves.toEqual({
      reclaimable: 2,
      settling: 0,
    })
    expect(mockReclaimVerdicts).toHaveBeenCalledWith(
      expect.anything(),
      "02ab",
      card.spentSlots,
    )

    mockReclaimVerdicts.mockResolvedValueOnce(
      new Map([
        [a.nonce, "SPENT"],
        [b.nonce, "PENDING"],
      ]),
    )
    await expect(hook().reclaimPlanFor(card)).resolves.toEqual({
      reclaimable: 0,
      settling: 1,
    })
  })

  it("a mint that cannot be asked leaves every spent slot settling", async () => {
    mockReclaimVerdicts.mockRejectedValueOnce(new Error("Network request failed"))
    await expect(hook().reclaimPlanFor(cardWith(3))).resolves.toEqual({
      reclaimable: 0,
      settling: 3,
    })
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

  it("a dismiss the engine refuses keeps the top-up, and reads the top-ups again the same way", async () => {
    mockUnfinished.mockResolvedValue([saved])
    const { result } = renderHook(() => useUnfinishedTopUps("02ab"))
    await waitFor(() => expect(mockUnfinished).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.records).toEqual([saved]))
    // The mint holds its payment: the engine saved it as paid on the way.
    const paid = { ...saved, state: "paid" } as TopUpRecord
    mockUnfinished.mockResolvedValue([paid])
    mockCancel.mockRejectedValueOnce(new Error("the mint holds this top-up's payment"))

    await act(async () => {
      await expect(result.current.dismiss("t1")).rejects.toThrow("the mint holds")
    })

    await waitFor(() => expect(result.current.records).toEqual([paid]))
    expect(mockUnfinished).toHaveBeenCalledTimes(4)
    expect(mockAdvance).toHaveBeenCalledTimes(2)
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
