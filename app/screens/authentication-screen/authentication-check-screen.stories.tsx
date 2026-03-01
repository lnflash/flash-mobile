import * as React from "react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import mocks from "../../graphql/mocks"
import { AuthenticationCheckScreen } from "./authentication-check-screen"
import { Meta } from "@storybook/react"
import { AuthenticationContextProvider } from "../../navigation/navigation-container-wrapper"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {},
  setOptions: () => {},
  addListener: () => () => {},
  removeListener: () => {},
  isFocused: () => true,
  canGoBack: () => false,
  getParent: () => undefined,
  getState: () => ({ index: 0, routes: [] }),
  reset: () => {},
  replace: () => {},
} as any

const mockRoute = {
  key: "authenticationCheck",
  name: "authenticationCheck" as const,
  params: undefined,
} as any

export default {
  title: "Authentication Check Screen",
  component: AuthenticationCheckScreen,
} as Meta<typeof AuthenticationCheckScreen>

export const Authed = () => (
  <MockedProvider mocks={mocks} cache={createCache()}>
    <AuthenticationContextProvider
      value={{ isAppLocked: true, setAppUnlocked: () => {}, setAppLocked: () => {} }}
    >
      <IsAuthedContextProvider value={true}>
        <AuthenticationCheckScreen navigation={mockNavigation} route={mockRoute} />
      </IsAuthedContextProvider>
    </AuthenticationContextProvider>
  </MockedProvider>
)

export const Unauthed = () => (
  <MockedProvider mocks={mocks} cache={createCache()}>
    <AuthenticationContextProvider
      value={{ isAppLocked: false, setAppUnlocked: () => {}, setAppLocked: () => {} }}
    >
      <IsAuthedContextProvider value={false}>
        <AuthenticationCheckScreen navigation={mockNavigation} route={mockRoute} />
      </IsAuthedContextProvider>
    </AuthenticationContextProvider>
  </MockedProvider>
)
