import React from "react"
import { Meta } from "@storybook/react"
import { Provider } from "react-redux"
import { StoryScreen } from "../../../.storybook/views"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { store } from "../../store/redux"
import { SecurityScreen } from "./security-screen"

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

const makeRoute = (biometrics: boolean, pin: boolean) => ({
  key: "security",
  name: "security" as const,
  params: {
    mIsBiometricsEnabled: biometrics,
    mIsPinEnabled: pin,
  },
} as any)

export default {
  title: "Security Screen",
  component: SecurityScreen,
  decorators: [
    (Story) => (
      <Provider store={store}>
        <MockedProvider mocks={mocks} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </Provider>
    ),
  ],
} as Meta<typeof SecurityScreen>

export const BiometricsAndPin = () => (
  <SecurityScreen navigation={mockNavigation} route={makeRoute(true, true)} />
)

export const PinOnly = () => (
  <SecurityScreen navigation={mockNavigation} route={makeRoute(false, true)} />
)

export const NoSecurity = () => (
  <SecurityScreen navigation={mockNavigation} route={makeRoute(false, false)} />
)
