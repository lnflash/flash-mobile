import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import ConversionConfirmationScreen from "./conversion-confirmation-screen"
import { WalletCurrency } from "../../graphql/generated"
import { DisplayCurrency } from "../../types/amounts"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: (action: any) => console.log("dispatch", action),
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => true,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
  pop: () => {},
  replace: () => {},
  reset: () => {},
} as any

// conversionConfirmation params: { moneyAmount, sendingFee, receivingFee, lnInvoice }
const mockRoute = {
  key: "conversionConfirmation",
  name: "conversionConfirmation" as const,
  params: {
    moneyAmount: {
      amount: 5000,
      currency: WalletCurrency.Btc,
      currencyCode: WalletCurrency.Btc,
    },
    sendingFee: 0,
    receivingFee: 0,
    lnInvoice: "lnbc50u1p...",
  },
} as any

export default {
  title: "Conversion Confirmation Screen",
  component: ConversionConfirmationScreen,
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
} as Meta<typeof ConversionConfirmationScreen>

export const BtcToUsd = () => (
  <ConversionConfirmationScreen navigation={mockNavigation} route={mockRoute} />
)

export const UsdToBtc = () => (
  <ConversionConfirmationScreen
    navigation={mockNavigation}
    route={{ ...mockRoute, params: { ...mockRoute.params, moneyAmount: { amount: 100, currency: WalletCurrency.Usd, currencyCode: "USD" } } }}
  />
)
