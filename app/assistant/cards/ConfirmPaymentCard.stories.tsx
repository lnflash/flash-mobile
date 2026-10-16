import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { ConfirmPaymentCard } from "./ConfirmPaymentCard"
import { confirmPaymentFixture } from "./fixtures"
import { storyActions } from "./story-actions"

export default {
  title: "Assistant / Confirm payment card",
  component: ConfirmPaymentCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ConfirmPaymentCard>

export const Default = () => (
  <ConfirmPaymentCard payload={confirmPaymentFixture} actions={storyActions()} />
)

export const Expired = () => (
  <ConfirmPaymentCard
    payload={{ ...confirmPaymentFixture, expiresAt: 0 }}
    actions={storyActions()}
  />
)

export const NoAuth = () => (
  <ConfirmPaymentCard
    payload={confirmPaymentFixture}
    actions={storyActions({
      can: { enabled: false, state: "armed", replyKey: "Assistant.authUnavailable" },
    })}
  />
)

export const BadPayload = () => (
  <ConfirmPaymentCard
    payload={{ ...confirmPaymentFixture, totalText: "" }}
    actions={storyActions()}
  />
)

export const Conversion = () => (
  <ConfirmPaymentCard
    payload={{
      ...confirmPaymentFixture,
      payeeLabel: "BTC",
      payeeUsername: undefined,
      memo: undefined,
      toWallet: "BTC",
      receiveText: "J$782.00 (7,917 sats)",
    }}
    actions={storyActions()}
  />
)

export const UnknownOutcome = () => (
  <ConfirmPaymentCard
    payload={confirmPaymentFixture}
    actions={storyActions({
      result: (actionId) => ({
        kind: "executed",
        actionId,
        outcome: {
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        },
      }),
    })}
  />
)
