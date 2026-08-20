// Android store-link coverage. `isIos` is captured at module load
// (app/utils/helper.ts), so the Android branch of the store link can only be
// exercised from a separate module registry — hence a sibling spec rather than
// another case in app-update-render.spec.tsx.
import * as React from "react"
import { Linking } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { render, fireEvent, act } from "@testing-library/react-native"

import { CONTACT_EMAIL_ADDRESS, PLAY_STORE_LINK } from "@app/config"
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

jest.mock("@app/components/version", () => ({
  VersionComponent: () => null,
}))

const mockToastShow = jest.fn()
jest.mock("../../app/utils/toast", () => ({
  toastShow: (...args: unknown[]) => mockToastShow(...args),
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
  GATED_BUNDLE_ID,
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

  it("sends the blocking modal's update button to the installed store app", async () => {
    mockMobileVersions = versions(95, 96)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText, queryByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })

    // market:// is claimed only by an installed store app, so it lands the user
    // where they can actually install the update. The modal cannot be
    // dismissed: an Android user sent anywhere else has no way out of the gate.
    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith(`market://details?id=${GATED_BUNDLE_ID}`)
    expect(queryByText(LL.AppUpdate.couldNotOpenStore())).toBeNull()
  })

  it("falls back to the web listing when no store app handles market://", async () => {
    mockMobileVersions = versions(95, 96)
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockImplementation(async (url: string) => {
        if (url.startsWith("market://")) {
          throw new Error("no activity found to handle intent")
        }
      })
    jest.spyOn(console, "warn").mockImplementation(() => {})

    const { getByText, queryByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })

    // A device with a browser but no store app still gets the listing — a web
    // page is a worse landing spot than the store app, but it is not a failure.
    expect(openURL.mock.calls.map(String)).toEqual([
      `market://details?id=${GATED_BUNDLE_ID}`,
      PLAY_STORE_LINK,
    ])
    expect(queryByText(LL.AppUpdate.couldNotOpenStore())).toBeNull()
  })

  it("surfaces the failure when nothing on the device will take the link", async () => {
    mockMobileVersions = versions(95, 96)
    // A de-Googled device with no store app and no browser that claims the
    // https listing. Going straight to PLAY_STORE_LINK made this path
    // unreachable — any browser resolves an https URL — so a hard-blocked user
    // got no hint at all that Contact Support was the way out.
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no activity found to handle intent"))
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.tapHereUpdate()))
    })

    expect(getByText(LL.AppUpdate.couldNotOpenStore())).toBeTruthy()
    // A toast would be swallowed behind the modal (FIXME in utils/toast).
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it("tells support the blocked device is on Android", async () => {
    mockMobileVersions = versions(95, 96)
    // Own spy, own act: reading the module-level mock instead would inherit
    // whatever the preceding test installed, so inserting a test above this one
    // could silently swap the composer's success path for its failure path.
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText, queryByText } = renderWithTheme(<AppUpdateGate />)

    await act(async () => {
      fireEvent.press(getByText(LL.AppUpdate.contactSupport()))
    })

    // The Android branch is the one that can lose the store link entirely (no
    // Play Store on the device), so support has to be told which platform it is
    // dealing with.
    const mailto = openURL.mock.calls.map(String).find((url) => url.startsWith("mailto:"))
    expect(mailto).toBeDefined()
    expect(decodeURIComponent(mailto as string)).toContain("Android")
    // The composer opened, so the last-resort address must stay hidden — this
    // is what pins the case to the success path.
    expect(
      queryByText(LL.AppUpdate.couldNotOpenSupport({ email: CONTACT_EMAIL_ADDRESS })),
    ).toBeNull()
  })

  it("sends the home banner to the installed store app", async () => {
    mockMobileVersions = versions(1, 95)
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)

    const { getByText } = renderWithTheme(<AppUpdate />)

    await act(async () => {
      fireEvent.press(getByText(LL.HomeScreen.updateAvailable()))
    })

    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith(`market://details?id=${GATED_BUNDLE_ID}`)
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it("toasts the banner's own wording, in the user's locale, when nothing opens", async () => {
    mockMobileVersions = versions(1, 95)
    jest
      .spyOn(Linking, "openURL")
      .mockRejectedValue(new Error("no activity found to handle intent"))
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})

    const { getByText } = renderWithTheme(<AppUpdate />)

    await act(async () => {
      fireEvent.press(getByText(LL.HomeScreen.updateAvailable()))
    })

    expect(mockToastShow).toHaveBeenCalledTimes(1)
    const [{ message, currentTranslation }] = mockToastShow.mock.calls[0]

    // Without currentTranslation, utils/toast falls back to i18nObject("en") —
    // a Spanish user gets an English toast and analytics records isTranslated
    // false for every one of them.
    expect(currentTranslation).toBeDefined()
    // The gate's couldNotOpenStore points at a Contact Support button that only
    // exists inside the blocking modal. On the home screen that button is not
    // there, so the banner needs its own line.
    expect(message(LL)).toBe(LL.AppUpdate.couldNotOpenStoreBanner())
    expect(message(LL)).not.toBe(LL.AppUpdate.couldNotOpenStore())
  })
})
