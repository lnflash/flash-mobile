import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../../graphql/cache"
import mocks from "../../../graphql/mocks"
import { IsAuthedContextProvider } from "../../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../../store/persistent-state"
import { store } from "../../../store/redux"
import { NostrSettingsScreen } from "./nostr-settings-screen"

export default {
  title: "Nostr Settings Screen",
  component: NostrSettingsScreen,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <PersistentStateProvider>
          <MockedProvider mocks={mocks} cache={createCache()}>
            <StoryScreen>{Story()}</StoryScreen>
          </MockedProvider>
        </PersistentStateProvider>
      </Provider>
    ),
  ],
} as Meta<typeof NostrSettingsScreen>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <NostrSettingsScreen />
  </IsAuthedContextProvider>
)
