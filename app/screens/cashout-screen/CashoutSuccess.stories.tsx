import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../.storybook/views"
import CashoutSuccess from "./CashoutSuccess"

const mockNavigation = {
  navigate: (name: string, params?: any) => console.log("navigate", name, params),
  goBack: () => console.log("goBack"),
  dispatch: () => {}, setOptions: () => {},
  addListener: () => () => {}, removeListener: () => {},
  isFocused: () => true, canGoBack: () => true,
  getParent: () => undefined, getState: () => ({ index: 0, routes: [] }),
  pop: () => {}, replace: () => {}, push: () => {}, reset: () => {},
} as any

const mockRoute = { key: "CashoutSuccess", name: "CashoutSuccess" as const, params: undefined } as any

export default {
  title: "Cashout/Success",
  component: CashoutSuccess,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof CashoutSuccess>

export const Default = () => <CashoutSuccess navigation={mockNavigation} route={mockRoute} />
