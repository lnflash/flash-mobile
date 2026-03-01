import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { IsAuthedContextProvider } from "../../graphql/is-authed-context"
import { WelcomeFirstScreen } from "./welcome-screen"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => false,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  replace: () => {}, push: () => {}, reset: () => {},
} as any

export default {
  title: "Onboarding/WelcomeScreen",
  component: WelcomeFirstScreen,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof WelcomeFirstScreen>

export const Unauthed = () => (
  <IsAuthedContextProvider value={false}>
    <WelcomeFirstScreen navigation={mockNavigation} />
  </IsAuthedContextProvider>
)

export const Authed = () => (
  <IsAuthedContextProvider value={true}>
    <WelcomeFirstScreen navigation={mockNavigation} />
  </IsAuthedContextProvider>
)
