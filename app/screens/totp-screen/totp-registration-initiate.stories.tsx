import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { TotpRegistrationInitiateScreen } from "./totp-registration-initiate"

export default {
  title: "TOTP/RegistrationInitiate",
  component: TotpRegistrationInitiateScreen,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof TotpRegistrationInitiateScreen>

export const Default = () => <TotpRegistrationInitiateScreen />
