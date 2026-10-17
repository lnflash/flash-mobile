import * as React from "react"
import { StyleSheet, ViewStyle } from "react-native"
import type { ReactTestInstance } from "react-test-renderer"
import { fireEvent, render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

const mockNavigate = jest.fn()
let mockAuthed = true
let mockAssistantEnabled = false
let mockAdvanceMode = false
let mockTransferEnabled = false

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
  usePersistentStateContext: () => ({
    persistentState: { isAdvanceMode: mockAdvanceMode },
  }),
}))
jest.mock("@app/hooks", () => ({
  useTransferFlags: () => ({ transferEnabled: mockTransferEnabled }),
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
  mockAdvanceMode = false
  mockTransferEnabled = false
})

/**
 * A button's own box, around its circle and label: IconBtn's container,
 * the nearest view above the label that sets the button's side spacing.
 */
const buttonBox = (
  screen: ReturnType<typeof show>["screen"],
  label: string,
): ViewStyle => {
  let node: ReactTestInstance | null = screen.getByText(label)
  while (node) {
    const style: ViewStyle = StyleSheet.flatten(node.props.style) ?? {}
    if (typeof node.type === "string" && "marginHorizontal" in style) return style
    node = node.parent
  }
  throw new Error(`no button labelled ${label}`)
}

/** The narrowest a button can be, side to side: its fixed sizes, never its label. */
const minimumWidth = (style: ViewStyle) =>
  Math.max(64, Number(style.minWidth ?? 0)) +
  2 * (Number(style.paddingHorizontal ?? 0) + Number(style.marginHorizontal ?? 0))

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

  it("fit five buttons on a phone's row: past four, each takes an equal share, and the row wraps", () => {
    // Advanced mode and transfer make four; Ask Flash a fifth. At IconBtn's
    // own spacing that is at least 480pt, wider than any phone.
    mockAdvanceMode = true
    mockTransferEnabled = true
    mockAssistantEnabled = true
    const { screen } = show()
    const labels = [
      en.HomeScreen.send(),
      en.HomeScreen.receive(),
      en.ConversionDetailsScreen.title(),
      en.HomeScreen.transfer(),
      en.HomeScreen.askFlash(),
    ]

    labels.forEach((label) => expect(screen.getByText(label)).toBeTruthy())
    const row: ViewStyle = StyleSheet.flatten(
      screen.getByTestId("home-buttons").props.style,
    )
    expect(row.flexWrap).toBe("wrap")
    const boxes = labels.map((label) => buttonBox(screen, label))
    boxes.forEach((box) => expect(box).toEqual(expect.objectContaining({ flex: 1 })))
    // All five fit a 360pt phone's row, with the row's own padding.
    const fixed = boxes.reduce((sum, box) => sum + minimumWidth(box), 0)
    expect(fixed + 2 * Number(row.paddingHorizontal ?? 0)).toBeLessThanOrEqual(360)
  })

  it("keep IconBtn's own spacing for four buttons, in a row that does not wrap", () => {
    mockAdvanceMode = true
    mockTransferEnabled = true
    const { screen } = show()

    expect(screen.queryByText(en.HomeScreen.askFlash())).toBeNull()
    const row: ViewStyle = StyleSheet.flatten(
      screen.getByTestId("home-buttons").props.style,
    )
    expect(row.flexWrap).toBeUndefined()
    const box = buttonBox(screen, en.HomeScreen.send())
    expect(box.flex).toBeUndefined()
    expect(minimumWidth(box)).toBe(96)
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
