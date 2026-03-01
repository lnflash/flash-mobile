import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import BackupShowSeedPhrase from "./BackupShowSeedPhrase"

// Note: reads seed phrase from Keychain — shows empty/loading in Storybook
const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "BackupShowSeedPhrase", name: "BackupShowSeedPhrase" as const, params: undefined } as any

export default {
  title: "Backup/ShowSeedPhrase",
  component: BackupShowSeedPhrase,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof BackupShowSeedPhrase>

export const Default = () => <BackupShowSeedPhrase navigation={mockNavigation} route={mockRoute} />
