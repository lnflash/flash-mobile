import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { groupSendFixture } from "./fixtures"
import { GroupSendSummaryCard } from "./GroupSendSummaryCard"
import { storyActions } from "./story-actions"

export default {
  title: "Assistant / Group send card",
  component: GroupSendSummaryCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof GroupSendSummaryCard>

export const Default = () => (
  <GroupSendSummaryCard payload={groupSendFixture} actions={storyActions()} />
)

export const Expired = () => (
  <GroupSendSummaryCard
    payload={{ ...groupSendFixture, expiresAt: 0 }}
    actions={storyActions()}
  />
)

export const NoAuth = () => (
  <GroupSendSummaryCard
    payload={groupSendFixture}
    actions={storyActions({
      can: { enabled: false, state: "armed", replyKey: "Assistant.authUnavailable" },
    })}
  />
)

export const BadPayload = () => (
  <GroupSendSummaryCard
    payload={{ ...groupSendFixture, legs: [] }}
    actions={storyActions()}
  />
)

export const PartlySent = () => (
  <GroupSendSummaryCard
    payload={{
      ...groupSendFixture,
      legs: [
        { ...groupSendFixture.legs[0], status: "success" },
        { ...groupSendFixture.legs[1], status: "failed" },
        { ...groupSendFixture.legs[2], status: "not_attempted" },
      ],
    }}
    actions={storyActions()}
  />
)
