import { WalletCurrency } from "@app/graphql/generated"
import {
  ConvertMoneyAmount,
  PaymentDetail,
  isValidAmount,
} from "@app/screens/send-bitcoin-screen/payment-details"
import {
  MoneyAmount,
  USDT_MICROS_PER_USD_CENT,
  WalletOrDisplayCurrency,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
} from "@app/types/amounts"
import { PaymentType } from "@galoymoney/client"

const convertMoneyAmount: ConvertMoneyAmount = <T extends WalletOrDisplayCurrency>(
  amount: MoneyAmount<WalletOrDisplayCurrency>,
  currency: T,
): MoneyAmount<T> => {
  let convertedAmount = amount.amount

  if (amount.currency === WalletCurrency.Usd && currency === WalletCurrency.Usdt) {
    convertedAmount = amount.amount * USDT_MICROS_PER_USD_CENT
  } else if (
    amount.currency === WalletCurrency.Usdt &&
    currency === WalletCurrency.Usd
  ) {
    convertedAmount = amount.amount / USDT_MICROS_PER_USD_CENT
  }

  return {
    amount: convertedAmount,
    currency,
    currencyCode: currency,
  }
}

const createPaymentDetail = ({
  settlementAmount,
}: {
  settlementAmount: MoneyAmount<WalletCurrency>
}) =>
  ({
    settlementAmount,
    unitOfAccountAmount: toUsdMoneyAmount(5),
    paymentType: PaymentType.Intraledger,
    convertMoneyAmount,
  }) as PaymentDetail<WalletCurrency>

describe("isValidAmount", () => {
  it("compares USDT settlement micros against API balance cents", () => {
    const paymentDetail = createPaymentDetail({
      settlementAmount: {
        amount: 5 * USDT_MICROS_PER_USD_CENT,
        currency: WalletCurrency.Usdt,
        currencyCode: "USD",
      },
    })

    expect(
      isValidAmount({
        paymentDetail,
        usdWalletAmount: toUsdMoneyAmount(124),
        btcWalletAmount: toBtcMoneyAmount(0),
      }),
    ).toEqual({ validAmount: true })
  })

  it("rejects USDT settlement micros only when they exceed API balance cents", () => {
    const paymentDetail = createPaymentDetail({
      settlementAmount: {
        amount: 125 * USDT_MICROS_PER_USD_CENT,
        currency: WalletCurrency.Usdt,
        currencyCode: "USD",
      },
    })

    expect(
      isValidAmount({
        paymentDetail,
        usdWalletAmount: toUsdMoneyAmount(124),
        btcWalletAmount: toBtcMoneyAmount(0),
      }),
    ).toEqual({
      validAmount: false,
      invalidReason: "InsufficientBalance",
      balance: toUsdMoneyAmount(124),
    })
  })
})
