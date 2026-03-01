import { MockedProvider } from "@apollo/client/testing"
import { Meta } from "@storybook/react"
import React from "react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import mocks from "../../graphql/mocks"
import ReceiveScreen from "./receive-screen"

export default {
  title: "Receive",
  component: ReceiveScreen,
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
} as Meta<typeof ReceiveScreen>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <ReceiveScreen />
  </IsAuthedContextProvider>
)

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <ReceiveScreen />
  </IsAuthedContextProvider>
)
