import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { StoryScreen } from "../../../.storybook/views"
import { PhoneLoginValidationScreen } from "./phone-login-validation"
import { PersistentStateProvider } from "../../store/persistent-state"
import { PhoneCodeChannelType } from "../../graphql/generated"

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
  reset: () => {},
} as any

const route = {
  key: "phoneLoginValidate",
  name: "phoneLoginValidate" as const,
  params: {
    phone: "+50365055543",
    channel: PhoneCodeChannelType.Sms,
  },
} as any

export default {
  title: "PhoneLoginValidationScreen",
  component: PhoneLoginValidationScreen,
  decorators: [
    (Story) => (
      <PersistentStateProvider>
        <MockedProvider mocks={[]} cache={createCache()}>
          <StoryScreen>{Story()}</StoryScreen>
        </MockedProvider>
      </PersistentStateProvider>
    ),
  ],
} as Meta<typeof PhoneLoginValidationScreen>

export const Default = () => (
  <PhoneLoginValidationScreen navigation={mockNavigation} route={route} />
)
