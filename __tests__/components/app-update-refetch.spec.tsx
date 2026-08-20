// End-to-end version of the foreground re-check: a real Apollo link with two
// sequential responses, so what is asserted is that a changed server payload
// actually reaches the gate — not merely that refetch() was called on a
// hand-mocked hook.
import * as React from "react"
import { AppState } from "react-native"
import { createTheme, ThemeProvider } from "@rneui/themed"
import { MockedProvider } from "@apollo/client/testing"
import { render, act, waitFor } from "@testing-library/react-native"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"

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

import { MobileUpdateDocument } from "../../app/graphql/generated"
import {
  AppUpdate,
  AppUpdateGate,
  AppUpdateProvider,
} from "../../app/components/app-update/app-update"

loadLocale("en")
const LL = i18nObject("en")

// The device under test runs build 89 (jest defaults Platform.OS to ios).
const mobileVersionsResponse = (minSupported: number, currentSupported: number) => ({
  request: { query: MobileUpdateDocument },
  result: {
    data: {
      mobileVersions: [
        { platform: "android", currentSupported, minSupported },
        { platform: "ios", currentSupported, minSupported },
      ],
    },
  },
})

describe("app update against a real Apollo link", () => {
  it("blocks the user when the foreground re-fetch raises minSupported past this build", async () => {
    const addEventListener = jest.spyOn(AppState, "addEventListener")

    const { queryByText } = render(
      <MockedProvider
        addTypename={false}
        mocks={[
          // first load: an update exists but is optional
          mobileVersionsResponse(1, 95),
          // re-fetch after the app is foregrounded: the floor was raised
          mobileVersionsResponse(95, 96),
        ]}
      >
        <ThemeProvider theme={createTheme({})}>
          <AppUpdateProvider>
            <AppUpdateGate />
            <AppUpdate />
          </AppUpdateProvider>
        </ThemeProvider>
      </MockedProvider>,
    )

    // The first payload landed: soft banner, no block.
    await waitFor(() => expect(queryByText(LL.HomeScreen.updateAvailable())).toBeTruthy())
    expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeNull()

    const changeCalls = addEventListener.mock.calls.filter(
      ([event]) => event === "change",
    )
    // Both components are served by one provider, so there is exactly one
    // subscription and one AppState listener for the whole tree.
    expect(changeCalls).toHaveLength(1)
    const handler = changeCalls[0][1] as (state: string) => void

    await act(async () => {
      handler("active")
    })

    // The second payload has to reach `required`, otherwise the re-check is
    // decorative and a raised floor never lands on a resident app.
    await waitFor(() =>
      expect(queryByText(LL.AppUpdate.versionNotSupported())).toBeTruthy(),
    )
    expect(queryByText(LL.AppUpdate.updateMandatory())).toBeTruthy()
    expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull()
  })
})
