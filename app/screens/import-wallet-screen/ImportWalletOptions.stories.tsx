import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { PersistentStateProvider } from "../store/persistent-state"
import ImportWalletOptions from "./ImportWalletOptions"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

export default {
  title: "Import Wallet/Options",
  component: ImportWalletOptions,
  decorators: [(Story) => <PersistentStateProvider><StoryScreen>{Story()}</StoryScreen></PersistentStateProvider>],
} as Meta<typeof ImportWalletOptions>

export const InsideApp = () => (
  <ImportWalletOptions
    navigation={mockNavigation}
    route={{ key: "ImportWalletOptions", name: "ImportWalletOptions" as const, params: { insideApp: true } } as any}
  />
)

export const OnboardingFlow = () => (
  <ImportWalletOptions
    navigation={mockNavigation}
    route={{ key: "ImportWalletOptions", name: "ImportWalletOptions" as const, params: { insideApp: false } } as any}
  />
)
