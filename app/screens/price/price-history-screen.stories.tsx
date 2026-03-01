import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { PriceHistoryScreen } from "./price-history-screen"

export default {
  title: "Price History Screen",
  component: PriceHistoryScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof PriceHistoryScreen>

export const Default = () => <PriceHistoryScreen />
