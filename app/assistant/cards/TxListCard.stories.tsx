import React from "react"
import { Text } from "react-native"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { txListFixture } from "./fixtures"
import { TxListCard } from "./TxListCard"

export default {
  title: "Assistant / Transaction list card",
  component: TxListCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof TxListCard>

// The thread draws each row with the app's own transaction row; a story has
// no transactions to look up, so it names the ids.
export const Default = () => (
  <TxListCard
    payload={txListFixture}
    renderTransaction={(txId) => <Text>{`Transaction ${txId}`}</Text>}
  />
)

export const BadPayload = () => (
  <TxListCard payload={{ ...txListFixture, txIds: "tx-1" }} />
)
