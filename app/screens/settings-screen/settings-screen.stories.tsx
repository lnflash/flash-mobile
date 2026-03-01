import * as React from "react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { SettingsScreen } from "./settings-screen"
import { Meta } from "@storybook/react"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { createCache } from "../../graphql/cache"
import { SettingsScreenDocument } from "../../graphql/generated"
import mocks from "../../graphql/mocks"
import { MockedProvider } from "@apollo/client/testing"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"

const wallets = [
  {
    id: "f79792e3-282b-45d4-85d5-7486d020def5",
    balance: 88413,
    walletCurrency: "BTC",
    __typename: "BTCWallet",
  },
  {
    id: "f091c102-6277-4cc6-8d81-87ebf6aaad1b",
    balance: 158,
    walletCurrency: "USD",
    __typename: "UsdWallet",
  },
]

const makeSettingsMock = (username: string) => ({
  request: { query: SettingsScreenDocument },
  result: {
    data: {
      me: {
        id: "70df9822-efe0-419c-b864-c9efa99872ea",
        phone: "+50365055539",
        username,
        language: "",
        totpEnabled: false,
        defaultAccount: {
          id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
          defaultWalletId: "f79792e3-282b-45d4-85d5-7486d020def5",
          wallets,
          __typename: "ConsumerAccount",
        },
        email: {
          address: "test@getflash.io",
          verified: true,
          __typename: "Email",
        },
        __typename: "User",
      },
    },
  },
})

const Decorators = (Story: React.FC) => (
  <Provider store={store}>
    <PersistentStateProvider>
      <StoryScreen>{Story()}</StoryScreen>
    </PersistentStateProvider>
  </Provider>
)

export default {
  title: "Settings Screen",
  component: SettingsScreen,
  decorators: [Decorators],
} as Meta<typeof SettingsScreen>

export const NotLoggedIn = () => (
  <MockedProvider mocks={mocks} cache={createCache()}>
    <IsAuthedContextProvider value={false}>
      <SettingsScreen />
    </IsAuthedContextProvider>
  </MockedProvider>
)

export const LoggedInNoUsername = () => (
  <MockedProvider mocks={[...mocks, makeSettingsMock("")]} cache={createCache()}>
    <IsAuthedContextProvider value={true}>
      <SettingsScreen />
    </IsAuthedContextProvider>
  </MockedProvider>
)

export const LoggedInWithUsername = () => (
  <MockedProvider mocks={[...mocks, makeSettingsMock("test1")]} cache={createCache()}>
    <IsAuthedContextProvider value={true}>
      <SettingsScreen />
    </IsAuthedContextProvider>
  </MockedProvider>
)

export const LoggedInWithTOTP = () => (
  <MockedProvider
    mocks={[
      ...mocks,
      {
        request: { query: SettingsScreenDocument },
        result: {
          data: {
            me: {
              ...makeSettingsMock("test1").result.data.me,
              totpEnabled: true,
            },
          },
        },
      },
    ]}
    cache={createCache()}
  >
    <IsAuthedContextProvider value={true}>
      <SettingsScreen />
    </IsAuthedContextProvider>
  </MockedProvider>
)
