import React from "react"

import { useI18nContext } from "@app/i18n/i18n-react"
import { PREPARE_REFUSAL_REPLY } from "../registry/refusals"
import { CardAlert, CardError, replyText, validCardOf } from "./card-parts"

// The templated error card for an action whose prepare refused it (spec
// §5.1, "Affordability before a card"): the wallet is short, the payment is
// over a limit, or its branch is gated on an open bug (notAvailableYet). It
// says the refusal's own reply, through LL, and offers nothing: no confirm
// card was ever made, so there is nothing to confirm.

export const PrepareRefusedCard: React.FC<{ payload: unknown }> = ({ payload }) => {
  const { LL } = useI18nContext()
  const card = validCardOf(payload, "prepareRefused")
  if (!card) return <CardError />
  return (
    <CardAlert
      text={replyText(LL, PREPARE_REFUSAL_REPLY[card.reason])}
      testID="assistant-card-refused"
    />
  )
}
