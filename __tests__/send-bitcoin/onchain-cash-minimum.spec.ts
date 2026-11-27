// Contract test for work order 01 (flash-onchain-send). Written by Claude; the
// worker makes it pass without changing it.
//
// The Cash Account's on-chain minimum for an amount in dollars follows the
// server's: 5,500 sats, priced at the rate the payment is converted at and
// rounded up to a whole cent (isValidAmount, cashOnchainMinimumCents). A
// request that fixes its sats is held to the sats themselves.
import { WalletCurrency } from "@app/graphql/generated"
import {
  AmountInvalidReason,
  ConvertMoneyAmount,
  cashOnchainMinimumCents,
  createAmountOnchainPaymentDetails,
  createNoAmountOnchainPaymentDetails,
  isValidAmount,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

// A fixture price in cents per sat. 0.0625 (US$62,500 a bitcoin) is exact in
// binary: 5,500 sats are 343.75 cents, so the minimum is 344 cents.
const at =
  (centsPerSat: number): ConvertMoneyAmount =>
  (money, currency) => ({
    amount:
      money.currency === currency
        ? money.amount
        : money.currency === "BTC"
        ? money.amount * centsPerSat
        : currency === "BTC"
        ? Math.round(money.amount / centsPerSat)
        : money.amount,
    currency,
    currencyCode: currency,
  })

const address = "bc1q-cash-minimum-recipient"
const balances = {
  usdWalletAmount: toUsdMoneyAmount(10_000),
  btcWalletAmount: toBtcMoneyAmount(20_000),
}

const typed = (
  currency: WalletCurrency,
  amount: number,
  convertMoneyAmount: ConvertMoneyAmount = at(0.0625),
) =>
  createNoAmountOnchainPaymentDetails<WalletCurrency>({
    address,
    unitOfAccountAmount: { amount, currency, currencyCode: currency },
    convertMoneyAmount,
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })

const fixed = (currency: WalletCurrency, sats: number) =>
  createAmountOnchainPaymentDetails<WalletCurrency>({
    address,
    destinationSpecifiedAmount: toBtcMoneyAmount(sats),
    convertMoneyAmount: at(0.0625),
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })

describe("cashOnchainMinimumCents", () => {
  it("is what 5,500 sats are worth, rounded up to a whole cent", () => {
    expect(cashOnchainMinimumCents(at(0.0625))).toBe(344)
    // 5,500 sats are exactly 1,375 cents at 0.25 cents a sat: nothing to round.
    expect(cashOnchainMinimumCents(at(0.25))).toBe(1_375)
  })

  it("is NaN when the sats cannot be priced", () => {
    expect(Number.isNaN(cashOnchainMinimumCents(at(NaN)))).toBe(true)
  })
})

describe("the Cash Account's on-chain minimum for an amount in dollars", () => {
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`refuses an amount worth fewer than 5,500 sats from ${currency}, naming the minimum`, () => {
      expect(isValidAmount({ ...balances, paymentDetail: typed(currency, 343) })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.MinOnChainLimit,
        minimum: toUsdMoneyAmount(344),
      })
      expect(isValidAmount({ ...balances, paymentDetail: typed(currency, 344) })).toEqual({
        validAmount: true,
      })
    })

    it(`refuses US$2.50 from ${currency}, which the old US$2.00 floor let through`, () => {
      expect(isValidAmount({ ...balances, paymentDetail: typed(currency, 250) })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.MinOnChainLimit,
        minimum: toUsdMoneyAmount(344),
      })
    })

    it(`holds a request that fixes its sats from ${currency} to the sats, never to their price`, () => {
      // 5,500 sats are 343.75 cents here, under the 344-cent minimum for an
      // amount in dollars: the request is still valid, because it sends sats.
      expect(isValidAmount({ ...balances, paymentDetail: fixed(currency, 5_500) })).toEqual({
        validAmount: true,
      })
      expect(isValidAmount({ ...balances, paymentDetail: fixed(currency, 5_499) })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.MinOnChainSatLimit,
      })
    })

    it(`leaves the minimum to the server from ${currency} when the sats cannot be priced`, () => {
      expect(
        isValidAmount({ ...balances, paymentDetail: typed(currency, 250, at(NaN)) }),
      ).toEqual({ validAmount: true })
    })

    it(`still refuses an amount over the ${currency} balance first`, () => {
      expect(
        isValidAmount({ ...balances, paymentDetail: typed(currency, 10_001) }),
      ).toMatchObject({
        validAmount: false,
        invalidReason: AmountInvalidReason.InsufficientBalance,
      })
    })
  })

  it("keeps the Bitcoin Account's own minimum in sats", () => {
    expect(
      isValidAmount({ ...balances, paymentDetail: typed(WalletCurrency.Btc, 5_499) }),
    ).toEqual({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    })
    expect(
      isValidAmount({ ...balances, paymentDetail: typed(WalletCurrency.Btc, 5_500) }),
    ).toEqual({ validAmount: true })
  })
})
