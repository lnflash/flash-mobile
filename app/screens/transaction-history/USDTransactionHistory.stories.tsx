import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { store } from "../../store/redux"
import { USDTransactionHistory } from "./USDTransactionHistory"

export default {
  title: "Transaction History/USD",
  component: USDTransactionHistory,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof USDTransactionHistory>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <USDTransactionHistory />
  </IsAuthedContextProvider>
)
