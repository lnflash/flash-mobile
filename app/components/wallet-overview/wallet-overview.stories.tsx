import { MockedProvider } from "@apollo/client/testing"
import { Meta } from "@storybook/react"
import React from "react"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import mocks from "../../graphql/mocks"
import WalletOverview from "./wallet-overview"

export default {
  title: "Wallet Overview",
  component: WalletOverview,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof WalletOverview>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <WalletOverview setIsUnverifiedSeedModalVisible={() => {}} />
  </IsAuthedContextProvider>
)

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <WalletOverview setIsUnverifiedSeedModalVisible={() => {}} />
  </IsAuthedContextProvider>
)
