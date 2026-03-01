import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../../.storybook/views"
import { createCache } from "../../../graphql/cache"
import mocks from "../../../graphql/mocks"
import { IsAuthedContextProvider } from "../../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../../store/persistent-state"
import { store } from "../../../store/redux"
import { AccountScreen } from "./account-screen"

export default {
  title: "Settings/Account (New)",
  component: AccountScreen,
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
} as Meta<typeof AccountScreen>

export const Default = () => <AccountScreen />
