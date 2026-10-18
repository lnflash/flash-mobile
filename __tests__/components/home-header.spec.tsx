import * as React from "react"
import { StyleSheet, TouchableOpacity, ViewStyle } from "react-native"
import type { ReactTestRendererJSON } from "react-test-renderer"
import { fireEvent, render } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"

type HeaderOptions = {
  headerLeft: () => React.ReactElement
  headerRight: () => React.ReactElement
}

const mockNavigate = jest.fn()
const mockSetOptions = jest.fn<void, [HeaderOptions]>()
// One client, as the app holds one per sign-in: a new object on every render
// would rerun the header's effect by itself and hide a missing dependency.
const mockClient = {}
let mockAuthed = true
let mockAssistantEnabled = false

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
  // Unfocused, the header never starts its notification-permission timer.
  useIsFocused: () => false,
}))
jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => mockAuthed,
}))
jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useApolloClient: () => mockClient,
}))
jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useHideBalanceQuery: () => ({ data: { hideBalance: false } }),
}))
jest.mock("@app/graphql/client-only-query", () => ({
  saveHideBalance: jest.fn(),
}))
jest.mock("@app/utils/notifications", () => ({
  addDeviceToken: jest.fn(),
  requestNotificationPermission: jest.fn(),
}))
jest.mock("@app/config/feature-flags-context", () => ({
  useFeatureFlags: () => ({ assistantEnabled: mockAssistantEnabled }),
}))
jest.mock("@app/i18n/i18n-react", () => {
  // One LL, as the provider holds one per locale (see mockClient). Made on
  // first use: by then the spec has loaded the English strings.
  let LL: unknown
  return {
    useI18nContext: () => {
      LL = LL ?? jest.requireActual("@app/i18n/i18n-util").i18nObject("en")
      return { LL }
    },
  }
})
// Named, so the tree tells the price icon from Ask Flash's.
jest.mock("@app/assets/icons/chart.svg", () => "PriceIcon")
jest.mock("@app/assets/icons-redesign/ask-flash.svg", () => "AskFlashIcon")

import Header from "@app/components/home-screen/Header"
import { saveHideBalance } from "@app/graphql/client-only-query"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"

loadLocale("en")
const en = i18nObject("en")

// The home screen's header (ENG-733): the price icon at the top left, and
// right beside it Ask Flash while Remote Config's assistantEnabled is on.
// Ask Flash opens the thread, or asks a signed-out user to make an account
// first, as the home screen's buttons do.

const setModalVisible = jest.fn()

const header = () => (
  <ThemeProvider theme={theme}>
    <Header setModalVisible={setModalVisible} />
  </ThemeProvider>
)

/** One side of the header, as the navigator was last handed it. */
const headerSide = (which: keyof HeaderOptions) => {
  const options = mockSetOptions.mock.lastCall?.[0]
  if (!options) throw new Error("the header never handed the navigator its buttons")
  const side = render(options[which]())
  const row = side.toJSON() as ReactTestRendererJSON
  return {
    side,
    row,
    buttons: (row.children ?? []) as ReactTestRendererJSON[],
    touchables: side.UNSAFE_getAllByType(TouchableOpacity),
  }
}

/** The header's left side: the price icon, and Ask Flash while the flag is on. */
const leftSide = () => headerSide("headerLeft")

/** The header's right side: the eye, then the menu. */
const rightSide = () => headerSide("headerRight")

/** A button's icon: the one node inside it. */
const iconOf = (button: ReactTestRendererJSON) =>
  (button.children ?? [])[0] as ReactTestRendererJSON

/** The space a button keeps either side of its icon. */
const sides = (button: ReactTestRendererJSON) => {
  const style: ViewStyle = StyleSheet.flatten(button.props.style) ?? {}
  return {
    left: style.paddingLeft ?? style.paddingHorizontal,
    right: style.paddingRight ?? style.paddingHorizontal,
  }
}

afterEach(() => {
  jest.clearAllMocks()
  mockAuthed = true
  mockAssistantEnabled = false
})

