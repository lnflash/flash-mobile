// Every other app-update spec replaces react-native-modal with a stub, so
// `coverScreen={false}` is only ever asserted as a prop value — nothing checks
// that the library actually takes its inline render path, or that the gate's
// content and both escape buttons survive it. That gap matters: the workaround
// exists because RCTModalHostView mismeasures the flex:1 content host under
// Fabric on Android (#545), and this modal has no dismiss, no backdrop press and
// swallows the hardware back button. If the inline path ever stopped rendering
// the content, every hard-blocked user would get a frozen screen.
//
// This runs the real library. It cannot prove Fabric layout — jest has no
// layout engine — so the device check stays a release gate (see the PR note),
// but it does pin: no native modal host in the tree, content rendered, both
// buttons wired.
import * as React from "react"
import { Linking, Modal } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent, act } from "@testing-library/react-native"

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

// NOTE: react-native-modal is deliberately NOT mocked here. That is the point.

import {
  AppUpdateGate,
  AppUpdateProvider,
} from "../../app/components/app-update/app-update"

loadLocale("en")
const LL = i18nObject("en")

const versions = (minSupported: number, currentSupported: number) => [
  { __typename: "MobileVersions", platform: "android", currentSupported, minSupported },
  { __typename: "MobileVersions", platform: "ios", currentSupported, minSupported },
]

const renderGate = () =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AppUpdateProvider>
        <AppUpdateGate />
      </AppUpdateProvider>
    </ThemeProvider>,
  )

describe("AppUpdateGate through the real react-native-modal", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockMobileVersions = versions(95, 96)
  })

  it("renders the block inline, not through the native modal host", () => {
    const view = renderGate()
    const { getByText } = view

    // RCTModalHostView is what #545 breaks. coverScreen={false} has to keep the
    // library off it — a regression that dropped the prop would put a native
    // host back in the tree here. Querying by component type is the only way to
    // see the host at all; the testing library prefixes that API as UNSAFE_.
    // eslint-disable-next-line camelcase
    expect(view.UNSAFE_queryAllByType(Modal)).toHaveLength(0)
    expect(getByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
    expect(getByText(LL.AppUpdate.updateMandatory())).toBeTruthy()
  })

  it("keeps both escapes tappable on the inline path", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderGate()

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })
    expect(openURL).toHaveBeenCalled()

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.contactSupport()))
    })
    const mailto = openURL.mock.calls.map(String).find((url) => url.startsWith("mailto:"))
    expect(mailto).toBeDefined()
  })

  it("renders nothing at all when the build is supported", () => {
    mockMobileVersions = versions(1, 95)

    const { queryByText } = renderGate()

    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })
})
