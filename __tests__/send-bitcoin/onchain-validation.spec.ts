import { WalletCurrency } from "@app/graphql/generated"
import {
  AmountInvalidReason,
  ConvertMoneyAmount,
  createAmountOnchainPaymentDetails,
  createNoAmountOnchainPaymentDetails,
  isValidAmount,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

// A stable fixture price: ten sats per cent. Cash values remain cents for USD/USDT.
const convert: ConvertMoneyAmount = (money, currency) => ({
  amount:
    money.currency === currency
      ? money.amount
      : money.currency === "BTC"
      ? money.amount / 10
      : currency === "BTC"
      ? money.amount * 10
      : money.amount,
  currency,
  currencyCode: currency,
})
const address = "bc1q-test-recipient"
const fixedRequest = (currency: WalletCurrency, sats: number) =>
  createAmountOnchainPaymentDetails({
    address,
    destinationSpecifiedAmount: toBtcMoneyAmount(sats),
    convertMoneyAmount: convert,
    sendingWalletDescriptor: { id: `${currency}-wallet`, currency },
  })
const balances = {
  usdWalletAmount: toUsdMoneyAmount(2_000),
  btcWalletAmount: toBtcMoneyAmount(20_000),
}

describe("on-chain request validation", () => {
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`blocks the reported 68-sat request from ${currency} Cash Account before a fee or send`, () => {
      const detail = fixedRequest(currency, 68)
      expect(isValidAmount({ ...balances, paymentDetail: detail })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.MinOnChainLimit,
      })
      expect(detail.canGetFee).toBe(false)
      expect(detail.canSendPayment).toBe(false)
      expect(detail.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(68))
    })
  })
  it("blocks 68 sats from Bitcoin Account with its actual on-chain minimum", () => {
    expect(
      isValidAmount({ ...balances, paymentDetail: fixedRequest("BTC", 68) }),
    ).toEqual({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    })
  })
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`asks for Bitcoin Account for an otherwise affordable fixed request from ${currency}`, () => {
      const detail = fixedRequest(currency, 6_000)
      expect(isValidAmount({ ...balances, paymentDetail: detail })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.OnChainBtcAmountCashWallet,
      })
      const switched = detail.setSendingWalletDescriptor({
        id: "btc-wallet",
        currency: WalletCurrency.Btc,
      })
      expect(switched.destination).toBe(address)
      expect(switched.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_000))
      expect(switched.settlementAmount).toEqual(toBtcMoneyAmount(6_000))
      expect(switched.canGetFee).toBe(true)
      expect(switched.canSendPayment).toBe(true)
      expect(isValidAmount({ ...balances, paymentDetail: switched })).toEqual({
        validAmount: true,
      })
    })
  })
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`keeps amount-free on-chain requests in ${currency} cash, enforcing the minimum and balance`, () => {
      const cash = (cents: number) =>
        createNoAmountOnchainPaymentDetails<WalletCurrency>({
          address,
          unitOfAccountAmount: { amount: cents, currency, currencyCode: currency },
          convertMoneyAmount: convert,
          sendingWalletDescriptor: { id: "cash-wallet", currency },
        })
      expect(isValidAmount({ ...balances, paymentDetail: cash(199) })).toEqual({
        validAmount: false,
        invalidReason: AmountInvalidReason.MinOnChainLimit,
      })
      const minimum = cash(200)
      expect(isValidAmount({ ...balances, paymentDetail: minimum })).toEqual({
        validAmount: true,
      })
      expect(minimum.canGetFee).toBe(true)
      expect(minimum.canSendPayment).toBe(true)
      expect(isValidAmount({ ...balances, paymentDetail: cash(2_001) })).toMatchObject({
        validAmount: false,
        invalidReason: AmountInvalidReason.InsufficientBalance,
      })
    })
  })
  it("keeps the Bitcoin minimum boundary and balance guard", () => {
    expect(
      isValidAmount({ ...balances, paymentDetail: fixedRequest("BTC", 5_499) }),
    ).toMatchObject({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    })
    expect(
      isValidAmount({ ...balances, paymentDetail: fixedRequest("BTC", 5_500) }),
    ).toEqual({ validAmount: true })
    expect(
      isValidAmount({ ...balances, paymentDetail: fixedRequest("BTC", 20_001) }),
    ).toMatchObject({
      validAmount: false,
      invalidReason: AmountInvalidReason.InsufficientBalance,
    })
  })
})
