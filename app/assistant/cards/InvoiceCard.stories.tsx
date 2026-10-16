import React from "react"
import { Meta } from "@storybook/react"

import { StoryScreen } from "../../../.storybook/views"
import { invoiceFixture } from "./fixtures"
import { InvoiceCard } from "./InvoiceCard"

export default {
  title: "Assistant / Invoice card",
  component: InvoiceCard,
  decorators: [(Story) => <StoryScreen>{Story()}</StoryScreen>],
} as Meta<typeof InvoiceCard>

export const Lightning = () => (
  <InvoiceCard payload={{ ...invoiceFixture, expiresAt: Date.now() + 5 * 60_000 }} />
)

export const OnChain = () => (
  <InvoiceCard
    payload={{
      type: "invoice",
      paymentRequest: "BITCOIN:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ",
      shareText: "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      receiveWallet: "BTC",
      method: "onchain",
    }}
  />
)

export const Expired = () => <InvoiceCard payload={{ ...invoiceFixture, expiresAt: 0 }} />

export const BadPayload = () => (
  <InvoiceCard payload={{ ...invoiceFixture, method: "carrier pigeon" }} />
)
