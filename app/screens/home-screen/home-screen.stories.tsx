import React from "react"
import { HomeScreen } from "./home-screen"
import { StoryScreen } from "../../../.storybook/views"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import mocks from "../../graphql/mocks"
import { AppUpdateProvider } from "../../components/app-update/app-update"

export default {
  title: "Home Screen",
  component: HomeScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        {/* app.tsx mounts this above the navigator; the home screen's update
            banner reads it. */}
        <AppUpdateProvider>
          <StoryScreen>{Story()}</StoryScreen>
        </AppUpdateProvider>
      </MockedProvider>
    ),
  ],
} as Meta<typeof HomeScreen>

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <HomeScreen />
  </IsAuthedContextProvider>
)
export const Authed = () => (
  <IsAuthedContextProvider value={true}>
    <HomeScreen />
  </IsAuthedContextProvider>
)
