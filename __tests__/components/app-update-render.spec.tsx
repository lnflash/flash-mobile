import * as React from "react"
import { AppState, Linking } from "react-native"
import DeviceInfo from "react-native-device-info"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent, act } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

// Driven per-test: what the mobileVersions query returns.
let mockMobileVersions: unknown
const mockRefetch = jest.fn().mockResolvedValue({})

jest.mock("@app/graphql/generated", () => ({
  ...jest.requireActual("@app/graphql/generated"),
  useMobileUpdateQuery: () => ({
    data: { mobileVersions: mockMobileVersions },
    refetch: mockRefetch,
  }),
}))

// Driven per-test: which of the two iOS apps this binary is. The served
// mobileVersions payload has one "ios" entry but two App Store records back it
// (com.lnflash and com.flashapp.alt), so the gate is scoped to one bundle.
let mockBundleId = "com.lnflash"

// The device under test runs build 89 (jest defaults Platform.OS to ios).
jest.mock("react-native-device-info", () => ({
  getBuildNumber: () => "89",
  getReadableVersion: () => "0.6.6.89",
  getBundleId: () => mockBundleId,
}))

jest.mock("@app/i18n/i18n-react", () => ({
  useI18nContext: () => ({ LL: i18nObject("en") }),
}))

jest.mock("@app/components/version", () => ({
  VersionComponent: () => null,
}))

const mockToastShow = jest.fn()
jest.mock("../../app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToastShow(...args),
}))

// Props handed to react-native-modal, so the suite can pin the ones that are
// load-bearing on Android (coverScreen) rather than only what renders.
const mockModalProps: Record<string, unknown>[] = []

// react-native-modal drives visibility natively; flatten it so the modal's
// children render inline exactly when isVisible is true.
jest.mock("react-native-modal", () => {
  const ReactActual = jest.requireActual("react")
  const { View } = jest.requireActual("react-native")
  return {
    __esModule: true,
    default: (props: { isVisible: boolean; children: React.ReactNode }) => {
      mockModalProps.push(props)
      return props.isVisible
        ? ReactActual.createElement(View, null, props.children)
        : null
    },
  }
})

import {
  AppUpdate,
  AppUpdateGate,
  AppUpdateProvider,
} from "../../app/components/app-update/app-update"

loadLocale("en")
const LL = i18nObject("en")

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

const wrap = (component: React.ReactElement) => (
  <ThemeProvider theme={createTheme({})}>
    <AppUpdateProvider>{component}</AppUpdateProvider>
  </ThemeProvider>
)

const renderWithTheme = (component: React.ReactElement) => {
  const result = render(wrap(component))

  return {
    ...result,
    // Re-runs the (mocked) version query, so a test can change what the server
    // returns mid-flight and assert the UI follows.
    rerender: (next: React.ReactElement) => result.rerender(wrap(next)),
  }
}

const foregroundHandler = (spy: jest.SpyInstance) => {
  const changeCalls = spy.mock.calls.filter(([event]) => event === "change")
  // One listener for the whole tree — the gate and the banner share a single
  // AppUpdateProvider rather than each subscribing to their own copy.
  expect(changeCalls).toHaveLength(1)
  return changeCalls[0][1] as (state: string) => void
}

