import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import { BTCTransactionHistory } from "./BTCTransactionHistory"

export default {
  title: "Transaction History/BTC",
  component: BTCTransactionHistory,
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
} as Meta<typeof BTCTransactionHistory>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <BTCTransactionHistory />
  </IsAuthedContextProvider>
)
