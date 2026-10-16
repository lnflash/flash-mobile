import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { ExpiredCard } from "./ExpiredCard"
import { expiredFixture } from "./fixtures"
import { storyActions } from "./story-actions"

export default {
  title: "Assistant / Expired card",
  component: ExpiredCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ExpiredCard>

export const Default = () => (
  <ExpiredCard payload={expiredFixture} actions={storyActions()} />
)

export const NoRefresh = () => <ExpiredCard payload={expiredFixture} actions={{}} />

export const BadPayload = () => (
  <ExpiredCard payload={{ type: "expired" }} actions={storyActions()} />
)
