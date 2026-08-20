import {
  computeMaxSendAmount,
  effectiveMaxPaymentType,
  maxAmountWithinFeeCap,
  maxChipSupportsPaymentType,
  noteForResult,
  reservedFeeCapFor,
  resolveRecipientCap,
} from "../../app/screens/send-bitcoin-screen/max-send-amount"

describe("computeMaxSendAmount", () => {
  it("intraledger: full balance, no fee call (USD wallet — no fee between Flash accounts)", async () => {
    const fetchFee = jest.fn()

    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 100_000,
      fetchFee,
    })

    expect(result).toEqual({ amount: 100_000, reason: "intraledger-full-balance" })
    expect(fetchFee).not.toHaveBeenCalled()
  })

  it("BTC-wallet intraledger (effective type lnurl) reserves the Breez fee", async () => {
    const result = await computeMaxSendAmount({
      paymentType: effectiveMaxPaymentType("BTC", "intraledger"),
      balance: 100_000,
      fetchFee: async () => 320,
    })

    expect(result).toEqual({
      amount: 99_680,
      reason: "fee-reserved",
      feeReserved: 320,
    })
  })

  it("external destination: balance minus the fee estimate", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => 260,
    })

    expect(result).toEqual({
      amount: 99_740,
      reason: "fee-reserved",
      feeReserved: 260,
    })
  })

  it("reserves the backend fee cap when no fee estimate is available", async () => {
    // The LNURL case: no invoice exists yet, so there is nothing to probe.
    // Offering the full 100_000 would be rejected by the backend, which adds
    // its own cap on top and checks balance >= amount + fee.
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => null,
    })

    expect(result).toEqual({
      amount: 99_503,
      reason: "fee-unavailable",
      feeReserved: 497,
    })
    expect(result.amount + reservedFeeCapFor(result.amount)).toBeLessThanOrEqual(100_000)
  })

  it("reserves the fee cap when the fee fetch throws", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => {
        throw new Error("network down")
      },
    })

    expect(result).toEqual({
      amount: 99_503,
      reason: "fee-unavailable",
      feeReserved: 497,
    })
  })

  it("reserves the fee cap when the fee fetch hangs past the timeout", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      // never resolves
      fetchFee: () => new Promise(() => {}),
      timeoutMs: 20,
    })

    expect(result).toEqual({
      amount: 99_503,
      reason: "fee-unavailable",
      feeReserved: 497,
    })
  })

  it("clamps to the recipient's LNURL maxSendable when it is the binding limit", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee: async () => 500,
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("probes the fee at the full balance when there is no recipient cap", async () => {
    const fetchFee = jest.fn(async () => 260)

    await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee,
    })

    expect(fetchFee).toHaveBeenCalledWith(100_000)
  })

  it("probes the fee at the capped amount when the cap binds (LUD-06 bounds would reject a full-balance probe)", async () => {
    const fetchFee = jest.fn(async () => 500)

    await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee,
      recipientCap: 150_000,
    })

    expect(fetchFee).toHaveBeenCalledWith(150_000)
  })

  it("reserves the fee below the cap when the cap is within fee distance of the balance", async () => {
    // balance 100_000, receiver max 99_900, fee 300: a full-balance probe
    // would fail LUD-06 bounds validation (fee null), MAX would fill 99_900
    // with no fee headroom, and confirm-time 99_900 + 300 > 100_000 would
    // dead-end. Probing at the capped amount keeps the estimate, so MAX
    // fills 99_700 — confirm-safe (99_700 + 300 = 100_000).
    const fetchFee = jest.fn(async (probeAmount: number) =>
      probeAmount > 99_900 ? null : 300,
    )

    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee,
      recipientCap: 99_900,
    })

    expect(fetchFee).toHaveBeenCalledWith(99_900)
    expect(result).toEqual({
      amount: 99_700,
      reason: "fee-reserved",
      feeReserved: 300,
    })
  })

  it("keeps balance minus fee when the recipient cap is not binding", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => 500,
      recipientCap: 150_000,
    })

    expect(result).toEqual({
      amount: 99_500,
      reason: "fee-reserved",
      feeReserved: 500,
    })
  })

  it("clamps intraledger sends too (BTC wallet settles them via LNURL-pay)", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 1_000_000,
      fetchFee: jest.fn(),
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("applies the cap on the fee-unavailable fallback as well", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee: async () => null,
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("returns zero for a zero balance", async () => {
    const fetchFee = jest.fn()

    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 0,
      fetchFee,
    })

    expect(result).toEqual({ amount: 0, reason: "zero-balance" })
    expect(fetchFee).not.toHaveBeenCalled()
  })

  it("treats a NaN balance (wallet still loading) as zero", async () => {
    const fetchFee = jest.fn()

    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: Number.NaN,
      fetchFee,
    })

    expect(result).toEqual({ amount: 0, reason: "zero-balance" })
    expect(fetchFee).not.toHaveBeenCalled()
  })

  it("treats a non-finite balance as zero", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: Number.POSITIVE_INFINITY,
      fetchFee: jest.fn(),
    })

    expect(result).toEqual({ amount: 0, reason: "zero-balance" })
  })

  it("never goes negative when the fee exceeds the balance", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100,
      fetchFee: async () => 500,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-reserved", feeReserved: 500 })
  })

  it("treats a negative or non-finite fee as unavailable", async () => {
    const negative = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => -10,
    })
    const nan = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => Number.NaN,
    })

    // Both take the no-estimate path, which reserves the backend fee cap
    // rather than offering the full balance.
    expect(negative).toEqual({
      amount: 99_503,
      reason: "fee-unavailable",
      feeReserved: 497,
    })
    expect(nan).toEqual({
      amount: 99_503,
      reason: "fee-unavailable",
      feeReserved: 497,
    })
  })

  // On-device repro (2026-08-13): USD cash balance arrives as FRACTIONAL
  // cents (109.9346 = $1.099346 at IBEX). Offering it un-floored produced a
  // $1.10 invoice — rounded half-up downstream — and IBEX rejected the send:
  // "insufficient balance. Current Balance: 1.099346 ... invoice amount:
  // 1.100000". Max must only ever offer whole minor units.
  describe("fractional balances (fractional-cent USD wallets)", () => {
    it("floors a fractional intraledger balance to whole cents", async () => {
      const result = await computeMaxSendAmount({
        paymentType: "intraledger",
        balance: 109.9346,
        fetchFee: async () => 0,
      })

      expect(result).toEqual({ amount: 109, reason: "intraledger-full-balance" })
    })

    it("floors the external-send max after subtracting the fee", async () => {
      const result = await computeMaxSendAmount({
        paymentType: "lightning",
        balance: 109.9346,
        fetchFee: async () => 0,
      })

      expect(result).toEqual({ amount: 109, reason: "fee-reserved", feeReserved: 0 })
    })

    it("floors a fractional recipient cap before offering it", async () => {
      const result = await computeMaxSendAmount({
        paymentType: "lnurl",
        balance: 500,
        fetchFee: async () => 0,
        recipientCap: 123.75,
      })

      expect(result).toEqual({ amount: 123, reason: "recipient-cap" })
    })

    it("treats a sub-cent balance as zero", async () => {
      const fetchFee = jest.fn(async () => 0)
      const result = await computeMaxSendAmount({
        paymentType: "lightning",
        balance: 0.9346,
        fetchFee,
      })

      expect(result).toEqual({ amount: 0, reason: "zero-balance" })
      expect(fetchFee).not.toHaveBeenCalled()
    })
  })
})

