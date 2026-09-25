import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import QuickStart from "../../app/components/home-screen/QuickStart"

const mockNavigate = jest.fn()

// Driven per-test: the latestAccountUpgradeRequest status synced into redux.
let mockUpgradeStatus: string | undefined
let mockReasonMessage: string | undefined

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      accountUpgrade: { status: mockUpgradeStatus, reasonMessage: mockReasonMessage },
    }),
}))
jest.mock("@app/hooks", () => ({
  useAccountUpgrade: jest.fn(),
  // Rewards enabled -> the invite card renders (matches default behavior).
  useReferralRewardFlag: jest.fn(() => ({ referralRewardEnabled: true, loading: false })),
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({
    persistentState: {},
    updateState: jest.fn(),
  }),
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHomeAuthedQuery: () => ({
    data: { me: { defaultAccount: { level: "ONE" } } },
    loading: false,
  }),
}))
jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))
// Spread the real module so `Screen` reads the real NavigationContext and
// therefore takes the same focus-scoped status-bar path it takes in the app
// (ENG-609). A partial mock made these specs exercise the unscoped fallback.
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("react-native-keychain", () => ({
  getInternetCredentials: jest.fn(() => Promise.resolve(false)),
}))
jest.mock("../../app/components/advanced-mode-modal", () => ({
  AdvancedModeModal: () => null,
}))
// Flatten the carousel so every card renders synchronously without reanimated.
jest.mock("react-native-reanimated-carousel", () => {
  const ReactLib = jest.requireActual("react")
  return {
    __esModule: true,
    default: ({
      data,
      renderItem,
    }: {
      data: unknown[]
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement
    }) =>
      ReactLib.createElement(
        ReactLib.Fragment,
        null,
        data.map((item, index) => renderItem({ item, index })),
      ),
  }
})

loadLocale("en")
const en = i18nObject("en")

const renderQuickStart = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <QuickStart />
    </ThemeProvider>,
  )

beforeEach(() => {
  mockNavigate.mockClear()
})

describe("QuickStart upgrade card", () => {
  it("navigates to the capability hub when no upgrade request is pending", () => {
    mockUpgradeStatus = undefined
    const { getAllByText } = renderQuickStart()

    fireEvent.press(getAllByText(en.HomeScreen.upgradeTitle())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
  })

  it("still navigates to the capability hub while an upgrade request is pending", () => {
    // Regression: the pending card used to set disabled, stranding the user
    // outside the hub where other capabilities (e.g. US virtual account)
    // remain available.
    mockUpgradeStatus = "UNDER_REVIEW"
    const { getAllByText } = renderQuickStart()

    fireEvent.press(getAllByText(en.HomeScreen.upgradeTitlePending())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
  })

  it("treats SUBMITTED as pending too", () => {
    mockUpgradeStatus = "SUBMITTED"
    const { getAllByText, queryByText } = renderQuickStart()

    expect(getAllByText(en.HomeScreen.upgradeTitlePending()).length).toBeGreaterThan(0)
    expect(queryByText(en.HomeScreen.upgradeTitle())).toBeNull()
  })

  it("shows the reviewer's message and routes to the hub when more info is needed", () => {
    mockUpgradeStatus = "MORE_INFO_NEEDED"
    mockReasonMessage = "The photo of your ID was blurry."
    const { getAllByText } = renderQuickStart()

    expect(getAllByText("The photo of your ID was blurry.").length).toBeGreaterThan(0)
    fireEvent.press(getAllByText(en.AccountUpgrade.statusMoreInfoNeeded())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
    mockReasonMessage = undefined
  })
})
