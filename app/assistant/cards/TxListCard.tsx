import React from "react"

import { useI18nContext } from "@app/i18n/i18n-react"
import { CardError, CardFrame, CardNotice, validCardOf } from "./card-parts"

// The transactions a read tool found (spec §6), drawn from their ids only:
// the thread renders each one with the app's own transaction row, so the
// card never shows a figure of its own. The window line says what was
// searched, so a miss is never silent. The tool that fills this card is not
// part of ENG-688.

export const TxListCard: React.FC<{
  payload: unknown
  /** The app's transaction row for an id. */
  renderTransaction?: (txId: string) => React.ReactNode
}> = ({ payload, renderTransaction }) => {
  const { LL } = useI18nContext()
  const card = validCardOf(payload, "txList")
  if (!card) return <CardError />
  return (
    <CardFrame title={LL.AssistantCards.txListTitle()} testID="assistant-card-txlist">
      {renderTransaction
        ? card.txIds.map((txId) => (
            <React.Fragment key={txId}>{renderTransaction(txId)}</React.Fragment>
          ))
        : null}
      <CardNotice text={card.windowText} testID="assistant-card-window" />
    </CardFrame>
  )
}
