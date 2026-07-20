import * as React from "react"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import QuickStart from "../../app/components/home-screen/QuickStart"

const mockNavigate = jest.fn()

// Driven per-test: the latestAccountUpgradeRequest status synced into redux.
let mockUpgradeStatus: string | undefined

jest.mock("@app/store/redux", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ accountUpgrade: { status: mockUpgradeStatus } }),
}))
jest.mock("@app/hooks", () => ({
  useAccountUpgrade: jest.fn(),
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
jest.mock("@react-navigation/native", () => ({
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
    mockUpgradeStatus = "Pending"
    const { getAllByText } = renderQuickStart()

    fireEvent.press(getAllByText(en.HomeScreen.upgradeTitlePending())[0])

    expect(mockNavigate).toHaveBeenCalledWith("AccountType")
  })
})
