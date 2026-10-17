import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { prepareRefusedFixture } from "./fixtures"
import { PrepareRefusedCard } from "./PrepareRefusedCard"

export default {
  title: "Assistant / Refused card",
  component: PrepareRefusedCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof PrepareRefusedCard>

export const Shortfall = () => <PrepareRefusedCard payload={prepareRefusedFixture} />

export const OverLimit = () => (
  <PrepareRefusedCard payload={{ ...prepareRefusedFixture, reason: "limitExceeded" }} />
)

export const NotAvailableYet = () => (
  <PrepareRefusedCard payload={{ ...prepareRefusedFixture, reason: "notAvailableYet" }} />
)

export const PayeeNotFound = () => (
  <PrepareRefusedCard payload={{ ...prepareRefusedFixture, reason: "payeeNotFound" }} />
)

export const BadPayload = () => (
  <PrepareRefusedCard payload={{ ...prepareRefusedFixture, reason: "tooRich" }} />
)