describe("AppUpdate (home banner)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModalProps.length = 0
    mockBundleId = "com.lnflash"
  })

  it("renders nothing when the build is current", () => {
    mockMobileVersions = versions(1, 89)
    const { queryByText } = renderWithTheme(<AppUpdate />)

    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()
  })

  it("renders nothing while versions have not loaded", () => {
    mockMobileVersions = undefined
    const { queryByText } = renderWithTheme(<AppUpdate />)

    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()
  })

  it("shows the update-available banner and opens the store on tap", () => {
    mockMobileVersions = versions(1, 95)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderWithTheme(<AppUpdate />)

    fireEvent.press(getByText(LL.HomeScreen.updateAvailable()))
    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL.mock.calls[0][0]).toContain("apple")
  })

  it("toasts when the store link cannot be opened from the banner", async () => {
    mockMobileVersions = versions(1, 95)
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no activity found to handle intent"))
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText } = renderWithTheme(<AppUpdate />)

    await act(async () => {
      fireEvent.press(getByText(LL.HomeScreen.updateAvailable()))
    })

    // Nothing is covering the screen on this path, so a toast is reachable.
    expect(mockToastShow).toHaveBeenCalledTimes(1)

    const [{ message, currentTranslation }] = mockToastShow.mock.calls[0]
    // utils/toast falls back to i18nObject("en") when currentTranslation is
    // absent, so leaving it off ships an English toast to every locale.
    expect(currentTranslation).toBeDefined()
    // The banner has no Contact Support button, so it must not borrow the
    // gate's copy, which tells the user to tap one.
    expect(message(LL)).toBe(LL.AppUpdate.couldNotOpenStoreBanner())
  })

  it("hides the banner when the update is required — the gate's modal owns it", () => {
    mockMobileVersions = versions(95, 96)
    const { queryByText } = renderWithTheme(<AppUpdate />)

    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()
  })

  it("shows the banner once the foreground re-check raises currentSupported", () => {
    mockMobileVersions = versions(1, 89)
    const addEventListener = jest.spyOn(AppState, "addEventListener")

    const { queryByText, rerender } = renderWithTheme(<AppUpdate />)
    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()

    const handler = foregroundHandler(addEventListener)

    // A release lands while the app sits in the background.
    mockMobileVersions = versions(1, 95)
    act(() => handler("active"))
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    rerender(<AppUpdate />)
    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeTruthy()
  })
})

describe("AppUpdateGate (blocking modal)", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModalProps.length = 0
    mockBundleId = "com.lnflash"
  })

  it("renders nothing when the build is supported", () => {
    mockMobileVersions = versions(1, 95)
    const { queryByText } = renderWithTheme(<AppUpdateGate />)

    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })

  it("shows the mandatory-update modal when the build is below minSupported", () => {
    mockMobileVersions = versions(95, 96)
    const { getByText } = renderWithTheme(<AppUpdateGate />)

    expect(getByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
    expect(getByText(LL.AppUpdate.updateMandatory())).toBeTruthy()
  })

  it("renders inline (coverScreen={false}) so Fabric on Android cannot strand the user", () => {
    mockMobileVersions = versions(95, 96)
    renderWithTheme(<AppUpdateGate />)

    // RCTModalHostView wrongly measures the flex:1 content host under the New
    // Architecture (#545). This modal has no dismiss and swallows the hardware
    // back button, so the native host path would leave a blank, frozen screen.
    expect(mockModalProps).not.toHaveLength(0)
    mockModalProps.forEach((props) => expect(props.coverScreen).toBe(false))
  })

  it("opens the store from the modal's update button", () => {
    mockMobileVersions = versions(95, 96)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText, queryByText } = renderWithTheme(<AppUpdateGate />)

    // The only escape from the blocking gate — a regression here strands
    // every hard-blocked user.
    fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL.mock.calls[0][0]).toContain("apple")
    expect(queryByText(LL.AppUpdate.couldNotOpenStore())).toBeNull()
  })

  it("surfaces the failure inside the modal when the store link cannot be opened", async () => {
    mockMobileVersions = versions(95, 96)
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no activity found to handle intent"))
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText, queryByText } = renderWithTheme(<AppUpdateGate />)

    expect(queryByText(LL.AppUpdate.couldNotOpenStore())).toBeNull()

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })

    // A toast is dropped while a modal is up (FIXME in utils/toast), which on
    // this path would leave the tap a silent no-op with no way out.
    expect(getByText(LL.AppUpdate.couldNotOpenStore())).toBeTruthy()
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it("opens support from the modal, carrying the blocked build's version", async () => {
    mockMobileVersions = versions(95, 96)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    // Way out #2 of a modal with no dismiss, and the one couldNotOpenStore
    // points users at when the store link fails. Support needs the OS and build
    // number from a user whose app is the thing refusing to show them anything.
    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.contactSupport()))
    })

    const mailto = openURL.mock.calls.map(String).find((url) => url.startsWith("mailto:"))
    expect(mailto).toBeDefined()
    expect(mailto).toContain("support@getflash.io")
    // The body carries what a hard-blocked user cannot look up themselves.
    expect(decodeURIComponent(mailto as string)).toContain(
      DeviceInfo.getReadableVersion(),
    )
    expect(decodeURIComponent(mailto as string)).toContain("iOS")
  })

  it("still reaches support after the store link fails", async () => {
    mockMobileVersions = versions(95, 96)
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no activity found to handle intent"))
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })

    // couldNotOpenStore tells the user to tap Contact Support; the button it
    // names has to still work once the inline error has rendered.
    expect(getByText(LL.AppUpdate.couldNotOpenStore())).toBeTruthy()
    fireEvent.press(getByText(LL.AppUpdate.contactSupport()))

    const mailto = (Linking.openURL as jest.Mock).mock.calls
      .map(String)
      .find((url) => url.startsWith("mailto:"))
    expect(mailto).toBeDefined()
    expect(decodeURIComponent(mailto as string)).toContain(
      DeviceInfo.getReadableVersion(),
    )
  })

  it("renders the support address when the mail composer will not open", async () => {
    mockMobileVersions = versions(95, 96)
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no mail client"))
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.contactSupport()))
    })

    // Both escapes are gone at this point, so the address has to be readable
    // straight off a modal that cannot be dismissed.
    expect(
      getByText(LL.AppUpdate.couldNotOpenSupport({ email: "support@getflash.io" })),
    ).toBeTruthy()
  })

  it("re-checks versions when the app returns to the foreground", () => {
    mockMobileVersions = versions(1, 89)
    const addEventListener = jest.spyOn(AppState, "addEventListener")

    const { unmount } = renderWithTheme(<AppUpdateGate />)

    const handler = foregroundHandler(addEventListener)

    act(() => handler("active"))
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    // background transitions must not trigger a refetch
    act(() => handler("background"))
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    unmount()
  })

  it("blocks once the foreground re-check returns a raised minSupported", () => {
    mockMobileVersions = versions(1, 89)
    const addEventListener = jest.spyOn(AppState, "addEventListener")

    const { queryByText, rerender } = renderWithTheme(<AppUpdateGate />)
    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()

    const handler = foregroundHandler(addEventListener)

    // The incident lever: the floor is raised above this build while the app
    // sits in the background. Refetching is only useful if the new numbers
    // actually reach `required`.
    mockMobileVersions = versions(95, 96)
    act(() => handler("active"))
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    rerender(<AppUpdateGate />)
    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
    expect(queryByText(LL.AppUpdate.updateMandatory())).toBeTruthy()
  })
})

