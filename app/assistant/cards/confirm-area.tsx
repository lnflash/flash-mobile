import React from "react"

import { useI18nContext } from "@app/i18n/i18n-react"
import type { CardActions } from "./card-actions"
import { CardButton, CardNotice, replyText } from "./card-parts"
import type { useConfirm } from "./use-confirm"

/**
 * The foot of a card that confirms: why Confirm is not available, or what
 * the last Confirm did; Confirm itself, announced with its amount; and,
 * only after a failure where nothing moved, Try again, which prepares the
 * action anew. After an outcome where money may have moved there is no Try
 * again: the card points to the history and stays disarmed. After a
 * Confirm blocked by a day-old dispatch the list cannot settle, it offers
 * "I checked my history", which says that tapping it sends (ENG-689).
 */
export const ConfirmArea: React.FC<{
  confirm: ReturnType<typeof useConfirm>
  preparedActionId: string
  actions: CardActions
  /** The amount Confirm is announced with. */
  amountText: string
  /** The button's label: Confirm, or Retry failed payments for a group. */
  label?: string
  testID?: string
}> = ({
  confirm,
  preparedActionId,
  actions,
  amountText,
  label,
  testID = "assistant-card-confirm-button",
}) => {
  const { LL } = useI18nContext()
  const { after, stateReply, canPress, submitting, state, done } = confirm

  if (done) {
    return <CardNotice text={LL.AssistantCards.legSent()} testID="assistant-card-done" />
  }
  // What this card's last Confirm did, or, with none to remember (before the
  // first, or after a remount), what the executor says about the action.
  const reply = after?.replyKey ?? stateReply
  const mayHaveMoved = state === "unresolved" || state === "disarmed"
  const offerConfirm = !after || after.confirmAgain
  const offerReprepare = after?.reprepare === true && actions.reprepare !== undefined
  return (
    <>
      {reply ? (
        <CardNotice
          text={replyText(LL, reply)}
          tone={after || mayHaveMoved ? "error" : "info"}
          testID="assistant-card-reply"
        />
      ) : null}
      {offerConfirm ? (
        <CardButton
          label={label ?? LL.common.confirm()}
          accessibilityLabel={LL.AssistantCards.confirmWithAmount({ amount: amountText })}
          disabled={!canPress}
          loading={submitting}
          onPress={confirm.confirm}
          testID={testID}
        />
      ) : null}
      {offerReprepare ? (
        <CardButton
          label={LL.common.tryAgain()}
          outline
          onPress={() => actions.reprepare?.(preparedActionId)}
          testID="assistant-card-reprepare"
        />
      ) : null}
      {after?.historyCheck ? (
        <>
          <CardNotice
            text={LL.AssistantCards.historyCheckedHint()}
            testID="assistant-card-history-hint"
          />
          <CardButton
            label={LL.AssistantCards.historyChecked()}
            accessibilityLabel={`${LL.AssistantCards.historyChecked()}. ${LL.AssistantCards.historyCheckedHint()}`}
            outline
            disabled={submitting}
            loading={submitting}
            onPress={confirm.confirmHistoryChecked}
            testID="assistant-card-history-checked"
          />
        </>
      ) : null}
    </>
  )
}
