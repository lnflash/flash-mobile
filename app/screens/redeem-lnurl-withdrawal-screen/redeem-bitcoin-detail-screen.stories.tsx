import * as React from "react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import RedeemBitcoinDetailScreen from "./redeem-bitcoin-detail-screen"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {},
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => true,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
  pop: () => {},
  replace: () => {},
} as any

export default {
  title: "Redeem Bitcoin Detail",
  component: RedeemBitcoinDetailScreen,
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
} as Meta<typeof RedeemBitcoinDetailScreen>

const validDestinationTemplate = {
  callback: "http://callback.com",
  domain: "domain",
  defaultDescription: "defaultDescription",
  k1: "k1",
}

const routeSetValue = {
  key: "redeemBitcoinDetail",
  name: "redeemBitcoinDetail",
  params: {
    receiveDestination: {
      validDestination: {
        ...validDestinationTemplate,
        maxWithdrawable: 10000000,
        minWithdrawable: 10000000,
      },
    },
  },
} as const

const routeDiffMinMax = {
  key: "redeemBitcoinDetail",
  name: "redeemBitcoinDetail",
  params: {
    receiveDestination: {
      validDestination: {
        ...validDestinationTemplate,
        maxWithdrawable: 10000000,
        minWithdrawable: 1000,
      },
    },
  },
} as const

export const SetValue = () => (
  <RedeemBitcoinDetailScreen route={routeSetValue} navigation={mockNavigation} />
)

export const DiffMinMax = () => (
  <RedeemBitcoinDetailScreen route={routeDiffMinMax} navigation={mockNavigation} />
)
