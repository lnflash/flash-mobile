// The soft "update available" banner is only useful if it is mounted on the
// home screen. app-update-render.spec.tsx renders <AppUpdate /> in isolation and
// would pass identically if the component were mounted nowhere, so this spec
// goes through the real HomeScreen instead: delete the <AppUpdate /> line from
// home-screen.tsx and this fails.
import React from "react"

import { render, waitFor } from "@testing-library/react-native"

import { MobileUpdateDocument } from "@app/graphql/generated"
import sharedMocks from "@app/graphql/mocks"

import { i18nObject } from "../../app/i18n/i18n-util"
import { loadLocale } from "../../app/i18n/i18n-util.sync"
import { HomeScreen } from "../../app/screens/home-screen"
import { ContextForScreen } from "./helper"

loadLocale("en")
const LL = i18nObject("en")

// __mocks__/react-native-device-info.js reports build 1234 for every screen
// test, and jest defaults Platform.OS to ios.
const DEVICE_BUILD = 1234

const mobileVersionsMock = (minSupported: number, currentSupported: number) => [
  ...sharedMocks.filter((mock) => mock.request.query !== MobileUpdateDocument),
  {
    request: { query: MobileUpdateDocument },
    result: {
      data: {
        mobileVersions: [
          { platform: "android", currentSupported, minSupported },
          { platform: "ios", currentSupported, minSupported },
        ],
      },
    },
  },
]

describe("HomeScreen version banner", () => {
  it("shows the update-available banner when the served build is newer", async () => {
    const { getByText } = render(
      <ContextForScreen mocks={mobileVersionsMock(DEVICE_BUILD - 1, DEVICE_BUILD + 1)}>
        <HomeScreen />
      </ContextForScreen>,
    )

    await waitFor(() => expect(getByText(LL.HomeScreen.updateAvailable())).toBeTruthy())
  })

  it("shows nothing when this build is already current", async () => {
    // The negative control: without it the assertion above could pass on a
    // banner that is always on.
    const { queryByText } = render(
      <ContextForScreen mocks={mobileVersionsMock(DEVICE_BUILD - 1, DEVICE_BUILD)}>
        <HomeScreen />
      </ContextForScreen>,
    )

    await waitFor(() => expect(queryByText(LL.HomeScreen.updateAvailable())).toBeNull())
  })
})
