import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { store } from "../store/redux"
import CashoutConfirmation from "./CashoutConfirmation"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockOffer = {
  __typename: "CashoutOffer" as const,
  walletId: "f091c102-6277-4cc6-8d81-87ebf6aaad1b",
  offerId: "offer-test-123",
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).getTime(), // 5 min from now
  exchangeRate: 16800, // JMD cents per USD cent = J$168/USD
  send: 1000, // USDCents (= $10.00)
  receiveUsd: 950, // USDCents after fee
  receiveJmd: 159600, // JMD cents (= J$1596)
  flashFee: 50, // USDCents (= $0.50)
}

const mockRoute = {
  key: "CashoutConfirmation",
  name: "CashoutConfirmation" as const,
  params: { offer: mockOffer },
} as any

export default {
  title: "Cashout/Confirmation",
  component: CashoutConfirmation,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof CashoutConfirmation>

export const Default = () => <CashoutConfirmation navigation={mockNavigation} route={mockRoute} />
