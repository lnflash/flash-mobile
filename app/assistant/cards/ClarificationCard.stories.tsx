import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { ClarificationCard } from "./ClarificationCard"
import { clarificationFixture, flashUserClarificationFixture } from "./fixtures"

export default {
  title: "Assistant / Clarification card",
  component: ClarificationCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof ClarificationCard>

export const PickContact = () => (
  <ClarificationCard payload={clarificationFixture} onPick={() => undefined} />
)

// A payee question always has an option to pick (ENG-730): a Flash user who
// is not a contact is offered alone, and no one by that name is the refused
// card's payeeNotFound story.
export const PickFlashUser = () => (
  <ClarificationCard payload={flashUserClarificationFixture} onPick={() => undefined} />
)

export const BadPayload = () => (
  <ClarificationCard payload={{ ...clarificationFixture, prompt: "Pay mallory" }} />
)
