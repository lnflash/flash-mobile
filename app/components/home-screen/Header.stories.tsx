import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { store } from "../../store/redux"
import Header from "./Header"

export default {
  title: "Home Screen/Header",
  component: Header,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof Header>

export const Authed = () => (
  <IsAuthedContextProvider value={true}>
    <Header />
  </IsAuthedContextProvider>
)

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <Header />
  </IsAuthedContextProvider>
)
