import {
  LNURL_PROBE_TIMEOUT_MS,
  LnurlProbeDetail,
  priceLnurlSend,
} from "../../app/screens/send-bitcoin-screen/lnurl-fee-probe"

type TestMoneyAmount = { amount: number; currency: string; currencyCode: string }
type TestBtcAmount = { amount: number; currency: "BTC"; currencyCode: "SAT" }
// Sentinel getFee handle: whatever the priced detail exposes must reach
// getIbexFee untouched, so the fee that comes back is the fee for THIS invoice.
type TestGetFee = { invoice: string; sats: number }
type TestPayParams = { callback: string; tag: "payRequest" }

type Detail = LnurlProbeDetail<TestMoneyAmount, TestBtcAmount, TestGetFee, TestPayParams>

// 1 sat = 2 cents, so cent amounts halve into sats and odd cents land on a
// half-sat — the case that must never reach the receiver as a fractional mint.
const CENTS_PER_SAT = 2

const usdBalance: TestMoneyAmount = {
  amount: 10_000,
  currency: "USD",
  currencyCode: "USD",
}

const lnurlParams: TestPayParams = {
  callback: "https://lnurl.example/cb",
  tag: "payRequest",
}

const convertMoneyAmount = (
  moneyAmount: TestMoneyAmount,
  toCurrency: "BTC",
): TestBtcAmount => ({
  amount:
    moneyAmount.currency === "BTC"
      ? moneyAmount.amount
      : moneyAmount.amount / CENTS_PER_SAT,
  currency: toCurrency,
  currencyCode: "SAT",
})

type ProbeCalls = {
  setAmount: TestMoneyAmount[]
  setInvoice: { paymentRequest: string; paymentRequestAmount: TestBtcAmount }[]
}

const makeCalls = (): ProbeCalls => ({ setAmount: [], setInvoice: [] })

/**
 * A payment detail shaped like the LNURL arm of PaymentDetail: setAmount
 * returns a NEW detail whose unitOfAccountAmount is the probe amount, and only
 * that detail can attach an invoice.
 */
const makeLnurlDetail = (calls: ProbeCalls, overrides: Partial<Detail> = {}): Detail => {
  const base: Detail = {
    paymentType: "lnurl",
    // Deliberately not the probe amount: the probe must price what setAmount
    // produced, not whatever the screen's detail happened to be holding.
    unitOfAccountAmount: { ...usdBalance, amount: 0 },
    convertMoneyAmount,
    lnurlParams,
    setAmount: (unitOfAccountAmount) => {
      calls.setAmount.push(unitOfAccountAmount)
      return {
        ...base,
        unitOfAccountAmount,
        setInvoice: (params) => {
          calls.setInvoice.push(params)
          return {
            getFee: {
              invoice: params.paymentRequest,
              sats: params.paymentRequestAmount.amount,
            },
          }
        },
      }
    },
    ...overrides,
  }
  return base
}

// Fee table keyed by the minted invoice: proves the returned fee belongs to the
// invoice this probe minted rather than to some other amount.
const feeForInvoice: Record<string, number> = {
  "lnbc-221": 7,
  "lnbc-5000": 130,
}

const mintInvoice = jest.fn(
  async ({ sats }: { params: TestPayParams; sats: number }) => ({
    invoice: `lnbc-${sats}`,
  }),
)

const getIbexFee = jest.fn(async (getFee: TestGetFee | undefined) =>
  getFee && feeForInvoice[getFee.invoice] !== undefined
    ? { amount: feeForInvoice[getFee.invoice] }
    : undefined,
)

beforeEach(() => {
  mintInvoice.mockClear()
  getIbexFee.mockClear()
})

