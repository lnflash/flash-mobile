import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { createCache } from "../../graphql/cache"
import { StoryScreen } from "../../../.storybook/views"
import { EmailLoginValidateScreen } from "./email-login-validate"

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

// Route params fixed: emailLoginValidate expects { email, emailLoginId }
// Previous story had wrong params: { phone, channel }
const route = {
  key: "emailLoginValidate",
  name: "emailLoginValidate" as const,
  params: {
    email: "test@getflash.io",
    emailLoginId: "test-email-login-id-123",
  },
} as any

export default {
  title: "EmailLoginValidateScreen",
  component: EmailLoginValidateScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof EmailLoginValidateScreen>

export const Default = () => (
  <EmailLoginValidateScreen navigation={mockNavigation} route={route} />
)
