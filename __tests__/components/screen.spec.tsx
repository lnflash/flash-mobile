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
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native"
import { render } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { HeaderShownContext } from "@react-navigation/elements"

import { Screen } from "@app/components/screen"

const SAFE_AREA_VIEW_TEST_ID = "context-safe-area-view"

jest.mock("react-native-safe-area-context", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactActual = require("react")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { View: RNView } = require("react-native")
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const shared = require("../helpers/safe-area-context-mock").build()

  // Stand-in for the native view: pads by the provider insets, on the edges
  // named by `edges` (the library's own default, `undefined`, means all four).
  // Honouring the prop matters since ENG-611 — Screen drops `top` under a
  // navigation header, and a mock that always padded top would keep asserting
  // a status-bar pad the component no longer applies.
  const SafeAreaViewMock = ({
    children,
    edges,
    style,
  }: {
    children: React.ReactNode
    edges?: string[]
    style?: unknown
  }) => {
    const insets = shared.useSafeAreaInsets()
    const on = (edge: string) => !edges || edges.includes(edge)
    return ReactActual.createElement(
      RNView,
      {
        testID: "context-safe-area-view",
        style: [
          style,
          {
            paddingTop: on("top") ? insets.top : 0,
            paddingBottom: on("bottom") ? insets.bottom : 0,
            paddingLeft: on("left") ? insets.left : 0,
            paddingRight: on("right") ? insets.right : 0,
          },
        ],
      },
      children,
    )
  }

  return { ...shared, SafeAreaView: SafeAreaViewMock }
})

const flat = (node: { props: { style?: unknown } }): ViewStyle =>
  StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>) ?? {}

const EDGE_TO_EDGE = { top: 47, bottom: 34, left: 0, right: 0 }
const NOT_EDGE_TO_EDGE = { top: 0, bottom: 0, left: 0, right: 0 }

const renderScreen = (
  insets: typeof EDGE_TO_EDGE,
  props: React.ComponentProps<typeof Screen> = {},
  headerShown = false,
) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <SafeAreaProvider
        initialMetrics={{ insets, frame: { x: 0, y: 0, width: 0, height: 0 } }}
      >
        <HeaderShownContext.Provider value={headerShown}>
          <Screen {...props}>
            <Text>child</Text>
          </Screen>
        </HeaderShownContext.Provider>
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

  // The companion spec (screen-header-inset.spec.tsx) pins the `edges` prop
  // Screen passes. This one pins what that prop costs in real padding, so the
  // mock above cannot drift back into padding top unconditionally.
  it("drops the top pad under a navigation header, keeping the bottom one", () => {
    const { getByTestId } = renderScreen(EDGE_TO_EDGE, {}, true)

    expect(flat(getByTestId(SAFE_AREA_VIEW_TEST_ID))).toMatchObject({
      paddingTop: 0,
      paddingBottom: 34,
    })
  })

  it("uses the iOS keyboard behavior on iOS (jest default platform)", () => {
    const screen = renderScreen(EDGE_TO_EDGE)

    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe("padding")
  })
})

// ENG-609. `statusBar` was declared and documented on ScreenProps since the
// Ignite template and read by nothing, which was harmless only while the global
// tint happened to be "light-content" — the two screens that passed it got what
// they asked for by accident. ThemedStatusBar removed that accident, so the
// prop had to become real: a screen painting its own full-bleed field under the
// status bar (a camera view, a coloured success screen) needs to state its tint
// and get it.
describe("Screen status-bar override (ENG-609)", () => {
  const statusBarsIn = (screen: ReturnType<typeof renderScreen>) =>
    screen.UNSAFE_queryAllByType(StatusBar)

  it("renders no entry of its own when the screen states no tint", () => {
    // Silence here is the feature: with nothing in the stack from Screen, the
    // themed entry at the app root decides, which is what every ordinary screen
    // wants.
    expect(statusBarsIn(renderScreen(EDGE_TO_EDGE))).toHaveLength(0)
    expect(statusBarsIn(renderScreen(EDGE_TO_EDGE, { preset: "scroll" }))).toHaveLength(0)
  })

  const tints = ["light-content", "dark-content"] as const

  tints.forEach((statusBar) => {
    it(`renders the declared ${statusBar} tint on the fixed preset`, () => {
      const screen = renderScreen(EDGE_TO_EDGE, { statusBar, backgroundColor: "#000" })

      const bar = screen.UNSAFE_getByType(StatusBar)
      expect(bar.props.barStyle).toBe(statusBar)
      // Android <= 14 still paints a real band; it should be the screen's own
      // field, not the themed white one inherited from the app root.
      expect(bar.props.backgroundColor).toBe("#000")
    })
  })

  it("renders the declared tint on the scroll preset too", () => {
    const screen = renderScreen(EDGE_TO_EDGE, {
      preset: "scroll",
      statusBar: "light-content",
      backgroundColor: "#007856",
    })

    const bar = screen.UNSAFE_getByType(StatusBar)
    expect(bar.props.barStyle).toBe("light-content")
    expect(bar.props.backgroundColor).toBe("#007856")
  })

  it("leaves the band colour undefined when the screen names no background", () => {
    // React Native merges the StatusBar stack per prop and skips undefined, so
    // an override that only names a tint still inherits the themed band rather
    // than resetting it to the platform default grey.
    const screen = renderScreen(EDGE_TO_EDGE, { statusBar: "light-content" })

    expect(screen.UNSAFE_getByType(StatusBar).props.backgroundColor).toBeUndefined()
  })
})
