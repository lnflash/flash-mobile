import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { TotpLoginValidateScreen } from "./totp-login-validate"

const mockRoute = {
  key: "totpLoginValidate",
  name: "totpLoginValidate" as const,
  params: { authToken: "test-auth-token-123" },
} as any

export default {
  title: "TOTP/LoginValidate",
  component: TotpLoginValidateScreen,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof TotpLoginValidateScreen>

export const Default = () => <TotpLoginValidateScreen route={mockRoute} />
