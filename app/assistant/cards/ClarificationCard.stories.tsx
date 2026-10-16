import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { ClarificationCard } from "./ClarificationCard"
import { clarificationFixture } from "./fixtures"

export default {
  title: "Assistant / Clarification card",
  component: ClarificationCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ClarificationCard>

export const PickContact = () => (
  <ClarificationCard payload={clarificationFixture} onPick={() => undefined} />
)

export const NoMatch = () => (
  <ClarificationCard
    payload={{ type: "clarification", prompt: "Assistant.noContactMatch", options: [] }}
  />
)

export const BadPayload = () => (
  <ClarificationCard payload={{ ...clarificationFixture, prompt: "Pay mallory" }} />
)
