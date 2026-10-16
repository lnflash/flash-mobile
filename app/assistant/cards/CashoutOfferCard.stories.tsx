import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { CashoutOfferCard } from "./CashoutOfferCard"
import { cashoutOfferFixture } from "./fixtures"
import { storyActions } from "./story-actions"

export default {
  title: "Assistant / Settlement offer card",
  component: CashoutOfferCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof CashoutOfferCard>

export const Default = () => (
  <CashoutOfferCard payload={cashoutOfferFixture} actions={storyActions()} />
)

export const Expired = () => (
  <CashoutOfferCard
    payload={{ ...cashoutOfferFixture, expiresAt: 0 }}
    actions={storyActions()}
  />
)

export const NoAuth = () => (
  <CashoutOfferCard
    payload={cashoutOfferFixture}
    actions={storyActions({
      can: { enabled: false, replyKey: "Assistant.authUnavailable" },
    })}
  />
)

export const BadPayload = () => (
  <CashoutOfferCard
    payload={{ ...cashoutOfferFixture, bankLabel: " " }}
    actions={storyActions()}
  />
)
