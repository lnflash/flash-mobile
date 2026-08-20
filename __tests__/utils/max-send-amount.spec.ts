import {
  computeMaxSendAmount,
  effectiveMaxPaymentType,
  maxChipSupportsPaymentType,
  noteForResult,
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

    // 100_000 − 320 fee − 1 unit of slack: the estimate was priced against
    // the probe invoice, not the one the send will actually pay.
    expect(result).toEqual({
      amount: 99_679,
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
      amount: 99_739,
      reason: "fee-reserved",
      feeReserved: 260,
    })
  })

  it("proposes nothing when no fee estimate is available", async () => {
    // The LNURL case before #702's probe: nothing can price the send. The
    // old behaviour offered the full 100_000, which the send then refused
    // because the fee lands on top (ENG-554). Guessing a reserve would be no
    // better — nothing in this app knows what IBEX charges — so it declines.
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => null,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-unavailable" })
  })

  it("proposes nothing when the fee fetch throws", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => {
        throw new Error("network down")
      },
    })

    expect(result).toEqual({ amount: 0, reason: "fee-unavailable" })
  })

  it("proposes nothing when the fee fetch hangs past the timeout", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      // never resolves
      fetchFee: () => new Promise(() => {}),
      timeoutMs: 20,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-unavailable" })
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
    // fills 99_699 — confirm-safe with a unit to spare
    // (99_699 + 300 = 99_999 < 100_000).
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
      amount: 99_699,
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
      amount: 99_499,
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

  it("offers nothing when unpriceable, even where a recipient cap would bind", async () => {
    // The cap is not a safe fallback: sending exactly the cap still needs a
    // fee on top, and that fee is the thing we could not determine.
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee: async () => null,
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-unavailable" })
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

    // Both take the no-estimate path: no number is proposed at all.
    expect(negative).toEqual({ amount: 0, reason: "fee-unavailable" })
    expect(nan).toEqual({ amount: 0, reason: "fee-unavailable" })
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

      expect(result).toEqual({ amount: 108, reason: "fee-reserved", feeReserved: 0 })
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

  it("zero-balance gets no note; fee-unavailable explains itself", () => {
    expect(noteForResult({ amount: 0, reason: "zero-balance" })).toEqual({
      kind: "none",
    })
    expect(noteForResult({ amount: 0, reason: "fee-unavailable" })).toEqual({
      kind: "fee-unknown",
    })
  })
})

describe("an unpriceable destination is never guessed at (ENG-554)", () => {
  // The bug: MAX filled the full $4.42 balance for an LNURL destination, the
  // fee landed on top, and the send was refused. The first fix reserved a
  // constant borrowed from flash's FEECAP_BASIS_POINTS — but that governs
  // galoy's payment flow, and lnNoAmountUsdInvoicePaymentSend bypasses it
  // entirely to call Ibex.payInvoice, so the number bounded nothing real.
  it("does not offer the reported 442-cent balance when it cannot be priced", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 442,
      fetchFee: async () => null,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-unavailable" })
  })

  it("uses the real fee once the destination can be priced", async () => {
    // With #702's probe the LNURL path gets a genuine IBEX estimate, so the
    // max is balance minus that fee — no invented constant anywhere.
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 442,
      fetchFee: async () => 2,
    })

    expect(result).toEqual({ amount: 439, reason: "fee-reserved", feeReserved: 2 })
  })

  it("probes at the amount it is about to offer, not some other one", async () => {
    // Fees are monotone in amount, so probing above the final amount is safe
    // and probing below is not. Pin which amount reaches the probe.
    const fetchFee = jest.fn(async () => 5)

    await computeMaxSendAmount({ paymentType: "lnurl", balance: 1_000, fetchFee })

    expect(fetchFee).toHaveBeenCalledWith(1_000)
  })

  it("explains itself rather than looking like a broken tap", () => {
    expect(noteForResult({ amount: 0, reason: "fee-unavailable" })).toEqual({
      kind: "fee-unknown",
    })
  })
})

describe("the reserved fee leaves slack for the invoice the send actually pays", () => {
  // The probe prices a THROWAWAY invoice minted at the probe amount; pressing
  // Next mints a fresh invoice at balance − fee and re-prices that one.
  // Amount-monotonicity says a smaller amount is not dearer on the same route
  // — it says nothing about invoice-to-invoice route variance. So the max
  // reserves ceil(fee) plus one whole minor unit.
  it("rounds a fractional fee up rather than leaving sub-unit margin", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 442,
      fetchFee: async () => 0.5,
    })

    // Not 441 (442 − 0.5 floored): ceil(0.5) = 1, then a unit of slack.
    expect(result).toEqual({ amount: 440, reason: "fee-reserved", feeReserved: 0.5 })
  })

  it("survives the confirm-time re-price that used to dead-end the send", async () => {
    // The regression band, exactly: balance 442¢, probe fee 0.5¢. The old
    // `floor(balance - fee)` filled 441¢; the final invoice priced at 1.5¢ and
    // fetchSendingFee blocked with "amount exceeds balance (amount + fee)".
    const balance = 442
    const confirmTimeFee = 1.5

    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance,
      fetchFee: async () => 0.5,
    })

    expect(result.amount + confirmTimeFee).toBeLessThanOrEqual(balance)
  })

  it("reserves the slack for a zero fee too (the estimate is not a cap)", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => 0,
    })

    expect(result).toEqual({ amount: 99_999, reason: "fee-reserved", feeReserved: 0 })
  })

  it("still never goes negative when the slack would push below zero", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 1,
      fetchFee: async () => 0,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-reserved", feeReserved: 0 })
  })

  it("leaves the fee-free intraledger arm at the full balance", async () => {
    // No probe, no invoice, no re-price — nothing to leave slack for.
    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 100_000,
      fetchFee: jest.fn(),
    })

    expect(result).toEqual({ amount: 100_000, reason: "intraledger-full-balance" })
  })
})