describe("the home screen's header", () => {
  it("shows the price icon alone while the assistant flag is off, laid out as before", () => {
    render(header())
    const { side, buttons, touchables } = leftSide()

    expect(buttons).toHaveLength(1)
    expect(touchables).toHaveLength(1)
    expect(iconOf(buttons[0]).type).toBe("PriceIcon")
    expect(side.queryByTestId("home-ask-flash")).toBeNull()
    expect(sides(buttons[0])).toEqual({ left: 20, right: 20 })

    fireEvent.press(touchables[0])
    expect(mockNavigate).toHaveBeenCalledWith("priceHistory")
  })

  it("puts Ask Flash right beside the price icon once the flag is on, and opens the thread", () => {
    mockAssistantEnabled = true
    render(header())
    const { side, row, buttons, touchables } = leftSide()

    // One row, the price icon first and Ask Flash next to it, nothing between.
    expect(StyleSheet.flatten(row.props.style)).toEqual(
      expect.objectContaining({ flexDirection: "row" }),
    )
    expect(buttons).toHaveLength(2)
    expect(touchables).toHaveLength(2)
    const [price, askFlash] = buttons
    expect(iconOf(price).type).toBe("PriceIcon")
    expect(iconOf(askFlash).type).toBe("AskFlashIcon")
    expect(askFlash.props).toEqual(
      expect.objectContaining({
        testID: "home-ask-flash",
        accessibilityRole: "button",
        accessibilityLabel: en.HomeScreen.askFlash(),
      }),
    )
    // The same size and color as its neighbour.
    const icon = { width: 30, height: 30, color: theme.lightColors?.icon01 }
    expect(iconOf(price).props).toEqual(expect.objectContaining(icon))
    expect(iconOf(askFlash).props).toEqual(expect.objectContaining(icon))
    // 20pt at the screen's edge and 20pt between the icons, as the eye and
    // the menu keep on the right.
    expect(sides(price)).toEqual({ left: 20, right: 10 })
    expect(sides(askFlash)).toEqual({ left: 10, right: 20 })

    fireEvent.press(side.getByTestId("home-ask-flash"))
    expect(mockNavigate).toHaveBeenCalledWith("askFlash")
    expect(setModalVisible).not.toHaveBeenCalled()

    fireEvent.press(touchables[0])
    expect(mockNavigate).toHaveBeenLastCalledWith("priceHistory")
  })

  it("spaces the eye and the menu on the right as the pair on the left, so the sides mirror", () => {
    mockAssistantEnabled = true
    render(header())
    const left = leftSide().buttons
    const { buttons: right, touchables } = rightSide()

    // The eye, then the menu.
    expect(right).toHaveLength(2)
    expect(touchables).toHaveLength(2)
    fireEvent.press(touchables[0])
    expect(saveHideBalance).toHaveBeenCalledWith(mockClient, true)
    fireEvent.press(touchables[1])
    expect(mockNavigate).toHaveBeenCalledWith("settings")

    // 20pt at the screen's edge and 20pt between the icons, and the same
    // space either side of each icon as the price icon and Ask Flash keep.
    expect(sides(right[0])).toEqual({ left: 20, right: 10 })
    expect(sides(right[1])).toEqual({ left: 10, right: 20 })
    expect(right.map(sides)).toEqual(left.map(sides))
  })

  it("shows Ask Flash when the flag turns on after the header was set, and hides it when it turns off", () => {
    const screen = render(header())
    expect(leftSide().buttons).toHaveLength(1)

    mockAssistantEnabled = true
    screen.rerender(header())
    expect(leftSide().side.getByTestId("home-ask-flash")).toBeTruthy()

    mockAssistantEnabled = false
    screen.rerender(header())
    expect(leftSide().side.queryByTestId("home-ask-flash")).toBeNull()
  })

  it("asks a signed-out user to make an account first, as the home screen's buttons do", () => {
    mockAssistantEnabled = true
    mockAuthed = false
    render(header())

    fireEvent.press(leftSide().side.getByTestId("home-ask-flash"))

    expect(setModalVisible).toHaveBeenCalledWith(true)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("opens the thread once the user has signed in", () => {
    mockAssistantEnabled = true
    mockAuthed = false
    const screen = render(header())

    mockAuthed = true
    screen.rerender(header())
    fireEvent.press(leftSide().side.getByTestId("home-ask-flash"))

    expect(mockNavigate).toHaveBeenCalledWith("askFlash")
    expect(setModalVisible).not.toHaveBeenCalled()
  })
})
