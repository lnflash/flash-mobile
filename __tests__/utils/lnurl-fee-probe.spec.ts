// The adapter under test is the one line that talks to the real lnurl-pay
// API, so the library is replaced wholesale. `toSats` stays a passthrough —
// the real one is a bare cast, and the point of the test is the number that
// reaches the receiver.
jest.mock("lnurl-pay", () => ({
  __esModule: true,
  requestInvoiceWithServiceParams: jest.fn(),
  requestInvoice: jest.fn(),
  utils: { toSats: (value: number) => value },
}))

import { requestInvoice, requestInvoiceWithServiceParams } from "lnurl-pay"
import type { LnUrlPayServiceResponse } from "lnurl-pay/dist/types/types"

import { FEE_ESTIMATE_TIMEOUT_MS } from "../../app/screens/send-bitcoin-screen/max-send-amount"
import {
  LNURL_PROBE_TIMEOUT_MS,
  LnurlProbeDetail,
  makeLnurlFeeProbe,
  makeLnurlProbeCache,
  MINT_REUSE_TTL_MS,
  mintProbeInvoice,
  priceLnurlSend,
} from "../../app/screens/send-bitcoin-screen/lnurl-fee-probe"

const mockedMintCall = requestInvoiceWithServiceParams as unknown as jest.Mock
const mockedAddressMintCall = requestInvoice as unknown as jest.Mock

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

  it("resolves null when the IBEX leg outlives the probe budget", async () => {
    // The budget bounds the WHOLE price check, not just the mint. An LN route
    // probe takes seconds of its own, so timing only the mint left a slow
    // destination running until the chip's own 10s race cut it off — the
    // failover margin this timeout exists to guarantee never applied.
    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: mintInvoice,
      // mint answers instantly; the route probe never does
      getIbexFee: jest.fn(() => new Promise<undefined>(() => {})),
      timeoutMs: 10,
    })

    expect(fee).toBeNull()
    expect(mintInvoice).toHaveBeenCalled()
  })

  it("bounds mint plus fee probe together, not each separately", async () => {
    // Two legs at 60% of the budget each: each is fine alone, the pair is
    // not. A per-leg timer lets this through with a real fee; only one timer
    // around the whole check returns null.
    const budget = 50
    const after = (ms: number, value: unknown) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(value), ms)
      })

    const fee = await priceLnurlSend({
      detail: makeLnurlDetail(makeCalls()),
      probeAmount: 442,
      balanceMoneyAmount: usdBalance,
      requestInvoice: () =>
        after(budget * 0.6, { invoice: "lnbc-221" }) as Promise<{ invoice: string }>,
      getIbexFee: () => after(budget * 0.6, { amount: 7 }) as Promise<{ amount: number }>,
      timeoutMs: budget,
    })

    expect(fee).toBeNull()
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

  it("keeps its budget under the MAX chip's own fee budget", () => {
    // A probe allowed to run the full chip budget would hold the tap instead
    // of degrading to "couldn't estimate". Asserted against the chip's real
    // constant, not a copy of today's value: a copy keeps passing after the
    // chip's budget drops below the probe's, which is the moment the
    // invariant is actually broken.
    expect(LNURL_PROBE_TIMEOUT_MS).toBeLessThan(FEE_ESTIMATE_TIMEOUT_MS)
  })
})

