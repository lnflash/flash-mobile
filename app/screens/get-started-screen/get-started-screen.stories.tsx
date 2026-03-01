import { MockedProvider } from "@apollo/client/testing"
import { Meta } from "@storybook/react"
import React from "react"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { GetStartedScreen } from "./get-started-screen"
import mocks from "../../graphql/mocks"

// Mock navigation for StackScreenProps
const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  reset: (state: any) => console.log("reset", state),
  replace: (name: string, params?: any) => console.log("replace", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {},
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => false,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
} as any

const mockRoute = {
  key: "getStarted",
  name: "getStarted" as const,
  params: undefined,
} as any

export default {
  title: "Get started screen",
  component: GetStartedScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[...mocks]} cache={createCache()} addTypename={false}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof GetStartedScreen>

export const Default = () => (
  <GetStartedScreen navigation={mockNavigation} route={mockRoute} />
)
