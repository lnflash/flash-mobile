import React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { AccountLevel } from "@app/graphql/level-context"
import { WalletCurrency } from "@app/graphql/generated"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import {
  createAmountOnchainPaymentDetails,
  isValidAmount,
  type ConvertMoneyAmount,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { SendBitcoinDetailsExtraInfo } from "@app/screens/send-bitcoin-screen/send-bitcoin-details-extra-info"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({ formatMoneyAmount: jest.fn() }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn() }),
}))

// Ten sats per cent; the balance covers every request below.
const convert: ConvertMoneyAmount = (money, currency) => ({
  amount: money.currency === currency ? money.amount : money.amount / 10,
  currency,
  currencyCode: currency,
})
const address = "bc1q-fixed-request-recipient"

const renderFor = (currency: WalletCurrency, sats: number) => {
  const detail = createAmountOnchainPaymentDetails<WalletCurrency>({
    address,
    destinationSpecifiedAmount: toBtcMoneyAmount(sats),
    convertMoneyAmount: convert,
    sendingWalletDescriptor: { id: "cash-wallet", currency },
  })
  return render(
    <ThemeProvider theme={createTheme({})}>
      <SendBitcoinDetailsExtraInfo
        currentLevel={AccountLevel.One}
        amountStatus={isValidAmount({
          paymentDetail: detail,
          usdWalletAmount: toUsdMoneyAmount(2_000),
          btcWalletAmount: toBtcMoneyAmount(20_000),
        })}
      />
    </ThemeProvider>,
  )
}

describe("fixed Bitcoin request from Cash Account", () => {
  beforeAll(() => loadLocale("en"))
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    it(`shows the sat minimum for a request under 5,500 sats from ${currency}`, () => {
      const screen = renderFor(currency, 5_499)
      expect(
        screen.getByText(
          "Minimum amount for this transaction is 5,500 sats. For smaller payments, ask the recipient for a Lightning invoice.",
        ),
      ).toBeTruthy()
    })

    it(`shows no error for an affordable request from ${currency}`, () => {
      const screen = renderFor(currency, 6_000)
      expect(screen.toJSON()).toBeNull()
    })
  })
})