describe("mintProbeInvoice", () => {
  // Minimal stand-in: the adapter passes the params straight through, so only
  // identity matters here.
  const params = {
    callback: "https://lnurl.example/cb",
  } as unknown as LnUrlPayServiceResponse

  beforeEach(() => {
    mockedMintCall.mockReset()
    mockedAddressMintCall.mockReset()
    mockedMintCall.mockResolvedValue({ invoice: "lnbc-real" })
  })

  it("mints through the params-taking call at the exact whole-sat count", async () => {
    const minted = await mintProbeInvoice({ params, sats: 221 })

    expect(mockedMintCall).toHaveBeenCalledWith({ params, tokens: 221 })
    expect(minted.invoice).toBe("lnbc-real")
  })

  it("does not use the address-taking variant", async () => {
    // `requestInvoice` re-resolves the receiver's pay service before it can
    // reach their callback — a second network leg inside a 7s budget, on a
    // detail that already carries the resolved params.
    await mintProbeInvoice({ params, sats: 221 })

    expect(mockedAddressMintCall).not.toHaveBeenCalled()
  })

  it("refuses a fractional amount instead of casting it to Satoshis", async () => {
    // utils.toSats performs no validation — it brands 220.5 as Satoshis and
    // the receiver is asked for half a sat.
    await expect(mintProbeInvoice({ params, sats: 220.5 })).rejects.toThrow(/220\.5 sats/)
    expect(mockedMintCall).not.toHaveBeenCalled()
  })

  it("refuses to ask the receiver for a zero-sat invoice", async () => {
    await expect(mintProbeInvoice({ params, sats: 0 })).rejects.toThrow()
    expect(mockedMintCall).not.toHaveBeenCalled()
  })
})