describe("bundle scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModalProps.length = 0
    mockBundleId = "com.lnflash"
  })

  // The served payload has ONE "ios" entry, but two App Store Connect records
  // ship from this JS — com.lnflash and com.flashapp.alt — and their build
  // numbers are independent counters (fastlane/Fastfile resolves alt's from
  // latest_testflight_build_number(app_identifier: "com.flashapp.alt")). Using
  // the documented incident lever on the main app would otherwise hard-block
  // alt users whose unrelated counter happens to sit under the same floor.
  it("does not block the alt bundle on the main app's floor", () => {
    mockMobileVersions = versions(95, 96)
    mockBundleId = "com.flashapp.alt"

    const { queryByText } = renderWithTheme(<AppUpdateGate />)

    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })

  it("does not nudge the alt bundle on the main app's currentSupported", () => {
    mockMobileVersions = versions(1, 95)
    mockBundleId = "com.flashapp.alt"

    const { queryByText } = renderWithTheme(<AppUpdate />)

    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()
  })

  it("still blocks the bundle the served number is sized for", () => {
    mockMobileVersions = versions(95, 96)
    mockBundleId = "com.lnflash"

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    expect(getByText(LL.AppUpdate.versionNotSupported())).toBeTruthy()
  })
})

describe("AppUpdateProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockModalProps.length = 0
    mockBundleId = "com.lnflash"
  })

  it("serves the gate and the banner from a single version check", () => {
    mockMobileVersions = versions(1, 95)
    const addEventListener = jest.spyOn(AppState, "addEventListener")

    const { getByText, queryByText } = renderWithTheme(
      <>
        <AppUpdateGate />
        <AppUpdate />
      </>,
    )

    // One subscription, one listener — two views of the same fact.
    foregroundHandler(addEventListener)
    expect(getByText(LL.HomeScreen.updateAvailable())).toBeTruthy()
    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()
  })

  it("throws when a consumer is mounted without the provider", () => {
    mockMobileVersions = versions(95, 96)
    jest.spyOn(console, "error").mockImplementation(() => {})

    expect(() =>
      render(
        <ThemeProvider theme={createTheme({})}>
          <AppUpdateGate />
        </ThemeProvider>,
      ),
    ).toThrow(/AppUpdateProvider/)
  })
})
