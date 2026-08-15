import {
  buildMaxAmountButton,
  BuildMaxAmountButtonArgs,
} from "../../app/screens/send-bitcoin-screen/max-amount-button"

type TestMoneyAmount = { amount: number; currency: string; currencyCode: string }
// Sentinel getFee handle: the factory must pass the probe detail's getFee
// through to getIbexFee untouched.
type TestGetFee = { probeAmount: number }
type TestPayRequest = { callback: string }

const usdBalance: TestMoneyAmount = {
  amount: 10_000,
  currency: "USD",
  currencyCode: "USD",
}

const btcBalance: TestMoneyAmount = {
  amount: 100_000,
  currency: "BTC",
  currencyCode: "SAT",
}

const strings = {
  intraledger: () => "intraledger note",
  feeReserved: (fee: string) => `fee note: ${fee}`,
  recipientCap: (max: string) => `cap note: ${max}`,
}

type TestArgs = BuildMaxAmountButtonArgs<TestMoneyAmount, TestGetFee, TestPayRequest>

const makeArgs = (overrides: Partial<TestArgs> = {}): TestArgs => ({
  canSetAmount: true,
  paymentType: "lightning",
  walletCurrency: "USD",
  balanceMoneyAmount: usdBalance,
  destination: "lnbc1invoice",
  flashUserAddress: undefined,
  selectedFeeType: undefined,
  knownPayRequest: undefined,
  receiverMaxSats: null,
  lnurlParamsMaxSats: null,
  convertSatsToWallet: (sats: number) => sats,
  fetchBreezFee: jest.fn(async () => ({ fee: 0, err: null })),
  setAmount: jest.fn((amount: TestMoneyAmount) => ({
    getFee: { probeAmount: amount.amount },
  })),
  getIbexFee: jest.fn(async () => ({ amount: 0 })),
  formatDisplayAmount: (moneyAmount: TestMoneyAmount) =>
    `$${(moneyAmount.amount / 100).toFixed(2)}`,
  strings,
  ...overrides,
})

