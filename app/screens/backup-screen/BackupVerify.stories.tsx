import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import BackupVerify from "./BackupVerify"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "BackupVerify", name: "BackupVerify" as const, params: undefined } as any

export default {
  title: "Backup/BackupVerify",
  component: BackupVerify,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof BackupVerify>

// Note: reads mnemonic from Keychain to build shuffle puzzle — will show empty words in Storybook
export const Default = () => <BackupVerify navigation={mockNavigation} route={mockRoute} />
