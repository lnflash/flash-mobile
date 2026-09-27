import React, { useEffect } from "react"
import { Image, TouchableOpacity, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { Screen } from "@app/components/screen"
import { IconBtn } from "@app/components/buttons"
import HideableArea from "@app/components/hideable-area/hideable-area"
import { useHideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { CashuCardInfo } from "@app/utils/cashu-card"
import { testProps } from "@app/utils/testProps"

import FlashcardImage from "@app/assets/images/flashcard.png"
import Sync from "@app/assets/icons/sync.svg"

/**
 * Flashcard v2 — the Cashu NFC card (ENG-616).
 *
 * Everything shown here came off the card in the last tap and touches nothing
 * on it: balance, slot counts, PIN state, the card's public key. Top-up,
 * change-PIN and sweep arrive in their own PRs and hang off this screen.
 *
 * The balance is the card's own count of its unspent proofs. It is advisory —
 * the card cannot tell a proof the mint has already seen from one it hasn't —
 * so it is shown as a plain number in the unit the proofs were minted in, not
 * converted through the price feed like the BoltCard balance is.
 */
export const FlashcardV2Screen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCard, readFlashcard, resetFlashcard } = useFlashcard()
  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  // Same courtesy the BoltCard screen extends: a card read while signed out
  // is forgotten when the screen closes, so it never greets the next user.
  useEffect(() => {
    if (!isAuthed) {
      return navigation.addListener("beforeRemove", () => {
        resetFlashcard()
      })
    }
  }, [isAuthed, navigation, resetFlashcard])

  // Nothing to show without a card; the caller navigates here only after a
  // read, but "Remove card" from this very screen lands us here too.
  useEffect(() => {
    if (!cashuCard) navigation.goBack()
  }, [cashuCard, navigation])

  if (!cashuCard) return null

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <Image source={FlashcardImage} style={styles.flashcard} />
      <View style={styles.top} />

      <View style={styles.balanceWrapper}>
        <HideableArea isContentVisible={hideBalance}>
          <Text type="h03" {...testProps("flashcard-v2-balance")}>
            {cashuCard.balance.toLocaleString()}
          </Text>
          <TouchableOpacity
            style={styles.sync}
            onPress={() => readFlashcard(false)}
            {...testProps("flashcard-v2-refresh")}
          >
            <Sync color={colors.icon02} width={32} height={32} />
          </TouchableOpacity>
        </HideableArea>
      </View>
      <Text type="caption" style={styles.balanceCaption}>
        {LL.FlashcardV2.onCardBalance()}
      </Text>

      <PinStateNotice pinState={cashuCard.pinState} />

      <View style={styles.details}>
        <DetailRow label={LL.FlashcardV2.slots()} value={slotSummary(cashuCard, LL)} />
        <DetailRow
          label={LL.FlashcardV2.appletVersion()}
          value={`v${cashuCard.version}`}
        />
        <DetailRow
          label={LL.FlashcardV2.cardId()}
          value={shortPubkey(cashuCard.pubkey)}
          testID="flashcard-v2-card-id"
        />
      </View>

      {isAuthed && (
        <View style={styles.btns}>
          <IconBtn
            type="clear"
            icon="cardRemove"
            label={LL.CardScreen.removeCard()}
            onPress={resetFlashcard}
          />
        </View>
      )}

      <View style={styles.caption}>
        <Text type="bl" bold>
          {LL.CardScreen.keepYourCard()}
        </Text>
        <Text type="caption">{LL.FlashcardV2.bearerWarning()}</Text>
      </View>
    </Screen>
  )
}

/**
 * The PIN row doubles as the blocked-card dead end. There is no unblock path
 * on this applet (ENG-617), so a blocked card is told the truth: it has to be
 * replaced. Until ENG-615 ships, a card reporting "blocked" should also not be
 * trusted to keep refusing — the notice says to move the funds off it.
 */
const PinStateNotice: React.FC<{ pinState: CashuCardInfo["pinState"] }> = ({
  pinState,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  if (pinState === "set") return null

  const blocked = pinState === "blocked"
  return (
    <View
      style={[styles.notice, blocked ? styles.noticeBlocked : styles.noticeNoPin]}
      {...testProps(blocked ? "flashcard-v2-blocked" : "flashcard-v2-no-pin")}
    >
      <Text type="bl" bold>
        {blocked ? LL.FlashcardV2.blockedTitle() : LL.FlashcardV2.noPinTitle()}
      </Text>
      <Text type="caption">
        {blocked ? LL.FlashcardV2.blockedBody() : LL.FlashcardV2.noPinBody()}
      </Text>
    </View>
  )
}

const DetailRow: React.FC<{ label: string; value: string; testID?: string }> = ({
  label,
  value,
  testID,
}) => {
  const styles = useStyles()
  return (
    <View style={styles.row}>
      <Text type="p2">{label}</Text>
      <Text type="p2" bold {...(testID ? testProps(testID) : {})}>
        {value}
      </Text>
    </View>
  )
}

type LLType = ReturnType<typeof useI18nContext>["LL"]

const slotSummary = (card: CashuCardInfo, LL: LLType) =>
  LL.FlashcardV2.slotSummary({
    unspent: card.unspent,
    free: card.empty,
    max: card.maxSlots,
  })

/** First and last six hex chars of the 33-byte pubkey: enough to tell cards apart. */
export const shortPubkey = (pubkey: string) =>
  pubkey.length > 16 ? `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}` : pubkey

const useStyles = makeStyles(({ colors }) => ({
  top: {
    paddingTop: 210,
  },
  flashcard: {
    position: "absolute",
    alignSelf: "center",
    top: 10,
  },
  balanceWrapper: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
  balanceCaption: {
    textAlign: "center",
    color: colors.grey2,
  },
  sync: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  notice: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 20,
  },
  noticeNoPin: {
    borderColor: colors.warning,
    backgroundColor: colors.layer,
  },
  noticeBlocked: {
    borderColor: colors.error,
    backgroundColor: colors.layer,
  },
  details: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
    backgroundColor: colors.layer,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  btns: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  caption: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border01,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 15,
    backgroundColor: colors.layer,
  },
}))
