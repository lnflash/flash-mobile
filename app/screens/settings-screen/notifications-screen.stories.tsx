import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { NotificationSettingsScreen } from "./notifications-screen"
import { store } from "../../store/redux"

export default {
  title: "Notification Settings Screen",
  component: NotificationSettingsScreen,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof NotificationSettingsScreen>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <NotificationSettingsScreen />
  </IsAuthedContextProvider>
)

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <NotificationSettingsScreen />
  </IsAuthedContextProvider>
)