describe("buildMaxAmountButton", () => {
  describe("gating", () => {
    it("returns undefined when the amount cannot be set", () => {
      expect(buildMaxAmountButton(makeArgs({ canSetAmount: false }))).toBeUndefined()
    })

    it("returns undefined when the payment detail has no setAmount", () => {
      expect(buildMaxAmountButton(makeArgs({ setAmount: undefined }))).toBeUndefined()
    })

    it("returns undefined for onchain (unsupported payment type)", () => {
      expect(buildMaxAmountButton(makeArgs({ paymentType: "onchain" }))).toBeUndefined()
    })

    it("builds a button for intraledger, lightning and lnurl", () => {
      for (const paymentType of ["intraledger", "lightning", "lnurl"] as const) {
        expect(buildMaxAmountButton(makeArgs({ paymentType }))).toBeDefined()
      }
    })
  })

  describe("disabled state", () => {
    it("is enabled for a positive whole-cent balance", () => {
      const button = buildMaxAmountButton(makeArgs())
      expect(button?.disabled).toBe(false)
    })

    it("is disabled for a zero balance", () => {
      const button = buildMaxAmountButton(
        makeArgs({ balanceMoneyAmount: { ...usdBalance, amount: 0 } }),
      )
      expect(button?.disabled).toBe(true)
    })

    // A USD wallet drained by a MAX send holds fractional cents (on-device:
    // 0.9346). Nothing is spendable, so the chip must grey out — a bare
    // `amount > 0` check would leave it tappable over an unspendable residue.
    it("is disabled for a sub-cent balance", () => {
      const button = buildMaxAmountButton(
        makeArgs({ balanceMoneyAmount: { ...usdBalance, amount: 0.9346 } }),
      )
      expect(button?.disabled).toBe(true)
    })

    it("is disabled for a NaN balance (wallet still loading)", () => {
      const button = buildMaxAmountButton(
        makeArgs({ balanceMoneyAmount: { ...usdBalance, amount: Number.NaN } }),
      )
      expect(button?.disabled).toBe(true)
    })
  })

  describe("compute zero-balance escape", () => {
    it("resolves null for a sub-cent balance instead of filling an empty amount", async () => {
      const button = buildMaxAmountButton(
        makeArgs({ balanceMoneyAmount: { ...usdBalance, amount: 0.9346 } }),
      )

      await expect(button?.compute()).resolves.toBeNull()
    })

    it("resolves null when the balance raced to zero after the chip rendered", async () => {
      const button = buildMaxAmountButton(
        makeArgs({ balanceMoneyAmount: { ...usdBalance, amount: 0 } }),
      )

      await expect(button?.compute()).resolves.toBeNull()
    })

    it("resolves null when the fee estimate meets or exceeds the balance", async () => {
      // { amount: 0, reason: "fee-reserved" } — not "zero-balance" — must
      // also leave the pad untouched (BTC wallet with 20 sats, fee 26).
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: { ...btcBalance, amount: 20 },
          fetchBreezFee: jest.fn(async () => ({ fee: 26, err: null })),
        }),
      )

      await expect(button?.compute()).resolves.toBeNull()
    })

    it("resolves null when the receiver advertises a zero maxSendable cap", async () => {
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          receiverMaxSats: 0,
        }),
      )

      await expect(button?.compute()).resolves.toBeNull()
    })
  })

  describe("Breez fetchFee adapter (BTC wallet)", () => {
    it("reserves the returned fee and probes with the destination", async () => {
      const fetchBreezFee = jest.fn(async () => ({ fee: 250, err: null }))
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          fetchBreezFee,
        }),
      )

      const result = await button?.compute()

      expect(fetchBreezFee).toHaveBeenCalledWith({
        paymentType: "lightning",
        paymentRequest: "lnbc1invoice",
        amountSats: 100_000,
        selectedFeeType: undefined,
        knownPayRequest: undefined,
      })
      expect(result?.amount).toEqual({ ...btcBalance, amount: 99_750 })
    })

    it("prefers the flash user address over the raw destination", async () => {
      const fetchBreezFee = jest.fn(async () => ({ fee: 250, err: null }))
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          flashUserAddress: "user@flashapp.me",
          fetchBreezFee,
        }),
      )

      await button?.compute()

      expect(fetchBreezFee).toHaveBeenCalledWith(
        expect.objectContaining({ paymentRequest: "user@flashapp.me" }),
      )
    })

    it("reuses the known pay request so probes skip re-resolving the LNURL service", async () => {
      const knownPayRequest: TestPayRequest = { callback: "https://lnurl.example" }
      const fetchBreezFee = jest.fn(async () => ({ fee: 250, err: null }))
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          paymentType: "lnurl",
          balanceMoneyAmount: btcBalance,
          knownPayRequest,
          fetchBreezFee,
        }),
      )

      await button?.compute()

      expect(fetchBreezFee).toHaveBeenCalledWith(
        expect.objectContaining({ knownPayRequest }),
      )
    })

    it("passes the selected fee type through to the probe", async () => {
      const fetchBreezFee = jest.fn(async () => ({ fee: 250, err: null }))
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          selectedFeeType: "fast",
          fetchBreezFee,
        }),
      )

      await button?.compute()

      expect(fetchBreezFee).toHaveBeenCalledWith(
        expect.objectContaining({ selectedFeeType: "fast" }),
      )
    })

    // The err-to-null mapping: a probe error means NO estimate — even when
    // the response carries a fee number. Inverting `err ? null : fee` to
    // `err ? fee : null` must fail this test.
    it("maps a probe error to no estimate even when a fee number is present", async () => {
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          fetchBreezFee: jest.fn(async () => ({ fee: 999, err: "bounds error" })),
        }),
      )

      const result = await button?.compute()

      // fee-unavailable falls back to the full balance — no fee subtracted.
      expect(result?.amount).toEqual(btcBalance)
      expect(result?.note).toBeUndefined()
    })

    it("routes BTC-wallet intraledger through the fee path (not the no-fee arm)", async () => {
      const fetchBreezFee = jest.fn(async () => ({ fee: 300, err: null }))
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          paymentType: "intraledger",
          balanceMoneyAmount: btcBalance,
          fetchBreezFee,
        }),
      )

      const result = await button?.compute()

      expect(fetchBreezFee).toHaveBeenCalled()
      expect(result?.amount).toEqual({ ...btcBalance, amount: 99_700 })
      expect(result?.note).toBe("fee note: $3.00")
    })

    it("clamps to the receiver's resolved maxSendable on the BTC wallet", async () => {
      const button = buildMaxAmountButton(
        makeArgs({
          walletCurrency: "BTC",
          balanceMoneyAmount: btcBalance,
          receiverMaxSats: 50_000,
          fetchBreezFee: jest.fn(async () => ({ fee: 250, err: null })),
        }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual({ ...btcBalance, amount: 50_000 })
      expect(result?.note).toBe("cap note: $500.00")
    })
  })

  describe("USD probe-detail construction", () => {
    it("builds the probe detail via setAmount and hands its getFee to getIbexFee", async () => {
      const setAmount = jest.fn((amount: TestMoneyAmount) => ({
        getFee: { probeAmount: amount.amount },
      }))
      const getIbexFee = jest.fn(async (getFee: TestGetFee | undefined) =>
        getFee ? { amount: 30 } : undefined,
      )
      const button = buildMaxAmountButton(makeArgs({ setAmount, getIbexFee }))

      const result = await button?.compute()

      // The probe detail is the balance with the probe amount swapped in.
      expect(setAmount).toHaveBeenCalledWith({ ...usdBalance, amount: 10_000 })
      expect(getIbexFee).toHaveBeenCalledWith({ probeAmount: 10_000 })
      expect(result?.amount).toEqual({ ...usdBalance, amount: 9_970 })
      expect(result?.note).toBe("fee note: $0.30")
    })

    it("probes at the cap-clamped amount when the LNURL cap binds", async () => {
      const setAmount = jest.fn((amount: TestMoneyAmount) => ({
        getFee: { probeAmount: amount.amount },
      }))
      const button = buildMaxAmountButton(
        makeArgs({
          paymentType: "lnurl",
          setAmount,
          // 2 wallet minor units per sat.
          convertSatsToWallet: (sats: number) => sats * 2,
          lnurlParamsMaxSats: 2_000,
        }),
      )

      await button?.compute()

      expect(setAmount).toHaveBeenCalledWith({ ...usdBalance, amount: 4_000 })
    })

    it("falls back to the full balance when no IBEX estimate is available", async () => {
      const button = buildMaxAmountButton(
        makeArgs({ getIbexFee: jest.fn(async () => undefined) }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual(usdBalance)
      expect(result?.note).toBeUndefined()
    })

    it("never calls the Breez probe for a USD wallet", async () => {
      const fetchBreezFee = jest.fn(async () => ({ fee: 1, err: null }))
      const button = buildMaxAmountButton(makeArgs({ fetchBreezFee }))

      await button?.compute()

      expect(fetchBreezFee).not.toHaveBeenCalled()
    })
  })

  describe("note mapping", () => {
    it("USD intraledger gets the no-fee note and skips the fee probe", async () => {
      const getIbexFee = jest.fn(async () => ({ amount: 30 }))
      const button = buildMaxAmountButton(
        makeArgs({ paymentType: "intraledger", getIbexFee }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual(usdBalance)
      expect(result?.note).toBe("intraledger note")
      expect(getIbexFee).not.toHaveBeenCalled()
    })

    it("formats the reserved fee in display currency", async () => {
      const button = buildMaxAmountButton(
        makeArgs({ getIbexFee: jest.fn(async () => ({ amount: 125 })) }),
      )

      const result = await button?.compute()

      expect(result?.note).toBe("fee note: $1.25")
    })

    it("omits the fee note for a zero fee (a $0.00 reservation is nonsense)", async () => {
      const button = buildMaxAmountButton(
        makeArgs({ getIbexFee: jest.fn(async () => ({ amount: 0 })) }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual(usdBalance)
      expect(result?.note).toBeUndefined()
    })

    it("omits the note when no display-currency string is available", async () => {
      const button = buildMaxAmountButton(
        makeArgs({
          getIbexFee: jest.fn(async () => ({ amount: 125 })),
          formatDisplayAmount: () => undefined,
        }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual({ ...usdBalance, amount: 9_875 })
      expect(result?.note).toBeUndefined()
    })

    it("formats the recipient cap in display currency", async () => {
      const button = buildMaxAmountButton(
        makeArgs({
          paymentType: "lnurl",
          convertSatsToWallet: (sats: number) => sats * 2,
          lnurlParamsMaxSats: 2_000,
          getIbexFee: jest.fn(async () => ({ amount: 0 })),
        }),
      )

      const result = await button?.compute()

      expect(result?.amount).toEqual({ ...usdBalance, amount: 4_000 })
      expect(result?.note).toBe("cap note: $40.00")
    })
  })
})
