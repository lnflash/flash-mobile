import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../.storybook/views"
import { createCache } from "../graphql/cache"
import mocks from "../graphql/mocks"
import { IsAuthedContextProvider } from "../graphql/is-authed-context"
import { Welcome } from "./welcome"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "Welcome", name: "Welcome" as const, params: undefined } as any

export default {
  title: "Authentication/Welcome",
  component: Welcome,
  decorators: [
    (Story) => (
      <MockedProvider mocks={mocks} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof Welcome>

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <Welcome navigation={mockNavigation} route={mockRoute} />
  </IsAuthedContextProvider>
)

export const Authed = () => (
  <IsAuthedContextProvider value={true}>
    <Welcome navigation={mockNavigation} route={mockRoute} />
  </IsAuthedContextProvider>
)
