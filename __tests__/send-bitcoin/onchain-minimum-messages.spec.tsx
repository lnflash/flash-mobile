// The send screen's two on-chain minimum messages read as two sentences, and
// the Cash Account's names what 5,500 sats are worth.
import React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render } from "@testing-library/react-native"

import { AccountLevel } from "@app/graphql/level-context"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import {
  AmountInvalidReason,
  type AmountStatus,
} from "@app/screens/send-bitcoin-screen/payment-details"
import { SendBitcoinDetailsExtraInfo } from "@app/screens/send-bitcoin-screen/send-bitcoin-details-extra-info"
import { toUsdMoneyAmount } from "@app/types/amounts"

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@app/hooks/use-display-currency", () => ({
  useDisplayCurrency: () => ({
    formatMoneyAmount: ({ moneyAmount }: { moneyAmount: { amount: number } }) =>
      `$${(moneyAmount.amount / 100).toFixed(2)}`,
  }),
}))
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn() }),
}))

const renderFor = (amountStatus: AmountStatus) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <SendBitcoinDetailsExtraInfo
        currentLevel={AccountLevel.One}
        amountStatus={amountStatus}
      />
    </ThemeProvider>,
  )

describe("on-chain minimum messages", () => {
  beforeAll(() => loadLocale("en"))

  it("ends the sat minimum with a full stop before the Lightning hint", () => {
    const screen = renderFor({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainSatLimit,
    })
    expect(
      screen.getByText(
        "Minimum amount for this transaction is 5,500 sats. For smaller payments, ask the recipient for a Lightning invoice.",
      ),
    ).toBeTruthy()
  })

  it("names what 5,500 sats are worth for an amount in dollars from the Cash Account", () => {
    const screen = renderFor({
      validAmount: false,
      invalidReason: AmountInvalidReason.MinOnChainLimit,
      minimum: toUsdMoneyAmount(331),
    })
    expect(
      screen.getByText(
        "Minimum amount for this transaction is 5,500 sats, about $3.31. For smaller payments, ask the recipient for a Lightning invoice.",
      ),
    ).toBeTruthy()
  })
})
