import * as React from "react"
import { StyleSheet, TouchableOpacity, ViewStyle } from "react-native"
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
// The row reads no flag since ENG-733. The mock lets a case turn the assistant
// on and show that the row stays the same.
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ assistantEnabled: mockAssistantEnabled }),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en") }) }
})

import Buttons from "@app/components/home-screen/Buttons"
import IconBtn from "@app/components/buttons/IconBtn"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"

loadLocale("en")
const en = i18nObject("en")

// The home screen's row: Send and Receive, Convert in advanced mode, and
// Transfer where it is on. Ask Flash is not one of them: it sits in the
// header, right beside the price icon (ENG-733, home-header.spec.tsx).

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

/** Taps the circle of the button with this label (the label itself takes no tap). */
const tap = (screen: ReturnType<typeof show>["screen"], label: string) => {
  const button = screen
    .UNSAFE_getAllByType(IconBtn)
    .find((node) => node.props.label === label)
  if (!button) throw new Error(`no button labelled ${label}`)
  fireEvent.press(button.findByType(TouchableOpacity))
}

describe("the home screen's buttons", () => {
  // A plain loop rather than it.each, which the wdio/mocha globals in this
  // repo's tsconfig leave untyped.
  const flagStates = [false, true]
  flagStates.forEach((flag) => {
    const state = flag ? "on" : "off"
    it(`leave Ask Flash out with the assistant flag ${state}: four buttons at most`, () => {
      // Advanced mode and transfer make four. Before ENG-733 the flag made
      // Ask Flash a fifth here.
      mockAssistantEnabled = flag
      mockAdvanceMode = true
      mockTransferEnabled = true
      const { screen } = show()
      const labels = [
        en.HomeScreen.send(),
        en.HomeScreen.receive(),
        en.ConversionDetailsScreen.title(),
        en.HomeScreen.transfer(),
      ]

      labels.forEach((label) => expect(screen.getByText(label)).toBeTruthy())
      expect(screen.UNSAFE_getAllByType(IconBtn)).toHaveLength(labels.length)
      expect(screen.queryByText(en.HomeScreen.askFlash())).toBeNull()
      expect(screen.queryByTestId("home-ask-flash")).toBeNull()
    })
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

  it("ask a signed-out user to make an account first", () => {
    mockAuthed = false
    const { screen, setModalVisible } = show()

    tap(screen, en.HomeScreen.send())

    expect(setModalVisible).toHaveBeenCalledWith(true)
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
