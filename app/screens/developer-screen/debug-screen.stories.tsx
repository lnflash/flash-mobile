import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { DeveloperScreen } from "./debug-screen"

export default {
  title: "Developer/DebugScreen",
  component: DeveloperScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof DeveloperScreen>

export const Default = () => <DeveloperScreen />
