import * as React from "react"
import { fireEvent, render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

const mockNavigate = jest.fn()
let mockAuthed = true
let mockAssistantEnabled = false

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate }),
}))
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockAuthed,
}))
jest.mock("@app/graphql/level-context", () => ({
  useLevel: () => ({ currentLevel: "ONE" }),
}))
jest.mock("@app/store/persistent-state", () => ({
  usePersistentStateContext: () => ({ persistentState: { isAdvanceMode: false } }),
}))
jest.mock("@app/hooks", () => ({
  useTransferFlags: () => ({ transferEnabled: false }),
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHasPromptedSetDefaultAccountQuery: () => ({ data: undefined }),
}))
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ assistantEnabled: mockAssistantEnabled }),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import Buttons from "@app/components/home-screen/Buttons"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"

loadLocale("en")
const en = i18nObject("en")

// The home screen's entry to Ask Flash (ENG-689): one more button in the
// row, only while Remote Config's assistantEnabled is on, opening the
// thread the way the other buttons open their screens.

const show = () => {
  const setModalVisible = jest.fn()
  const screen = render(
    <ThemeProvider theme={theme}>
      <Buttons
        setModalVisible={setModalVisible}
        setDefaultAccountModalVisible={jest.fn()}
      />
    </ThemeProvider>,
  )
  return { screen, setModalVisible }
}

afterEach(() => {
  jest.clearAllMocks()
  mockAuthed = true
  mockAssistantEnabled = false
})

describe("the home screen's buttons", () => {
  it("leave Ask Flash out while the assistant flag is off", () => {
    const { screen } = show()

    expect(screen.getByText(en.HomeScreen.send())).toBeTruthy()
    expect(screen.queryByText(en.HomeScreen.askFlash())).toBeNull()
    expect(screen.queryByTestId("home-ask-flash")).toBeNull()
  })

  it("show Ask Flash once the flag is on, and open the thread", () => {
    mockAssistantEnabled = true
    const { screen } = show()

    expect(screen.getByText(en.HomeScreen.askFlash())).toBeTruthy()
    fireEvent.press(screen.getByTestId("home-ask-flash"))

    expect(mockNavigate).toHaveBeenCalledWith("askFlash")
  })

  it("ask a signed-out user to make an account first, as the other buttons do", () => {
    mockAssistantEnabled = true
    mockAuthed = false
    const { screen, setModalVisible } = show()

    fireEvent.press(screen.getByTestId("home-ask-flash"))

    expect(setModalVisible).toHaveBeenCalledWith(true)
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