describe("makeLnurlFeeProbe", () => {
  // The memo the send screen hands to buildMaxAmountButton. Every probe that
  // reaches the receiver mints a REAL invoice, so what this remembers — and
  // for how long — is the difference between one invoice per destination and
  // one per tap against a rate-limited service.
  const probeFor = (
    overrides: {
      requestInvoice?: (args: {
        params: TestPayParams
        sats: number
      }) => Promise<{ invoice: string }>
      getIbexFee?: (
        getFee: TestGetFee | undefined,
      ) => Promise<{ amount: number } | undefined>
      cache?: ReturnType<typeof makeLnurlProbeCache>
      destination?: string
      timeoutMs?: number
    } = {},
  ) =>
    makeLnurlFeeProbe({
      detail: makeLnurlDetail(makeCalls()),
      destination: overrides.destination ?? "sats@flashapp.me",
      walletCurrency: "USD",
      balanceMoneyAmount: usdBalance,
      requestInvoice: overrides.requestInvoice ?? mintInvoice,
      getIbexFee: overrides.getIbexFee ?? getIbexFee,
      cache: overrides.cache ?? makeLnurlProbeCache(),
      timeoutMs: overrides.timeoutMs,
    })

  it("serves a repeat tap from cache without touching the receiver", async () => {
    const probe = probeFor()

    expect(await probe(442)).toBe(7)
    expect(await probe(442)).toBe(7)
    expect(mintInvoice).toHaveBeenCalledTimes(1)
    expect(getIbexFee).toHaveBeenCalledTimes(1)
  })

  it("keeps the probe amount in the key so a smaller probe is priced afresh", async () => {
    // A fee priced for a full-balance probe reused for a cap-clamped one
    // would under-reserve — the max would exceed what the send can pay.
    const probe = probeFor()

    expect(await probe(442)).toBe(7)
    expect(await probe(10_000)).toBe(130)
    expect(mintInvoice).toHaveBeenCalledTimes(2)
  })

  it("does not cache a failure — the note invites another tap", async () => {
    // Inverting the guard to cache nulls would brand a destination
    // unpriceable for the life of the screen on one transient blip.
    const getFeeOnce = jest
      .fn<Promise<{ amount: number } | undefined>, [TestGetFee | undefined]>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ amount: 7 })
    const probe = probeFor({ getIbexFee: getFeeOnce })

    expect(await probe(442)).toBeNull()
    expect(await probe(442)).toBe(7)
  })

  it("does not leak prices across destinations", async () => {
    const cache = makeLnurlProbeCache()

    expect(await probeFor({ cache, destination: "alice@flashapp.me" })(442)).toBe(7)
    await probeFor({ cache, destination: "bob@flashapp.me" })(442)

    expect(mintInvoice).toHaveBeenCalledTimes(2)
  })

  it("shares an in-flight mint instead of asking for a second invoice", async () => {
    // The failure this exists for: any receiver slower than the 7s budget.
    // Promise.race abandons the wait but cannot cancel the request, so the
    // receiver mints anyway. Nothing is ever cached, so the retry the note
    // asks for mints another — one orphaned invoice per tap, forever.
    let settle: (value: { invoice: string }) => void = () => {}
    const slowMint = jest.fn(
      () =>
        new Promise<{ invoice: string }>((resolve) => {
          settle = resolve
        }),
    )
    const cache = makeLnurlProbeCache()
    const probe = probeFor({ cache, requestInvoice: slowMint, timeoutMs: 10 })

    // Tap one gives up on the receiver, which is still minting.
    expect(await probe(442)).toBeNull()

    // Tap two must await that same mint, not start a new one.
    const secondTap = probe(442)
    settle({ invoice: "lnbc-221" })

    expect(await secondTap).toBe(7)
    expect(slowMint).toHaveBeenCalledTimes(1)
  })

  it("forgets a mint that rejected", async () => {
    const failThenSucceed = jest
      .fn<Promise<{ invoice: string }>, [{ params: TestPayParams; sats: number }]>()
      .mockRejectedValueOnce(new Error("receiver unreachable"))
      .mockResolvedValue({ invoice: "lnbc-221" })
    const cache = makeLnurlProbeCache()
    const probe = probeFor({ cache, requestInvoice: failThenSucceed })

    expect(await probe(442)).toBeNull()
    // A cached rejection would make every later tap fail on the dead promise.
    expect(await probe(442)).toBe(7)
    expect(failThenSucceed).toHaveBeenCalledTimes(2)
  })

  it("keeps a fresh answered invoice when only the fee leg failed", async () => {
    // The invoice is FINE — the second leg is what failed. Discarding it on a
    // failed price throws away a live invoice whenever the route probe is the
    // slow half: mint answers at 2s, getIbexFee hangs, the 7s budget fires,
    // and an invoice good for another 53s is dropped. The note then tells the
    // user to tap MAX again, so the retry mints ANOTHER at the receiver — one
    // orphaned invoice per tap against a rate-limited service, which is the
    // exact failure this memo exists to prevent.
    const getFeeOnce = jest
      .fn<Promise<{ amount: number } | undefined>, [TestGetFee | undefined]>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue({ amount: 7 })
    const cache = makeLnurlProbeCache()
    const probe = probeFor({ cache, getIbexFee: getFeeOnce })

    expect(await probe(442)).toBeNull()
    expect(await probe(442)).toBe(7)
    expect(mintInvoice).toHaveBeenCalledTimes(1)
  })

  it("reuses one mint for probe amounts that round to the same sats", async () => {
    // 441¢ and 442¢ are both 221 sats at 2¢/sat. Same invoice, two prices —
    // the fee key differs, the mint key does not.
    const cache = makeLnurlProbeCache()

    expect(await probeFor({ cache })(442)).toBe(7)
    expect(await probeFor({ cache })(441)).toBe(7)
    expect(mintInvoice).toHaveBeenCalledTimes(1)
  })

  it("re-mints once the held invoice has aged out", async () => {
    // The other side of sharing by sat count: an invoice minted minutes ago
    // expires (60s from issue), and pricing an expired invoice is a fee IBEX
    // will refuse at send time. Age retires a mint — nothing else does.
    const cache = makeLnurlProbeCache()
    const start = 1_700_000_000_000
    const clock = jest.spyOn(Date, "now").mockReturnValue(start)
    try {
      expect(await probeFor({ cache })(442)).toBe(7)

      clock.mockReturnValue(start + MINT_REUSE_TTL_MS + 1)
      expect(await probeFor({ cache })(441)).toBe(7)

      expect(mintInvoice).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
  })

  it("keeps the invoice reuse window inside the 60s invoice lifetime", () => {
    // Reusing an invoice for longer than the receiver keeps it alive hands
    // IBEX something already dead.
    expect(MINT_REUSE_TTL_MS).toBeLessThan(60_000)
  })
})
