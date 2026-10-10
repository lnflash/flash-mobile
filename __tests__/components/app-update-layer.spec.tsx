// The forced-update gate and the toast host are both inline, zIndex'd,
// full-screen siblings inside AppUpdateBoundary. GaloyToast's layer exists to
// clear stack headers on iOS; the gate's exists so that layer cannot in turn
// paint a toast over a hard block that has no dismiss (e.g. a 500 on the
// foreground mobileVersions refetch firing NetworkErrorComponent's toast). This
// pins the order between the two, through the shared constants, so neither
// side can bump its zIndex without the other noticing.
import * as React from "react"
import { StyleSheet, ViewStyle } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, act, within } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

let mockMobileVersions: unknown

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useMobileUpdateQuery: () => ({
    data: { mobileVersions: mockMobileVersions },
    refetch: jest.fn().mockResolvedValue({}),
  }),
}))

jest.mock("react-native-device-info", () => ({
  getBuildNumber: () => "89",
  getReadableVersion: () => "0.6.6.89",
  getBundleId: () => "com.lnflash",
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/components/version", () => ({
  VersionComponent: () => null,
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock("@app/utils/analytics", () => ({
  logToastShown: jest.fn(),
}))

// Flattened like the boundary spec: the real inline render path is pinned by
// app-update-inline-modal.spec; here only the gate's wrapper layer matters, and
// the real modal's entrance animation leaks timers past the test.
jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    __esModule: true,
    default: (props: { isVisible: boolean; children: React.ReactNode }) =>
      props.isVisible ? ReactActual.createElement(View, null, props.children) : null,
  }
})

import { AppUpdateBoundary } from "../../app/components/app-update/app-update-boundary"
import { GaloyToast } from "../../app/components/galoy-toast"
import { APP_UPDATE_GATE_LAYER_Z, TOAST_LAYER_Z } from "../../app/constants/layers"
import { toastShow } from "../../app/utils/toast"

loadLocale("en")
const LL = i18nObject("en")

const versions = (minSupported: number, currentSupported: number) => [
  { __typename: "MobileVersions", platform: "android", currentSupported, minSupported },
  { __typename: "MobileVersions", platform: "ios", currentSupported, minSupported },
]

// Same shape as app.tsx: the toast host is a child of the boundary, the gate
// is the boundary's own last sibling.
const renderTree = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AppUpdateBoundary>
        <GaloyToast />
      </AppUpdateBoundary>
    </ThemeProvider>,
  )

const flatten = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as ViewStyle) as ViewStyle & {
    elevation?: number
  }

describe("AppUpdateGate layer vs toast layer", () => {
  it("the constants put the gate strictly above the toast layer", () => {
    expect(APP_UPDATE_GATE_LAYER_Z).toBeGreaterThan(TOAST_LAYER_Z)
  })

  it("mounts the gate in a full-screen, non-blocking layer that outranks the toast layer", () => {
    mockMobileVersions = versions(95, 96)
    const screen = renderTree()

    const gateLayer = screen.getByTestId("app-update-gate-layer")
    const toastLayer = screen.getByTestId("toast-layer")

    expect(gateLayer.props.pointerEvents).toBe("box-none")
    const gate = flatten(gateLayer)
    const toast = flatten(toastLayer)
    expect(gate.position).toBe("absolute")
    expect(gate.top).toBe(0)
    expect(gate.bottom).toBe(0)
    expect(gate.left).toBe(0)
    expect(gate.right).toBe(0)
    expect(gate.zIndex).toBe(APP_UPDATE_GATE_LAYER_Z)
    expect(gate.elevation).toBe(APP_UPDATE_GATE_LAYER_Z)
    // The actual invariant: whatever the numbers are, the rendered gate wins.
    expect(gate.zIndex).toBeGreaterThan(toast.zIndex as number)
    expect(gate.elevation).toBeGreaterThan(toast.elevation as number)
  })

  it("keeps the hard block inside its layer while a toast fires over the gate", () => {
    mockMobileVersions = versions(95, 96)
    const screen = renderTree()

    act(() => {
      toastShow({ type: "error", position: "top", message: "Network error" })
    })

    const gateLayer = screen.getByTestId("app-update-gate-layer")
    const toastLayer = screen.getByTestId("toast-layer")
    // Both render, each in its own layer — nothing is swallowed, the gate's
    // zIndex is what decides who paints on top.
    expect(within(gateLayer).getByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
    expect(within(toastLayer).getByText("Network error")).toBeTruthy()
    expect(within(gateLayer).queryByText("Network error")).toBeNull()
  })

  it("is inert when no update is required: empty layer, still box-none", () => {
    mockMobileVersions = versions(1, 89)
    const screen = renderTree()

    const gateLayer = screen.getByTestId("app-update-gate-layer")
    expect(gateLayer.props.pointerEvents).toBe("box-none")
    expect(screen.queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })
})
