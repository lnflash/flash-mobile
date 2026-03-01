import { MockedProvider } from "@apollo/client/testing"
import { Meta } from "@storybook/react"
import React from "react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import SendBitcoinConfirmationScreen from "./send-bitcoin-confirmation-screen"
import * as PaymentDetails from "./payment-details/intraledger"
import mocks from "../../graphql/mocks"
import { WalletCurrency } from "../../graphql/generated"
import { ConvertMoneyAmount } from "./payment-details/index.types"
import { DisplayCurrency, toUsdMoneyAmount } from "@app/types/amounts"

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
  popToTop: () => {},
  replace: () => {},
  push: () => {},
  reset: () => {},
} as any

const convertMoneyAmountMock: ConvertMoneyAmount = (amount, currency) => ({
  amount: amount.amount,
  currency,
  currencyCode: currency === DisplayCurrency ? "USD" : currency,
})

const btcSendingWalletDescriptor = {
  currency: WalletCurrency.Btc,
  id: "f79792e3-282b-45d4-85d5-7486d020def5",
}

const testAmount = toUsdMoneyAmount(100)

const intraledgerParams: PaymentDetails.CreateIntraledgerPaymentDetailsParams<WalletCurrency> = {
  handle: "test",
  recipientWalletId: "testid",
  convertMoneyAmount: convertMoneyAmountMock,
  sendingWalletDescriptor: btcSendingWalletDescriptor,
  unitOfAccountAmount: testAmount,
}

const paymentDetail =
  PaymentDetails.createIntraledgerPaymentDetails(intraledgerParams)

const route = {
  key: "sendBitcoinConfirmationScreen",
  name: "sendBitcoinConfirmation",
  params: { paymentDetail },
} as const

export default {
  title: "SendBitcoinConfirmationScreen",
  component: SendBitcoinConfirmationScreen,
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
} as Meta<typeof SendBitcoinConfirmationScreen>

export const Intraledger = () => (
  <SendBitcoinConfirmationScreen route={route} navigation={mockNavigation} />
)
