import React from "react"

import { useI18nContext } from "@app/i18n/i18n-react"
import type { CardActions } from "./card-actions"
import { CardButton, CardError, CardFrame, CardNotice, validCardOf } from "./card-parts"

// The card a confirm card becomes once its numbers have gone stale: its
// Confirm became Refresh (spec §5, §6). Refresh prepares the action again,
// into a new card with new numbers; it never executes anything.

export const ExpiredCardView: React.FC<{
  preparedActionId: string
  reprepare?: CardActions["reprepare"]
}> = ({ preparedActionId, reprepare }) => {
  const { LL } = useI18nContext()
  return (
    <CardFrame title={LL.AssistantCards.expiredTitle()} testID="assistant-card-expired">
      <CardNotice text={LL.AssistantCards.expiredBody()} />
      <CardButton
        label={LL.AssistantCards.refresh()}
        disabled={!reprepare}
        onPress={() => reprepare?.(preparedActionId)}
        testID="assistant-card-refresh"
      />
    </CardFrame>
  )
}

export const ExpiredCard: React.FC<{
  payload: unknown
  actions: Pick<CardActions, "reprepare">
}> = ({ payload, actions }) => {
  const card = validCardOf(payload, "expired")
  if (!card) return <CardError />
  return (
    <ExpiredCardView
      preparedActionId={card.preparedActionId}
      reprepare={actions.reprepare}
    />
  )
}
