import React from "react"
import { AppUpdate, AppUpdateModal, AppUpdateProvider } from "./app-update"
import { StoryScreen } from "../../../.storybook/views"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { MobileUpdateDocument } from "../../graphql/generated"
import { GaloyPrimaryButton } from "../../components/atomic/galoy-primary-button"
import { View } from "react-native"

const updateAvailable = [
  {
    request: {
      query: MobileUpdateDocument,
    },
    result: {
      data: {
        mobileVersions: [
          {
            platform: "android",
            currentSupported: 500,
            minSupported: 400,
          },
          {
            platform: "ios",
            currentSupported: 500,
            minSupported: 400,
          },
        ],
      },
    },
  },
]

const updateRequired = [
  {
    request: {
      query: MobileUpdateDocument,
    },
    result: {
      data: {
        mobileVersions: [
          {
            platform: "android",
            currentSupported: 500,
            minSupported: 450,
          },
          {
            platform: "ios",
            currentSupported: 500,
            minSupported: 450,
          },
        ],
      },
    },
  },
]

// TODO: look at how to use mocks in storybook
// we need to get a consistent number if we don't want to have to update the
// number in the query every time.
//
// alternatively,
// we could use do some math and do currentSupported: getBuildNumber() + 1
//
// jest.mock("react-native-device-info", () => ({
//   getBuildNumber: () => 427,
// }))

export default {
  title: "App Update",
  component: AppUpdate,
  decorators: [
    (Story) => (
      <IsAuthedContextProvider value={false}>
        <StoryScreen>{Story()}</StoryScreen>
      </IsAuthedContextProvider>
    ),
  ],
} as Meta<typeof AppUpdate>

export const UpdateAvailable = () => (
  <MockedProvider mocks={updateAvailable} cache={createCache()}>
    {/* AppUpdate reads the shared version check; in the app the provider is
        mounted once in app.tsx, above both the gate and the navigator. */}
    <AppUpdateProvider>
      <AppUpdate />
    </AppUpdateProvider>
  </MockedProvider>
)

// Stands in for the mail composer the gate opens in the app. Contact Support is
// one of only two escapes from this modal, so a story that renders it has to
// wire it — a dead button here would misrepresent the thing being reviewed.
const logContactSupport = (subject: string, body: string) =>
  console.log("contactSupport", { subject, body })

export const UpdateRequiredModal = () => {
  const [visible, setVisible] = React.useState(false)

  const openModal = () => setVisible(true)
  const closeModal = () => setVisible(false)
  return (
    <MockedProvider mocks={updateRequired} cache={createCache()}>
      <View>
        <GaloyPrimaryButton onPress={openModal} title="Open Modal" />

        <AppUpdateModal
          isVisible={visible}
          linkUpgrade={closeModal}
          contactSupport={logContactSupport}
        />
      </View>
    </MockedProvider>
  )
}

// The store link can fail to open (an Android device with neither a store app
// nor a browser that takes the https listing). A toast is swallowed behind a
// modal, so the gate says so inline instead — and the text it renders points at
// Contact Support, which is why that button is wired here too.
export const UpdateRequiredModalStoreLinkFailed = () => {
  const [visible, setVisible] = React.useState(false)

  const openModal = () => setVisible(true)
  const closeModal = () => setVisible(false)
  return (
    <MockedProvider mocks={updateRequired} cache={createCache()}>
      <View>
        <GaloyPrimaryButton onPress={openModal} title="Open Modal" />

        <AppUpdateModal
          isVisible={visible}
          linkUpgrade={closeModal}
          contactSupport={logContactSupport}
          openFailed
        />
      </View>
    </MockedProvider>
  )
}
