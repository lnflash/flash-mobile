import React from "react"
import { Meta } from "@storybook/react"
import { StoryScreen } from "../../../.storybook/views"
import { ConfirmationError } from "./ConfirmationError"

export default {
  title: "Send Flow/ConfirmationError",
  component: ConfirmationError,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ConfirmationError>

export const NoError = () => <ConfirmationError />
export const PaymentError = () => <ConfirmationError paymentError="Payment failed: insufficient funds" />
export const InvalidAmount = () => <ConfirmationError invalidAmountErrorMessage="Amount exceeds daily limit" />
export const BothErrors = () => <ConfirmationError paymentError="Payment rejected" invalidAmountErrorMessage="Amount too small" />
