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

let mockAdvancedMode = false
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: mockAdvancedMode },
  }),
}))
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

// Ten sats per cent; the fixed request is affordable and above both on-chain floors.
const convert: ConvertMoneyAmount = (money, currency) => ({
  amount: money.currency === currency ? money.amount : money.amount / 10,
  currency,
  currencyCode: currency,
})
const address = "bc1q-fixed-request-recipient"

describe("fixed Bitcoin request recovery from Cash Account", () => {
  beforeAll(() => loadLocale("en"))
  ;[WalletCurrency.Usd, WalletCurrency.Usdt].forEach((currency) => {
    ;[false, true].forEach((advancedMode) => {
      it(`explains the available recovery from ${currency}, advanced mode: ${advancedMode}`, () => {
        mockAdvancedMode = advancedMode
        const detail = createAmountOnchainPaymentDetails<WalletCurrency>({
          address,
          destinationSpecifiedAmount: toBtcMoneyAmount(6_000),
          convertMoneyAmount: convert,
          sendingWalletDescriptor: { id: "cash-wallet", currency },
        })
        const screen = render(
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

        const expectedInstruction = advancedMode
          ? "Use your Bitcoin Account to pay the exact Bitcoin amount in this request."
          : "Enable your Bitcoin Account (Advanced Mode) in Settings to pay the exact Bitcoin amount in this request."
        expect(
          screen.getByText(
            `${expectedInstruction} For smaller payments, ask the recipient for a Lightning invoice.`,
          ),
        ).toBeTruthy()
        expect(detail.destination).toBe(address)
        expect(detail.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_000))
        expect(detail.canGetFee).toBe(false)
        expect(detail.getFee).toBeUndefined()
        expect(detail.canSendPayment).toBe(false)
        expect(detail.sendPaymentMutation).toBeUndefined()

        const switched = detail.setSendingWalletDescriptor({
          id: "bitcoin-wallet",
          currency: WalletCurrency.Btc,
        })
        expect(switched.destination).toBe(address)
        expect(switched.destinationSpecifiedAmount).toEqual(toBtcMoneyAmount(6_000))
        expect(switched.settlementAmount).toEqual(toBtcMoneyAmount(6_000))
      })
    })
  })
})
