import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import BackupDoubleCheck from "./BackupDoubleCheck"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "BackupDoubleCheck", name: "BackupDoubleCheck" as const, params: undefined } as any

export default {
  title: "Backup/DoubleCheck",
  component: BackupDoubleCheck,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof BackupDoubleCheck>

export const Default = () => <BackupDoubleCheck navigation={mockNavigation} route={mockRoute} />