describe("effectiveMaxPaymentType", () => {
  it("routes BTC-wallet intraledger through the LNURL fee path", () => {
    expect(effectiveMaxPaymentType("BTC", "intraledger")).toBe("lnurl")
  })

  it("keeps USD-wallet intraledger on the no-fee path", () => {
    expect(effectiveMaxPaymentType("USD", "intraledger")).toBe("intraledger")
  })

  it("passes every other payment type through unchanged for both wallets", () => {
    for (const walletCurrency of ["BTC", "USD"] as const) {
      for (const paymentType of ["lightning", "lnurl", "onchain"] as const) {
        expect(effectiveMaxPaymentType(walletCurrency, paymentType)).toBe(paymentType)
      }
    }
  })
})

describe("maxChipSupportsPaymentType", () => {
  it("excludes onchain (fee needs a selected speed; flow has its own send-all Max)", () => {
    expect(maxChipSupportsPaymentType("onchain")).toBe(false)
  })

  it("supports intraledger, lightning and lnurl", () => {
    expect(maxChipSupportsPaymentType("intraledger")).toBe(true)
    expect(maxChipSupportsPaymentType("lightning")).toBe(true)
    expect(maxChipSupportsPaymentType("lnurl")).toBe(true)
  })
})

describe("resolveRecipientCap", () => {
  const convertSatsToWallet = (sats: number) => sats * 2

  it("BTC wallet: uses the resolved receiver limit as-is (already sats)", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "BTC",
        paymentType: "intraledger",
        receiverMaxSats: 150_000,
        lnurlParamsMaxSats: null,
        convertSatsToWallet,
      }),
    ).toBe(150_000)
  })

  it("BTC wallet: no resolved limit means no cap", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "BTC",
        paymentType: "lnurl",
        receiverMaxSats: null,
        lnurlParamsMaxSats: 150_000,
        convertSatsToWallet,
      }),
    ).toBeNull()
  })

  it("USD wallet: converts the LNURL max from sats to wallet minor units", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "USD",
        paymentType: "lnurl",
        receiverMaxSats: null,
        lnurlParamsMaxSats: 150_000,
        convertSatsToWallet,
      }),
    ).toBe(300_000)
  })

  it("USD wallet: no cap for non-LNURL payment types", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "USD",
        paymentType: "intraledger",
        receiverMaxSats: 150_000,
        lnurlParamsMaxSats: 150_000,
        convertSatsToWallet,
      }),
    ).toBeNull()
  })

  it("USD wallet: a missing LNURL max means no cap", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "USD",
        paymentType: "lnurl",
        receiverMaxSats: null,
        lnurlParamsMaxSats: null,
        convertSatsToWallet,
      }),
    ).toBeNull()
  })
})

