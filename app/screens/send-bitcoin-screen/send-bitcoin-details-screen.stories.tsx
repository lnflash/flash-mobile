import { MockedProvider } from "@apollo/client/testing"
import { PaymentType } from "@galoymoney/client"
import { Meta } from "@storybook/react"
import React from "react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import SendBitcoinDetailsScreen from "./send-bitcoin-details-screen"
import mocks from "../../graphql/mocks"
import {
  DestinationDirection,
  PaymentDestination,
  ResolvedIntraledgerPaymentDestination,
} from "./payment-destination/index.types"
import { createIntraledgerPaymentDetails } from "./payment-details"
import { DisplayCurrency, ZeroBtcMoneyAmount } from "@app/types/amounts"
import { WalletCurrency } from "../../graphql/generated"

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
  push: () => {},
  reset: () => {},
} as any

export default {
  title: "SendBitcoinDetailsScreen",
  component: SendBitcoinDetailsScreen,
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
} as Meta<typeof SendBitcoinDetailsScreen>

const walletId = "f79792e3-282b-45d4-85d5-7486d020def5"
const handle = "test"

const validDestination: ResolvedIntraledgerPaymentDestination = {
  valid: true,
  walletId,
  paymentType: PaymentType.Intraledger,
  handle,
}

const createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor }: any) =>
  createIntraledgerPaymentDetails({
    handle,
    recipientWalletId: walletId,
    sendingWalletDescriptor,
    convertMoneyAmount,
    unitOfAccountAmount: ZeroBtcMoneyAmount,
  })

const paymentDestination: PaymentDestination = {
  valid: true,
  validDestination,
  destinationDirection: DestinationDirection.Send,
  createPaymentDetail,
}

const route = {
  key: "sendBitcoinDetailsScreen",
  name: "sendBitcoinDetails",
  params: { paymentDestination },
} as const

export const Intraledger = () => (
  <SendBitcoinDetailsScreen route={route} navigation={mockNavigation} />
)
