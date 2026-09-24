// Screen is the root of every screen in the app. ENG-605 swapped its wrapper
// from the core (iOS-only, deprecated) SafeAreaView to the one from
// react-native-safe-area-context so Android pads for the system bars under
// edge-to-edge. The context SafeAreaView is a native view: it resolves the
// inset overlap natively, so jest never sees a padding number. The mock below
// replaces it with a View that pads by the provider's `initialMetrics`, which
// pins the wiring: the wrapper IS the context component, it reads the provider
// insets, and the zero-inset case (a window that is not edge-to-edge) leaves
// the layout untouched.
import * as React from "react"
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native"
import { render } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { createTheme, ThemeProvider } from "@rneui/themed"

import { Screen } from "@app/components/screen"

const SAFE_AREA_VIEW_TEST_ID = "context-safe-area-view"

jest.mock("react-native-safe-area-context", () => {
  // Plain require: `jest.requireActual("react")` inside a factory hands the
  // mock a second React instance and every hook in the tree dies.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const ReactActual = require("react")
  const { View: RNView } = require("react-native")
  /* eslint-enable @typescript-eslint/no-var-requires */
  const actual = jest.requireActual("react-native-safe-area-context")
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 }

  const useSafeAreaInsets = () =>
    ReactActual.useContext(actual.SafeAreaInsetsContext) ?? ZERO

  const SafeAreaProviderMock = ({
    children,
    initialMetrics,
  }: {
    children: React.ReactNode
    initialMetrics?: { insets: typeof ZERO }
  }) =>
    ReactActual.createElement(
      actual.SafeAreaInsetsContext.Provider,
      { value: initialMetrics?.insets ?? ZERO },
      children,
    )

  // Stand-in for the native view: pads by the provider insets on all edges.
  const SafeAreaViewMock = ({
    children,
    style,
  }: {
    children: React.ReactNode
    style?: unknown
  }) => {
    const insets = useSafeAreaInsets()
    return ReactActual.createElement(
      RNView,
      {
        testID: "context-safe-area-view",
        style: [
          style,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ],
      },
      children,
    )
  }

  return {
    ...actual,
    useSafeAreaInsets,
    SafeAreaProvider: SafeAreaProviderMock,
    SafeAreaView: SafeAreaViewMock,
  }
})

const flat = (node: { props: { style?: unknown } }): ViewStyle =>
  StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {}

const EDGE_TO_EDGE = { top: 47, bottom: 34, left: 0, right: 0 }
const NOT_EDGE_TO_EDGE = { top: 0, bottom: 0, left: 0, right: 0 }

const renderScreen = (
  insets: typeof EDGE_TO_EDGE,
  props: React.ComponentProps<typeof Screen> = {},
) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <SafeAreaProvider
        initialMetrics={{ insets, frame: { x: 0, y: 0, width: 0, height: 0 } }}
      >
        <Screen {...props}>
          <Text>child</Text>
        </Screen>
      </SafeAreaProvider>
    </ThemeProvider>,
  )

describe("Screen safe-area wrapper (ENG-605)", () => {
  it("pads the fixed preset by the provider insets on every edge", () => {
    const { getByTestId, getByText } = renderScreen(EDGE_TO_EDGE)

    const wrapper = getByTestId(SAFE_AREA_VIEW_TEST_ID)
    expect(flat(wrapper)).toMatchObject({ paddingTop: 47, paddingBottom: 34 })
    expect(getByText("child")).toBeTruthy()
  })

  it("pads the scroll preset too, outside the ScrollView", () => {
    const screen = renderScreen(EDGE_TO_EDGE, { preset: "scroll" })

    const wrapper = screen.getByTestId(SAFE_AREA_VIEW_TEST_ID)
    expect(flat(wrapper)).toMatchObject({ paddingTop: 47, paddingBottom: 34 })
    // The inset is on the wrapper, not the scroll content, so the scrollable
    // area itself is not shortened by the inset.
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy()
  })

  it("is a no-op when the window is not edge-to-edge (all insets 0)", () => {
    const { getByTestId } = renderScreen(NOT_EDGE_TO_EDGE)

    expect(flat(getByTestId(SAFE_AREA_VIEW_TEST_ID))).toMatchObject({
      paddingTop: 0,
      paddingBottom: 0,
    })
  })

  it("keeps the caller's style on the wrapper alongside the insets", () => {
    const { getByTestId } = renderScreen(EDGE_TO_EDGE, {
      style: { alignItems: "center" },
    })

    expect(flat(getByTestId(SAFE_AREA_VIEW_TEST_ID))).toMatchObject({
      alignItems: "center",
      paddingTop: 47,
    })
  })

  it("renders a plain View with no inset padding when `unsafe`", () => {
    const { queryByTestId, getByText } = renderScreen(EDGE_TO_EDGE, { unsafe: true })

    expect(queryByTestId(SAFE_AREA_VIEW_TEST_ID)).toBeNull()
    expect(getByText("child")).toBeTruthy()
    // The nearest ancestor View of the child is the unsafe wrapper.
    const wrapper = getByText("child").parent?.parent
    expect(wrapper?.type).toBe(View)
    expect(flat(wrapper as { props: { style?: unknown } }).paddingTop).toBeUndefined()
  })

  it("uses the iOS keyboard behavior on iOS (jest default platform)", () => {
    const screen = renderScreen(EDGE_TO_EDGE)

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding")
  })
})
