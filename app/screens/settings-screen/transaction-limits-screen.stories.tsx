import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { TransactionLimitsScreen } from "./transaction-limits-screen"

export default {
  title: "Transaction Limits Screen",
  component: TransactionLimitsScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof TransactionLimitsScreen>

export const Default = () => (
  <IsAuthedContextProvider value={true}>
    <TransactionLimitsScreen />
  </IsAuthedContextProvider>
)
