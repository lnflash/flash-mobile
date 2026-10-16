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
 * again: the card points to the history and stays disarmed.
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
  const { after, blockedReply, canPress, submitting } = confirm

  if (after?.done) {
    return <CardNotice text={LL.AssistantCards.legSent()} testID="assistant-card-done" />
  }
  const reply = after?.replyKey ?? blockedReply
  const offerConfirm = !after || after.confirmAgain
  const offerReprepare = after?.reprepare === true && actions.reprepare !== undefined
  return (
    <>
      {reply ? (
        <CardNotice
          text={replyText(LL, reply)}
          tone={after ? "error" : "info"}
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
    </>
  )
}
