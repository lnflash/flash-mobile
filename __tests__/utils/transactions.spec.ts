import type { Payment } from "@breeztech/breez-sdk-spark-react-native"
import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, MoneyAmount, WalletOrDisplayCurrency } from "@app/types/amounts"
import { formatBreezPayment } from "@app/utils/transactions"

describe("formatBreezPayment", () => {
  it("converts Breez payments to the user's display currency", () => {
    const convertMoneyAmount = jest.fn(
      <T extends WalletOrDisplayCurrency>(
        amount: MoneyAmount<WalletOrDisplayCurrency>,
        currency: T,
      ): MoneyAmount<T> => ({
        amount: amount.amount * 2,
        currency,
        currencyCode: currency === DisplayCurrency ? "JMD" : currency,
      }),
    )

    formatBreezPayment({
      payment: {
        amount: 100,
        fees: 1,
      } as unknown as Payment,
      convertMoneyAmount,
    })

    expect(convertMoneyAmount).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: 100, currency: WalletCurrency.Btc }),
      DisplayCurrency,
    )
    expect(convertMoneyAmount).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amount: 1, currency: WalletCurrency.Btc }),
      DisplayCurrency,
    )
  })
})
