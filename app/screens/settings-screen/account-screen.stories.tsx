import * as React from "react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { Meta } from "@storybook/react"
import { createCache } from "../../graphql/cache"
import { AccountScreenDocument } from "../../graphql/generated"
import mocks from "../../graphql/mocks"
import { AccountScreen } from "./account-screen"
import { MockedProvider } from "@apollo/client/testing"
import { AccountLevel, LevelContextProvider } from "../../graphql/level-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"

const wallets = [
  { id: "f79792e3-282b-45d4-85d5-7486d020def5", balance: 88413, walletCurrency: "BTC", __typename: "BTCWallet" },
  { id: "f091c102-6277-4cc6-8d81-87ebf6aaad1b", balance: 158, walletCurrency: "USD", __typename: "UsdWallet" },
]

const makeAccountMock = (overrides = {}) => ({
  request: { query: AccountScreenDocument },
  result: {
    data: {
      me: {
        id: "70df9822-efe0-419c-b864-c9efa99872ea",
        phone: "+50365055539",
        totpEnabled: false,
        email: { address: "test@getflash.io", verified: true, __typename: "Email" },
        defaultAccount: {
          id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
          level: "ONE",
          wallets,
          __typename: "ConsumerAccount",
        },
        __typename: "User",
        ...overrides,
      },
    },
  },
})

const Decorator = (Story: React.FC) => (
  <Provider store={store}>
    <PersistentStateProvider>
      <StoryScreen>{Story()}</StoryScreen>
    </PersistentStateProvider>
  </Provider>
)

export default {
  title: "Account Screen",
  component: AccountScreen,
  decorators: [Decorator],
} as Meta<typeof AccountScreen>

export const LevelOne = () => (
  <MockedProvider mocks={[...mocks, makeAccountMock()]} cache={createCache()}>
    <LevelContextProvider value={AccountLevel.One}>
      <AccountScreen />
    </LevelContextProvider>
  </MockedProvider>
)

export const LevelTwo = () => (
  <MockedProvider
    mocks={[...mocks, makeAccountMock({ defaultAccount: { id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8", level: "TWO", wallets, __typename: "ConsumerAccount" } })]}
    cache={createCache()}
  >
    <LevelContextProvider value={AccountLevel.Two}>
      <AccountScreen />
    </LevelContextProvider>
  </MockedProvider>
)

export const NoEmail = () => (
  <MockedProvider
    mocks={[...mocks, makeAccountMock({ email: null })]}
    cache={createCache()}
  >
    <LevelContextProvider value={AccountLevel.One}>
      <AccountScreen />
    </LevelContextProvider>
  </MockedProvider>
)

export const WithTOTP = () => (
  <MockedProvider
    mocks={[...mocks, makeAccountMock({ totpEnabled: true })]}
    cache={createCache()}
  >
    <LevelContextProvider value={AccountLevel.Two}>
      <AccountScreen />
    </LevelContextProvider>
  </MockedProvider>
)
