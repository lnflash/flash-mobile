import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { IsAuthedContextProvider } from "../graphql/is-authed-context"
import { store } from "../store/redux"
import RefundTransactionsList from "./RefundTransactionsList"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "RefundTransactionList", name: "RefundTransactionList" as const, params: undefined } as any

export default {
  title: "Refund Flow/TransactionsList",
  component: RefundTransactionsList,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <IsAuthedContextProvider value={true}>
          <MockedProvider mocks={mocks} cache={createCache()}>
            <StoryScreen>{Story()}</StoryScreen>
          </MockedProvider>
        </IsAuthedContextProvider>
      </Provider>
    ),
  ],
} as Meta<typeof RefundTransactionsList>

export const Default = () => <RefundTransactionsList navigation={mockNavigation} route={mockRoute} />
