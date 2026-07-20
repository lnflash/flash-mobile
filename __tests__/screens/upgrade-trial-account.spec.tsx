import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { UpgradeTrialAccount } from "../../app/screens/settings-screen/account/settings/upgrade-trial-account"

const mockNavigate = jest.fn()

// Driven per-test: the latestAccountUpgradeRequest status synced into redux.
let mockUpgradeStatus: string | undefined

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: { status: mockUpgradeStatus } }),
}))
jest.mock("@app/graphql/level-context", () => ({
  ...jest.requireActual("@app/graphql/level-context"),
  // Level One: past trial, below Three — the branch that renders the
  // request/edit upgrade button.
  useLevel: () => ({ currentLevel: "ONE" }),
}))
jest.mock(
  "../../app/screens/settings-screen/account/show-warning-secure-account-hook",
  () => ({
    useShowWarningSecureAccount: () => false,
  }),
)
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}))

const en = i18nObject("en")

const renderUpgrade = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <UpgradeTrialAccount />
    </ThemeProvider>,
  )

beforeEach(() => {
  mockNavigate.mockClear()
})

describe("UpgradeTrialAccount button", () => {
  it("navigates to the capability hub when no upgrade request is pending", () => {
    mockUpgradeStatus = undefined
    const { getAllByText } = renderUpgrade()

    fireEvent.press(getAllByText(en.TransactionLimitsScreen.requestUpgrade())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
  })

  it("navigates to the capability hub while an upgrade request is pending", () => {
    // Regression: the pending state used to reroute around the hub to
    // PersonalInformation, hiding the other capabilities (e.g. US virtual
    // account) that remain available.
    mockUpgradeStatus = "Pending"
    const { getAllByText } = renderUpgrade()

    fireEvent.press(getAllByText(en.TransactionLimitsScreen.editRequest())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
  })
})
