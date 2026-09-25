/**
 * ENG-609, the Bridge WebView screens in the cashout flow.
 *
 * Both routes are `headerShown: false` (root-navigator.tsx) over an `unsafe`
 * `Screen`, so they are fully edge-to-edge: under Android 15+ there is no
 * opaque band left and the clock and signal icons land straight on the page.
 * That page is white in both palettes — Bridge's own hosted page is, and the
 * loading scrim that covers the whole screen until it loads is
 * `rgba(255, 255, 255, 0.9)`, which is what the user actually sees first.
 * With no `statusBar` the themed default applies, which hands a dark-mode user
 * `light-content`: white icons on white.
 *
 * These are the same shape as `section-completed` and `earns-quiz`, which the
 * first ENG-609 sweep missed for want of a spec that asserted the flow rather
 * than individual screens. This one asserts the pair, in both modes, and pins
 * that the error branch stays on the themed default so its `colors.error` text
 * still reads.
 */
import * as React from "react"
import { StatusBar, View } from "react-native"
import { createTheme, ThemeMode, ThemeProvider } from "@rneui/themed"
import { act, render, RenderAPI } from "@testing-library/react-native"

import appTheme from "../../app/rne-theme/theme"

import BridgeKycWebView from "../../app/screens/topup-cashout-flow/BridgeKycWebView"
import BridgeExternalAccountWebView from "../../app/screens/topup-cashout-flow/BridgeExternalAccountWebView"

/** The scrim the screens paint over the whole page while the WebView loads. */
const LOADING_SCRIM = "rgba(255, 255, 255, 0.9)"

// No real WebView native module here; capture the props so the error branch can
// be driven through `onError` the way a failed page load drives it in the app.
// `forwardRef` because both screens hold a `webViewRef` for their retry path.
const mockWebViewProps: Record<string, unknown>[] = []
jest.mock("react-native-webview", () => {
  const react = jest.requireActual("react")
  const { View: RNView } = jest.requireActual("react-native")
  return {
    WebView: react.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      mockWebViewProps.push(props)
      return react.createElement(RNView, { testID: "webview", ref })
    }),
  }
})
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  }
})

const inMode = (mode: ThemeMode, node: React.ReactElement) =>
  render(
    <ThemeProvider
      theme={createTheme({
        mode,
        lightColors: appTheme.lightColors,
        darkColors: appTheme.darkColors,
      })}
    >
      {node}
    </ThemeProvider>,
  )

// `queryAll`, not `getAll`: the error branch declares no entry at all, and an
// empty result is the assertion there rather than a failure to find one.
const tintsDeclaredBy = (tree: RenderAPI) =>
  tree
    .UNSAFE_queryAllByType(StatusBar)
    .map((node) => node.props.barStyle)
    .filter(Boolean)

/** Every `backgroundColor` the rendered tree paints, however the style is nested. */
const backgroundsIn = (tree: RenderAPI) =>
  tree
    .UNSAFE_getAllByType(View)
    .flatMap((node) => [node.props.style].flat(Infinity))
    .map((style) => (style as { backgroundColor?: string } | undefined)?.backgroundColor)
    .filter(Boolean)

const navigation = () => ({ goBack: jest.fn(), navigate: jest.fn() } as never)

const screens: [string, () => React.ReactElement][] = [
  [
    "BridgeKycWebView",
    () => (
      <BridgeKycWebView
        navigation={navigation()}
        route={
          {
            key: "r",
            name: "BridgeKycWebView",
            params: {
              tosLink: "https://dashboard.bridge.xyz/tos",
              kycLink: "https://dashboard.bridge.xyz/kyc",
            },
          } as never
        }
      />
    ),
  ],
  [
    "BridgeExternalAccountWebView",
    () => (
      <BridgeExternalAccountWebView
        navigation={navigation()}
        route={
          {
            key: "r",
            name: "BridgeExternalAccountWebView",
            params: { linkUrl: "https://dashboard.bridge.xyz/link" },
          } as never
        }
      />
    ),
  ],
]

/** Every screen in both palettes, flattened so the cases nest only one deep. */
const cases = screens.flatMap(([name, element]) =>
  (["light", "dark"] as ThemeMode[]).map((mode) => ({ name, mode, element })),
)

beforeEach(() => {
  mockWebViewProps.length = 0
})

describe("the Bridge WebView screens tint the status bar for their field", () => {
  cases.forEach(({ name, mode, element }) => {
    it(`${name}: dark icons in ${mode} mode`, () => {
      const tints = tintsDeclaredBy(inMode(mode, element()))

      expect(tints).toContain("dark-content")
      expect(tints).not.toContain("light-content")
    })

    // If the scrim is ever repainted dark, the tint above stops being right and
    // this is the line that says so.
    it(`${name}: the field really is white in ${mode} mode`, () => {
      expect(backgroundsIn(inMode(mode, element()))).toContain(LOADING_SCRIM)
    })

    // The error branch paints the theme background, not the hosted page, and its
    // "Failed to load" text is `colors.error`. It must stay on the themed default
    // rather than inherit the white field's dark icons.
    it(`${name}: the error branch keeps the themed default in ${mode} mode`, async () => {
      const tree = inMode(mode, element())
      const onError = mockWebViewProps[0].onError as () => void

      await act(async () => onError())

      expect(tree.getByText("Failed to load")).toBeTruthy()
      expect(tintsDeclaredBy(tree)).toHaveLength(0)
    })
  })
})
