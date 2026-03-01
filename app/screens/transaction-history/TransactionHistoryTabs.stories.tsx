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
import { TransactionHistoryTabs } from "./TransactionHistoryTabs"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

export default {
  title: "Transaction History/Tabs",
  component: TransactionHistoryTabs,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <PersistentStateProvider>
          <IsAuthedContextProvider value={true}>
            <MockedProvider mocks={mocks} cache={createCache()}>
              <StoryScreen>{Story()}</StoryScreen>
            </MockedProvider>
          </IsAuthedContextProvider>
        </PersistentStateProvider>
      </Provider>
    ),
  ],
} as Meta<typeof TransactionHistoryTabs>

const makeRoute = (tab?: string) => ({
  key: "TransactionHistoryTabs", name: "TransactionHistoryTabs" as const,
  params: tab ? { initialRouteName: tab } : undefined,
} as any)

export const StartOnBTC = () => (
  <TransactionHistoryTabs navigation={mockNavigation} route={makeRoute("BTCTransactionHistory")} />
)

export const StartOnUSD = () => (
  <TransactionHistoryTabs navigation={mockNavigation} route={makeRoute("USDTransactionHistory")} />
)