describe("priceLnurlSend", () => {
  it("prices the destination through a throwaway invoice at the probe amount", async () => {
    const calls = makeCalls()

    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(calls),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    // 442 cents / 2 = 221 sats; the fee table answers for lnbc-221 only.
    expect(fee).toBe(7)
    expect(calls.setAmount).toEqual([{ ...usdBalance, amount: 442 }])
  })

  it("mints the invoice for the whole-sat conversion of the probe amount", async () => {
    await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(mintInvoice).toHaveBeenCalledWith({ params: lnurlParams, sats: 221 })
  })

  it("converts the PROBE amount, not the detail's pre-probe amount", async () => {
    // The detail starts at 0; a probe that priced unitOfAccountAmount of the
    // original detail (or any other field) would mint lnbc-0 and price null.
    await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 10_000,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(mintInvoice).toHaveBeenCalledWith({ params: lnurlParams, sats: 5_000 })
  })

  it("hands the receiver's already-resolved params to the mint (one round-trip)", async () => {
    // Re-resolving the pay service by address costs a second network leg
    // inside the probe budget; a slow-but-fine receiver would then read as
    // unpriceable. The params are already on the detail — use them.
    await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(mintInvoice.mock.calls[0][0].params).toBe(lnurlParams)
  })

  it("prices the invoice it minted, at the sats it minted it for", async () => {
    const calls = makeCalls()

    await priceLnurlSend({
      detail: makeLnurlDetail(calls),
      probeAmount: 441,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    // 441 cents = 220.5 sats — rounded once, and the SAME whole number must
    // reach both the mint and setInvoice. A mismatch prices a different send.
    expect(mintInvoice).toHaveBeenCalledWith({ params: lnurlParams, sats: 221 })
    expect(calls.setInvoice).toEqual([
      {
        paymentRequest: "lnbc-221",
        paymentRequestAmount: { amount: 221, currency: "BTC", currencyCode: "SAT" },
      },
    ])
    expect(getIbexFee).toHaveBeenCalledWith({ invoice: "lnbc-221", sats: 221 })
  })

  it("resolves null when the invoice mint rejects", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: jest.fn(async () => {
        throw new Error("receiver unreachable")
      }),
      getIbexFee,
    })

    expect(fee).toBeNull()
    expect(getIbexFee).not.toHaveBeenCalled()
  })

  it("resolves null when the invoice mint outlives the probe budget", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      // never resolves
      requestInvoice: () => new Promise(() => {}),
      getIbexFee,
      timeoutMs: 10,
    })

    expect(fee).toBeNull()
    expect(getIbexFee).not.toHaveBeenCalled()
  })

  it("resolves null when IBEX cannot price the minted invoice", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee: jest.fn(async () => undefined),
    })

    expect(fee).toBeNull()
  })

  it("resolves null when the IBEX probe throws", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee: jest.fn(async () => {
        throw new Error("fee probe failed")
      }),
    })

    expect(fee).toBeNull()
  })

  it("mints nothing for a non-LNURL detail", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls(), { paymentType: "lightning" }),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(fee).toBeNull()
    expect(mintInvoice).not.toHaveBeenCalled()
  })

  it("mints nothing when the detail carries no resolved pay params", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls(), { lnurlParams: undefined }),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(fee).toBeNull()
    expect(mintInvoice).not.toHaveBeenCalled()
  })

  it("mints nothing when the amount cannot be set", async () => {
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls(), { setAmount: undefined }),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(fee).toBeNull()
    expect(mintInvoice).not.toHaveBeenCalled()
  })

  it("mints nothing when the probe amount is worth less than a sat", async () => {
    // A dust probe would otherwise ask the receiver for a 0-sat invoice.
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 0.4,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      getIbexFee,
    })

    expect(fee).toBeNull()
    expect(mintInvoice).not.toHaveBeenCalled()
  })

  it("keeps its budget under the MAX chip's own 10s fee budget", () => {
    // A probe allowed to run the full chip budget would hold the tap instead
    // of degrading to "couldn't estimate".
    expect(LNURL_PROBE_TIMEOUT_MS).toBeLessThan(10_000)
  })
})
