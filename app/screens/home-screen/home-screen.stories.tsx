import React from "react"
import { Provider } from "react-redux"
import { HomeScreen } from "./home-screen"
import { StoryScreen } from "../../../.storybook/views"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import mocks from "../../graphql/mocks"

export default {
  title: "Home Screen",
  component: HomeScreen,
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
} as Meta<typeof HomeScreen>

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <HomeScreen />
  </IsAuthedContextProvider>
)

export const Authed = () => (
  <IsAuthedContextProvider value={true}>
    <HomeScreen />
  </IsAuthedContextProvider>
)
