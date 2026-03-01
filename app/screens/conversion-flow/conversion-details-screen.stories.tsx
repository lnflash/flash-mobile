import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { PersistentStateProvider } from "../../store/persistent-state"
import { store } from "../../store/redux"
import ConversionDetailsScreen from "./conversion-details-screen"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {},
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => true,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
  pop: () => {},
  replace: () => {},
  reset: () => {},
} as any

const mockRoute = {
  key: "conversionDetails",
  name: "conversionDetails" as const,
  params: undefined,
} as any

export default {
  title: "Conversion Details Screen",
  component: ConversionDetailsScreen,
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
} as Meta<typeof ConversionDetailsScreen>

export const Default = () => (
  <ConversionDetailsScreen navigation={mockNavigation} route={mockRoute} />
)
