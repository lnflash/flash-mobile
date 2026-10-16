import React from "react"
import moment from "moment"

import { useI18nContext } from "@app/i18n/i18n-react"
import type { CardActions } from "./card-actions"
import { CardError, CardFrame, CardNotice, CardRow, validCardOf } from "./card-parts"
import { ConfirmArea } from "./confirm-area"
import { ExpiredCardView } from "./ExpiredCard"
import type { CashoutOfferCard as CashoutOfferPayload } from "./types"
import { useConfirm } from "./use-confirm"
import { useExpired } from "./use-expired"

// A settlement offer (spec §5, §6), in the settle screen's own words. The
// offer is single use: after the first Confirm, whatever its outcome, the
// card never confirms again (decision 5); a failure means a new offer.

const CashoutOfferCardBody: React.FC<{
  card: CashoutOfferPayload
  actions: CardActions
}> = ({ card, actions }) => {
  const { LL } = useI18nContext()
  const expired = useExpired(card.expiresAt)
  const confirm = useConfirm(actions, card.preparedActionId, { singleUse: true })

  if (expired && !confirm.submitting && !confirm.after) {
    return (
      <ExpiredCardView
        preparedActionId={card.preparedActionId}
        reprepare={actions.reprepare}
      />
    )
  }
  return (
    <CardFrame title={LL.AssistantCards.settleTitle()} testID="assistant-card-cashout">
      <CardRow
        label={LL.Cashout.sendAmount()}
        value={card.amountText}
        testID="assistant-card-amount"
      />
      <CardRow
        label={LL.Cashout.fee()}
        value={card.feeText}
        testID="assistant-card-fee"
      />
      <CardRow
        label={LL.Cashout.receiveAmount()}
        value={card.receiveText}
        testID="assistant-card-receive"
      />
      <CardRow
        label={LL.Cashout.withdrawTo()}
        value={card.bankLabel}
        testID="assistant-card-bank"
      />
      <CardNotice
        text={LL.Cashout.valid({ time: moment(card.expiresAt).fromNow(true) })}
      />
      <ConfirmArea
        confirm={confirm}
        preparedActionId={card.preparedActionId}
        actions={actions}
        amountText={card.amountText}
      />
    </CardFrame>
  )
}

export const CashoutOfferCard: React.FC<{ payload: unknown; actions: CardActions }> = ({
  payload,
  actions,
}) => {
  const card = validCardOf(payload, "cashoutOffer")
  if (!card) return <CardError />
  return <CashoutOfferCardBody card={card} actions={actions} />
}
