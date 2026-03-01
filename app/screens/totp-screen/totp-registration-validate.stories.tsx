import React from "react"
import { Meta } from "@storybook/react"
import { MockedProvider } from "@apollo/client/testing"
import { StoryScreen } from "../../../.storybook/views"
import { createCache } from "../../graphql/cache"
import { TotpRegistrationValidateScreen } from "./totp-registration-validate"

const mockRoute = {
  key: "totpRegistrationValidate",
  name: "totpRegistrationValidate" as const,
  params: { totpRegistrationId: "test-totp-registration-id" },
} as any

export default {
  title: "TOTP/RegistrationValidate",
  component: TotpRegistrationValidateScreen,
  decorators: [
    (Story) => (
      <MockedProvider mocks={[]} cache={createCache()}>
        <StoryScreen>{Story()}</StoryScreen>
      </MockedProvider>
    ),
  ],
} as Meta<typeof TotpRegistrationValidateScreen>

export const Default = () => <TotpRegistrationValidateScreen route={mockRoute} />
