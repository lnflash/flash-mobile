import {
  computeMaxSendAmount,
  effectiveMaxPaymentType,
  lnurlBoundInWalletUnits,
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

  it("falls back to the full balance when no fee estimate is available", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => null,
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })

  it("falls back to the full balance when the fee fetch throws", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => {
        throw new Error("network down")
      },
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })

  it("falls back to the full balance when the fee fetch hangs past the timeout", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      // never resolves
      fetchFee: () => new Promise(() => {}),
      timeoutMs: 20,
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
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

    expect(negative).toEqual({ amount: 100_000, reason: "fee-unavailable" })
    expect(nan).toEqual({ amount: 100_000, reason: "fee-unavailable" })
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

// Amounts are entered and sent in whole minor units, so a bound left
// fractional is a bound the user can never type — and the message that names
// it rounds to an amount the validator then refuses (ENG-556).
describe("lnurlBoundInWalletUnits", () => {
  // 100 sats at $64,000/BTC = 6.4c.
  const at64k = (sats: number) => sats * 0.064

  it("rounds a minimum UP to the smallest typeable amount that clears it", () => {
    expect(
      lnurlBoundInWalletUnits({
        sats: 100,
        convertSatsToWallet: at64k,
        rounding: "ceil",
      }),
    ).toBe(7)
  })

  it("rounds a maximum DOWN to the largest typeable amount the receiver accepts", () => {
    expect(
      lnurlBoundInWalletUnits({
        sats: 16_000_000,
        convertSatsToWallet: (sats) => sats * 0.0650001,
        rounding: "floor",
      }),
    ).toBe(1_040_001)
  })

  it("leaves an already-whole bound alone", () => {
    expect(
      lnurlBoundInWalletUnits({
        sats: 100,
        convertSatsToWallet: (sats) => sats * 0.05,
        rounding: "ceil",
      }),
    ).toBe(5)
  })

  it("does not inflate a whole bound that float arithmetic overshoots", () => {
    // 100 * 0.07 is 7.000000000000001 in IEEE-754. A naive ceil names 8c as
    // the floor of a bound the receiver already accepts at 7c.
    expect(
      lnurlBoundInWalletUnits({
        sats: 100,
        convertSatsToWallet: (sats) => sats * 0.07,
        rounding: "ceil",
      }),
    ).toBe(7)
  })

  it("does not deflate a whole bound that float arithmetic undershoots", () => {
    // 100 * 0.29 is 28.999999999999996 in IEEE-754. A naive floor throws away
    // a whole cent of a ceiling that is really 29c.
    expect(
      lnurlBoundInWalletUnits({
        sats: 100,
        convertSatsToWallet: (sats) => sats * 0.29,
        rounding: "floor",
      }),
    ).toBe(29)
  })

  it("passes NaN through so a missing price keeps its existing handling", () => {
    expect(
      lnurlBoundInWalletUnits({
        sats: 100,
        convertSatsToWallet: () => NaN,
        rounding: "ceil",
      }),
    ).toBeNaN()
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

  // The doubling rate above is integral, so every case around it stays green
  // whether or not the cap is quantized. This one pins the quantization
  // itself: without the "floor" wiring the cap comes back as 6.5 cents, which
  // the number pad cannot hold.
  it("USD wallet: floors a fractional converted cap to a whole cent", () => {
    expect(
      resolveRecipientCap({
        walletCurrency: "USD",
        paymentType: "lnurl",
        receiverMaxSats: null,
        lnurlParamsMaxSats: 100,
        convertSatsToWallet: (sats) => sats * 0.065,
      }),
    ).toBe(6)
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