describe("noteForResult", () => {
  it("intraledger full balance gets the no-fee note", () => {
    expect(
      noteForResult({ amount: 100_000, reason: "intraledger-full-balance" }),
    ).toEqual({ kind: "intraledger" })
  })

  it("fee-reserved with a positive fee gets the fee note", () => {
    expect(
      noteForResult({ amount: 99_740, reason: "fee-reserved", feeReserved: 260 }),
    ).toEqual({ kind: "fee-reserved", feeReserved: 260 })
  })

  it("fee-reserved with a zero fee gets no note (a $0.00 reservation is nonsense)", () => {
    expect(
      noteForResult({ amount: 100_000, reason: "fee-reserved", feeReserved: 0 }),
    ).toEqual({ kind: "none" })
  })

  it("recipient cap gets the cap note with the capped amount", () => {
    expect(noteForResult({ amount: 150_000, reason: "recipient-cap" })).toEqual({
      kind: "recipient-cap",
      cap: 150_000,
    })
  })

  it("fee-unavailable and zero-balance get no note", () => {
    expect(noteForResult({ amount: 100_000, reason: "fee-unavailable" })).toEqual({
      kind: "none",
    })
    expect(noteForResult({ amount: 0, reason: "zero-balance" })).toEqual({
      kind: "none",
    })
  })
})

describe("fee-cap reserve (ENG-554)", () => {
  // The reported failure: balance $4.42, MAX filled the full 442 cents, the
  // backend added its cap on top and refused the send. $4.00 went through
  // because it happened to leave enough headroom.
  it("leaves headroom for the reported 442-cent balance", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 442,
      fetchFee: async () => null,
    })

    expect(result.amount).toBeLessThan(442)
    expect(result.amount + reservedFeeCapFor(result.amount)).toBeLessThanOrEqual(442)
  })

  it("never proposes an amount the backend balance check would refuse", () => {
    // Exhaustive over the range a cash wallet actually lives in, plus the
    // boundaries where the one-unit fee floor dominates the percentage.
    for (let balance = 1; balance <= 5_000; balance += 1) {
      const amount = maxAmountWithinFeeCap(balance)
      expect(amount + reservedFeeCapFor(amount)).toBeLessThanOrEqual(balance)
    }
  })

  it("offers the largest amount that fits — not a needlessly conservative one", () => {
    for (let balance = 2; balance <= 5_000; balance += 1) {
      const amount = maxAmountWithinFeeCap(balance)
      const nextUp = amount + 1
      expect(nextUp + reservedFeeCapFor(nextUp)).toBeGreaterThan(balance)
    }
  })

  it("yields nothing spendable when the balance cannot cover the minimum fee", () => {
    // One minor unit: any send needs at least a 1-unit fee on top, so there
    // is no amount that fits. The chip greys out rather than filling a 1.
    expect(maxAmountWithinFeeCap(1)).toBe(0)
    expect(maxAmountWithinFeeCap(0)).toBe(0)
    expect(maxAmountWithinFeeCap(-5)).toBe(0)
    expect(maxAmountWithinFeeCap(NaN)).toBe(0)
  })

  it("mirrors the backend cap: 50 bps with a one-unit floor", () => {
    expect(reservedFeeCapFor(10_000)).toBe(50)
    expect(reservedFeeCapFor(1_000)).toBe(5)
    // Below 200 the percentage floors to zero, so the one-unit floor applies.
    expect(reservedFeeCapFor(100)).toBe(1)
    expect(reservedFeeCapFor(1)).toBe(1)
  })

  it("still explains the shortfall to the user", () => {
    // Without a note the amount screen would silently show less than the
    // balance the user can see on the home screen.
    expect(
      noteForResult({ amount: 439, reason: "fee-unavailable", feeReserved: 3 }),
    ).toEqual({ kind: "fee-reserved", feeReserved: 3 })
  })

  it("intraledger is untouched — genuinely fee-free, so MAX stays the full balance", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 442,
      fetchFee: async () => null,
    })

    expect(result).toEqual({ amount: 442, reason: "intraledger-full-balance" })
  })
})
