import React from "react"

import { useI18nContext } from "@app/i18n/i18n-react"
import type { CardActions } from "./card-actions"
import { CardError, CardFrame, CardRow, validCardOf, walletName } from "./card-parts"
import { ConfirmArea } from "./confirm-area"
import { ExpiredCardView } from "./ExpiredCard"
import type { ConfirmPaymentCard as ConfirmPaymentCardPayload } from "./types"
import { useConfirm } from "./use-confirm"
import { useExpired } from "./use-expired"

// The money boundary (spec §6): one payment as prepareSend or
// prepareConversion prepared it. Every figure is the tool's own text; the
// payee's full username shows whenever the payee is a Flash user. Confirm
// calls executePreparedAction with this card's id and nothing else, and is
// disabled past expiresAt (the card becomes the expired card) or while the
// executor says it would not run (no way to authenticate a voice action).

const ConfirmPaymentCardBody: React.FC<{
  card: ConfirmPaymentCardPayload
  actions: CardActions
}> = ({ card, actions }) => {
  const { LL } = useI18nContext()
  const expired = useExpired(card.expiresAt)
  const confirm = useConfirm(actions, card.preparedActionId)

  // Past expiresAt Refresh replaces Confirm, but only for an action the
  // executor holds armed or no longer holds: never one whose payment may
  // have gone, whatever this card remembers (a remount remembers nothing).
  if (expired && confirm.mayExpire) {
    return (
      <ExpiredCardView
        preparedActionId={card.preparedActionId}
        reprepare={actions.reprepare}
      />
    )
  }
  return (
    <CardFrame title={LL.AssistantCards.confirmTitle()} testID="assistant-card-confirm">
      <CardRow
        label={LL.common.to()}
        value={card.toWallet ? walletName(LL, card.toWallet) : card.payeeLabel}
        detail={card.toWallet ? undefined : card.payeeUsername}
        testID="assistant-card-payee"
      />
      <CardRow
        label={LL.SendBitcoinScreen.amount()}
        value={card.amountText}
        testID="assistant-card-amount"
      />
      <CardRow label={LL.common.Fee()} value={card.feeText} testID="assistant-card-fee" />
      <CardRow
        label={LL.common.total()}
        value={card.totalText}
        testID="assistant-card-total"
      />
      {card.receiveText ? (
        <CardRow
          label={LL.AssistantCards.youReceive()}
          value={card.receiveText}
          testID="assistant-card-receive"
        />
      ) : null}
      <CardRow
        label={LL.AssistantCards.balanceAfter()}
        value={card.balanceAfterText}
        testID="assistant-card-balance-after"
      />
      <CardRow
        label={LL.common.from()}
        value={walletName(LL, card.sourceWallet)}
        testID="assistant-card-source"
      />
      {card.memo ? (
        <CardRow
          label={LL.common.note()}
          value={card.memo}
          testID="assistant-card-memo"
        />
      ) : null}
      <ConfirmArea
        confirm={confirm}
        preparedActionId={card.preparedActionId}
        actions={actions}
        amountText={card.totalText}
      />
    </CardFrame>
  )
}

export const ConfirmPaymentCard: React.FC<{ payload: unknown; actions: CardActions }> = ({
  payload,
  actions,
}) => {
  const card = validCardOf(payload, "confirmPayment")
  if (!card) return <CardError />
  return <ConfirmPaymentCardBody card={card} actions={actions} />
}
