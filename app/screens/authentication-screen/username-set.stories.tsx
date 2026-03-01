import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { store } from "../../store/redux"
import { UsernameSet } from "./username-set"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "UsernameSet", name: "UsernameSet" as const, params: undefined } as any

export default {
  title: "Authentication/UsernameSet",
  component: UsernameSet,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof UsernameSet>

export const Default = () => <UsernameSet navigation={mockNavigation} route={mockRoute} />
