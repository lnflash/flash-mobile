import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import BackupSeedPhrase from "./BackupSeedPhrase"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "BackupSeedPhrase", name: "BackupSeedPhrase" as const, params: undefined } as any

export default {
  title: "Backup/BackupSeedPhrase",
  component: BackupSeedPhrase,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof BackupSeedPhrase>

// Note: reads mnemonic from device Keychain — will show empty/loading in Storybook
export const Default = () => <BackupSeedPhrase navigation={mockNavigation} route={mockRoute} />
