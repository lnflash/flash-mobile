// Android store-link coverage. `isIos` is captured at module load
// (app/utils/helper.ts), so the Android branch of the store link can only be
// exercised from a separate module registry — hence a sibling spec rather than
// another case in app-update-render.spec.tsx.
import * as React from "react"
import { Linking } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent } from "@testing-library/react-native"

import { PLAY_STORE_LINK } from "@app/config"
import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

jest.mock("@app/utils/helper", () => ({
  ...jest.requireActual("@app/utils/helper"),
  isIos: false,
}))

// Driven per-test: what the mobileVersions query returns.
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
  // The gate only governs this bundle — see GATED_BUNDLE_ID.
  getBundleId: () => "com.lnflash",
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/components/contact-modal", () => ({}))

jest.mock("@app/components/version", () => ({
  VersionComponent: () => null,
}))

jest.mock("../../app/utils/toast", () => ({
  toastShow: jest.fn(),
}))

jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    __esModule: true,
    default: ({
      isVisible,
      children,
    }: {
      isVisible: boolean
      children: React.ReactNode
    }) => (isVisible ? ReactActual.createElement(View, null, children) : null),
  }
})

import {
  AppUpdate,
  AppUpdateGate,
  AppUpdateProvider,
} from "../../app/components/app-update/app-update"

loadLocale("en")
const LL = i18nObject("en")

// Platform.OS stays "ios" under jest, so both entries carry the same numbers —
// what this spec pins is the store link chosen by `isIos`, not the lookup.
const versions = (minSupported: number, currentSupported: number) => [
  {
    __typename: "MobileVersions",
    platform: "android",
    currentSupported,
    minSupported,
  },
  {
    __typename: "MobileVersions",
    platform: "ios",
    currentSupported,
    minSupported,
  },
]

const renderWithTheme = (component: React.ReactElement) =>
  render(
    <ThemeProvider theme={createTheme({})}>
      <AppUpdateProvider>{component}</AppUpdateProvider>
    </ThemeProvider>,
  )

describe("app update on Android", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("sends the blocking modal's update button to the Play Store", () => {
    mockMobileVersions = versions(95, 96)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))

    // The modal cannot be dismissed: an Android user sent to the App Store has
    // no way out of the gate at all.
    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith(PLAY_STORE_LINK)
  })

  it("tells support the blocked device is on Android", () => {
    mockMobileVersions = versions(95, 96)

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    fireEvent.press(getByText(LL.AppUpdate.contactSupport()))

    // The Android branch is the one that can lose the store link entirely (no
    // Play Store on the device), so support has to be told which platform it is
    // dealing with.
    const mailto = (Linking.openURL as jest.Mock).mock.calls
      .map(String)
      .find((url) => url.startsWith("mailto:"))
    expect(mailto).toBeDefined()
    expect(decodeURIComponent(mailto as string)).toContain("Android")
  })

  it("sends the home banner to the Play Store", () => {
    mockMobileVersions = versions(1, 95)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderWithTheme(<AppUpdate />)

    fireEvent.press(getByText(LL.HomeScreen.updateAvailable()))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith(PLAY_STORE_LINK)
  })
})
