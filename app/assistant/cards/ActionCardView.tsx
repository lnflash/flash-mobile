import React from "react"

import type { CardActions } from "./card-actions"
import { CardError } from "./card-parts"
import { CashoutOfferCard } from "./CashoutOfferCard"
import { ClarificationCard } from "./ClarificationCard"
import { ConfirmPaymentCard } from "./ConfirmPaymentCard"
import { ExpiredCard } from "./ExpiredCard"
import { GroupSendSummaryCard } from "./GroupSendSummaryCard"
import { InvoiceCard } from "./InvoiceCard"
import { PrepareRefusedCard } from "./PrepareRefusedCard"
import { TxListCard } from "./TxListCard"
import { validateCard } from "./types"

// The card renderer (spec §6, §7.2): any card payload, validated at render
// time, drawn by its own component. It is generic over the card types and is
// not edited to add an intent. A payload that fails validation renders the
// templated error card.

export type ActionCardViewProps = {
  payload: unknown
  actions: CardActions
  /** A clarification's pick. */
  onPick?: (optionId: string) => void
  /** The app's transaction row, for a transaction list. */
  renderTransaction?: (txId: string) => React.ReactNode
}

export const ActionCardView: React.FC<ActionCardViewProps> = ({
  payload,
  actions,
  onPick,
  renderTransaction,
}) => {
  const validation = validateCard(payload)
  if (!validation.valid) {
    if (__DEV__) {
      console.warn(
        "[assistant] a card refused its payload",
        validation.path,
        validation.problem,
      )
    }
    return <CardError />
  }
  const { card } = validation
  switch (card.type) {
    case "confirmPayment":
      return <ConfirmPaymentCard payload={card} actions={actions} />
    case "invoice":
      return <InvoiceCard payload={card} />
    case "groupSendSummary":
      return <GroupSendSummaryCard payload={card} actions={actions} />
    case "txList":
      return <TxListCard payload={card} renderTransaction={renderTransaction} />
    case "clarification":
      return <ClarificationCard payload={card} onPick={onPick} />
    case "cashoutOffer":
      return <CashoutOfferCard payload={card} actions={actions} />
    case "expired":
      return <ExpiredCard payload={card} actions={actions} />
    case "prepareRefused":
      return <PrepareRefusedCard payload={card} />
  }
}
