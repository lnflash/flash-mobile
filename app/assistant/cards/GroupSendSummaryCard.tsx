import React from "react"
import { View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

import type { TranslationFunctions } from "@app/i18n/i18n-types"
import { useI18nContext } from "@app/i18n/i18n-react"
import type { CardActions } from "./card-actions"
import { CardError, CardFrame, CardRow, validCardOf, walletName } from "./card-parts"
import { ConfirmArea } from "./confirm-area"
import { ExpiredCardView } from "./ExpiredCard"
import type {
  GroupSendLeg,
  GroupSendSummaryCard as GroupSendPayload,
  LegStatus,
} from "./types"
import { useConfirm } from "./use-confirm"
import { useExpired } from "./use-expired"

// A group send (spec §5, §6): every leg, its full username, its share and
// its real status, never one left out. Before the first Confirm every leg is
// ready; after a run that stopped part way, the button retries the legs that
// did not go (the executor keeps a group that sent anything from being
// prepared again).

const statusText = (LL: TranslationFunctions, status: LegStatus): string => {
  switch (status) {
    case "pending":
      return LL.AssistantCards.legReady()
    case "success":
      return LL.AssistantCards.legSent()
    case "failed":
      return LL.AssistantCards.legFailed()
    case "not_attempted":
      return LL.AssistantCards.legNotSent()
    case "unknown":
      return LL.AssistantCards.legCheckHistory()
  }
}

const LegRow: React.FC<{ leg: GroupSendLeg; index: number }> = ({ leg, index }) => {
  const { LL } = useI18nContext()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const status = statusText(LL, leg.status)
  const statusColor =
    leg.status === "failed" || leg.status === "unknown" ? colors.error : colors.grey1
  return (
    <View
      style={styles.leg}
      accessible
      accessibilityLabel={`${leg.payeeLabel}, ${leg.payeeUsername}, ${leg.amountText}, ${status}`}
      testID={`assistant-card-leg-${index}`}
    >
      <View style={styles.legPayee}>
        <Text type="p2" bold>
          {leg.payeeLabel}
        </Text>
        <Text type="p3" color={colors.grey1}>
          {leg.payeeUsername}
        </Text>
      </View>
      <View style={styles.legAmount}>
        <Text type="p2" bold style={styles.right}>
          {leg.amountText}
        </Text>
        <Text type="p3" color={statusColor} style={styles.right}>
          {status}
        </Text>
      </View>
    </View>
  )
}

const GroupSendSummaryCardBody: React.FC<{
  card: GroupSendPayload
  actions: CardActions
}> = ({ card, actions }) => {
  const { LL } = useI18nContext()
  const expired = useExpired(card.expiresAt)
  const confirm = useConfirm(actions, card.preparedActionId)
  const started = card.legs.some(({ status }) => status !== "pending")
  const allSent = card.legs.every(({ status }) => status === "success")

  if (expired && !started && !confirm.submitting && !confirm.after) {
    return (
      <ExpiredCardView
        preparedActionId={card.preparedActionId}
        reprepare={actions.reprepare}
      />
    )
  }
  return (
    <CardFrame title={LL.AssistantCards.groupTitle()} testID="assistant-card-group">
      {card.legs.map((leg, index) => (
        <LegRow key={`${leg.payeeUsername}-${index}`} leg={leg} index={index} />
      ))}
      <CardRow
        label={LL.common.total()}
        value={card.totalText}
        testID="assistant-card-total"
      />
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
      {allSent ? null : (
        <ConfirmArea
          confirm={confirm}
          preparedActionId={card.preparedActionId}
          actions={actions}
          amountText={card.totalText}
          label={started ? LL.AssistantCards.retryFailed() : undefined}
        />
      )}
    </CardFrame>
  )
}

export const GroupSendSummaryCard: React.FC<{
  payload: unknown
  actions: CardActions
}> = ({ payload, actions }) => {
  const card = validCardOf(payload, "groupSendSummary")
  if (!card) return <CardError />
  return <GroupSendSummaryCardBody card={card} actions={actions} />
}

const useStyles = makeStyles(() => ({
  leg: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  legPayee: {
    flexShrink: 1,
    marginRight: 12,
  },
  legAmount: {
    flexShrink: 1,
    alignItems: "flex-end",
  },
  right: {
    textAlign: "right",
  },
}))
