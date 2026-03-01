import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import { PersistentStateProvider } from "../store/persistent-state"
import BackupComplete from "./BackupComplete"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "BackupComplete", name: "BackupComplete" as const, params: undefined } as any

export default {
  title: "Backup/BackupComplete",
  component: BackupComplete,
  decorators: [(Story) => <PersistentStateProvider><StoryScreen>{Story()}</StoryScreen></PersistentStateProvider>],
} as Meta<typeof BackupComplete>

export const Default = () => <BackupComplete navigation={mockNavigation} route={mockRoute} />
