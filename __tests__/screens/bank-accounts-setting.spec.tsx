/**
 * BankAccountsSetting — the Settings row for the bank accounts hub.
 *
 * Shown when the user can hold local (Jamaican) accounts OR Bridge is enabled;
 * hidden only when neither applies.
 */

import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { fireEvent, render } from "@testing-library/react-native"

import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"

const mockNavigate = jest.fn()
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

let mockBridgeTopupEnabled = false
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ bridgeTopupEnabled: mockBridgeTopupEnabled }),
}))
let mockBankPayout = false
jest.mock("@app/hooks/use-account-status", () => ({
  useAccountStatus: () => ({ capabilities: { bankPayout: mockBankPayout } }),
}))

import { BankAccountsSetting } from "@app/screens/settings-screen/settings/bank-accounts"

loadLocale("en")
const en = i18nObject("en")

const renderRow = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <BankAccountsSetting />
    </ThemeProvider>,
  )

describe("BankAccountsSetting", () => {
  const cases: [boolean, boolean, boolean][] = [
    [true, true, true],
    [true, false, true],
    // ENG-465 kill switch no longer hides the row from bank-payout users.
    [false, true, true],
    [false, false, false],
  ]
  cases.forEach(([bridge, bankPayout, visible]) => {
    it(`bridge=${bridge} bankPayout=${bankPayout} → visible=${visible}`, () => {
      mockBridgeTopupEnabled = bridge
      mockBankPayout = bankPayout
      const screen = renderRow()

      expect(Boolean(screen.queryByText(en.BankAccountsScreen.title()))).toBe(visible)
    })
  })

  it("opens the hub", () => {
    mockBridgeTopupEnabled = false
    mockBankPayout = true
    const screen = renderRow()

    fireEvent.press(screen.getByText(en.BankAccountsScreen.title()))

    expect(mockNavigate).toHaveBeenCalledWith("BankAccounts")
  })
})
