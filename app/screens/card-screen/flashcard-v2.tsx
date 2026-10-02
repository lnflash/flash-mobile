import React, { useEffect, useState } from "react"
import {
  AccessibilityInfo,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { Screen } from "@app/components/screen"
import { IconBtn } from "@app/components/buttons"
import { FlashcardV2Art, flashcardV2ArtSize } from "@app/components/flashcard-v2-art"
import HideableArea from "@app/components/hideable-area/hideable-area"
import type { CashuCardState } from "@app/contexts/Flashcard"
import { useHideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useFlashcard, useTapFlashcard, useUnfinishedTopUps } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { blockedPinGatesSpend, CashuCardInfo } from "@app/utils/cashu-card"
import { TopUpRecord, quoteIsDead } from "@app/utils/cashu-card-topup"

import Sync from "@app/assets/icons/sync.svg"

/**
 * Flashcard v2 — the Cashu NFC card (ENG-616).
 *
 * Everything shown here came off the card in the last tap and touches nothing
 * on it: balance, slot counts, PIN state, the card's public key. Top-up,
 * change-PIN and sweep arrive in their own PRs and hang off this screen.
 *
 * The balance is the card's own count of its unspent proofs, per unit. The
 * card stores no unit, so each figure carries the unit the mint names for its
 * keysets, or says the unit is unknown; it is never converted through the
 * price feed like the BoltCard balance is. It is also advisory: the card
 * cannot tell a proof the mint has already seen from one it hasn't.
 */
export const FlashcardV2Screen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { width: windowWidth } = useWindowDimensions()
  const art = flashcardV2ArtSize(windowWidth)
  const { cashuCard, forgetCashuCard } = useFlashcard()
  // Paid top-ups not on the card yet, and ones whose payment may still land.
  // A quote with no payment out (never sent, or refused) is not shown.
  const { records: savedTopUps, dismiss: dismissTopUp } = useUnfinishedTopUps(
    cashuCard?.pubkey,
  )
  const unfinishedTopUps = savedTopUps.filter(
    (record) => record.state !== "quoted" || record.payment.dispatched,
  )
  // Why a Dismiss was refused: its payment reached the mint, or still may.
  const [topUpNotice, setTopUpNotice] = useState<string>()
  useEffect(() => {
    if (topUpNotice && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(topUpNotice)
    }
  }, [topUpNotice])
  const tapFlashcard = useTapFlashcard()
  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  // Same courtesy the BoltCard screen extends: a card read while signed out
  // is forgotten when the screen closes, so it never greets the next user.
  useEffect(() => {
    if (!isAuthed) {
      return navigation.addListener("beforeRemove", () => {
        forgetCashuCard()
      })
    }
  }, [isAuthed, navigation, forgetCashuCard])

  // Nothing to show without a card; the caller navigates here only after a
  // read, but "Remove card" from this very screen lands us here too. Only
  // while focused: forgetting the card on the way out must not pop a second
  // screen.
  useEffect(() => {
    if (!cashuCard && navigation.isFocused()) navigation.goBack()
  }, [cashuCard, navigation])

  if (!cashuCard) return null

  const last4 = cardLast4(cashuCard.pubkey)

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      {/* The card as printed (Flash Card v2 "Bearer"), the art flash-pos
          draws. Its id is in the details below, so only a screen reader
          hears it here, masked as flash-pos masks it. */}
      <FlashcardV2Art
        width={art.width}
        style={styles.flashcard}
        accessibilityLabel={
          last4 ? LL.FlashcardV2.cardEnding({ last4 }) : LL.FlashcardV2.title()
        }
        testID="flashcard-v2-card-art"
      />
      {/* The card is drawn out of flow; this holds its place. */}
      <View
        style={{ paddingTop: CARD_TOP + art.height + CARD_GAP }}
        testID="flashcard-v2-card-space"
      />

      <View style={styles.balanceWrapper}>
        <HideableArea isContentVisible={hideBalance}>
          <View>
            {/* A plain testID: `testProps` would make a screen reader read
                the id instead of the amount. */}
            {balanceLines(cashuCard, LL).map(({ testID, text }) => (
              <Text key={testID} type="h03" testID={testID}>
                {text}
              </Text>
            ))}
          </View>
          <TouchableOpacity
            style={styles.sync}
            onPress={tapFlashcard}
            testID="flashcard-v2-refresh"
            accessibilityRole="button"
            accessibilityLabel={LL.CardScreen.readNfcCard()}
          >
            <Sync color={colors.icon02} width={32} height={32} />
          </TouchableOpacity>
        </HideableArea>
      </View>
      <Text type="caption" style={styles.balanceCaption}>
        {LL.FlashcardV2.onCardBalance()}
      </Text>

      {isAuthed && (
        <View style={styles.btns}>
          {/* Only a PIN state the app can read gets a PIN action: a blocked
              PIN has no way back (ENG-617), and an unknown one is a card this
              app does not understand (see the notice below). */}
          {(cashuCard.pinState === "unset" || cashuCard.pinState === "set") && (
            <IconBtn
              type="clear"
              icon="down"
              label={LL.FlashcardV2.topUp()}
              onPress={() => navigation.navigate("FlashcardV2TopUp")}
            />
          )}
          {(cashuCard.pinState === "unset" || cashuCard.pinState === "set") && (
            <IconBtn
              type="clear"
              icon="setting"
              label={
                cashuCard.pinState === "unset"
                  ? LL.FlashcardV2.setPin()
                  : LL.FlashcardV2.changePin()
              }
              onPress={() =>
                navigation.navigate("FlashcardV2Pin", {
                  mode: cashuCard.pinState === "unset" ? "set" : "change",
                })
              }
            />
          )}
          <IconBtn
            type="clear"
            icon="cardRemove"
            label={LL.CardScreen.removeCard()}
            onPress={forgetCashuCard}
          />
        </View>
      )}

      <PinStateNotice pinState={cashuCard.pinState} version={cashuCard.version} />

      {unfinishedTopUps.map((record) => {
        // A sent payment whose invoice expired long enough ago that nothing
        // can pay it now (by the quote's age, not the phone's clock against
        // the mint's): Dismiss asks the mint once more, and drops the top-up
        // only if it still holds the invoice unpaid. Only a quote: a paid
        // top-up is never offered for dropping, even one the mint no longer
        // issues (Finish says so).
        const expired = record.state === "quoted" && quoteIsDead(record, Date.now())
        return (
          <View
            key={record.id}
            style={styles.unfinished}
            testID="flashcard-v2-unfinished-topup"
          >
            <Text type="p2" style={styles.unfinishedText}>
              {unfinishedText(record, expired, LL)}
            </Text>
            {expired ? (
              <TouchableOpacity
                accessibilityRole="button"
                testID="flashcard-v2-dismiss-topup"
                onPress={() => {
                  setTopUpNotice(undefined)
                  // Refused, the list is read again (useUnfinishedTopUps).
                  dismissTopUp(record.id).catch(() =>
                    setTopUpNotice(LL.FlashcardV2.topUpDismissRefused()),
                  )
                }}
              >
                <Text type="p2" bold>
                  {LL.FlashcardV2.topUpDismiss()}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                accessibilityRole="button"
                testID="flashcard-v2-finish-topup"
                onPress={() =>
                  navigation.navigate("FlashcardV2TopUp", { topUpId: record.id })
                }
              >
                <Text type="p2" bold>
                  {LL.FlashcardV2.topUpFinish()}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      <View accessibilityLiveRegion="polite">
        {topUpNotice && (
          <Text
            type="p2"
            style={styles.unfinishedNotice}
            testID="flashcard-v2-topup-notice"
          >
            {topUpNotice}
          </Text>
        )}
      </View>

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

      <View style={styles.caption}>
        <Text type="bl" bold>
          {LL.CardScreen.keepYourCard()}
        </Text>
        <Text type="caption">{LL.FlashcardV2.bearerWarning()}</Text>
      </View>
    </Screen>
  )
}

type Notice = { testID: string; title: string; body: string; severe: boolean }

/**
 * What the card's PIN state means for whoever holds it, by applet version.
 * Both PIN states that look protective are keyed on whether the version is
 * confirmed to keep refusing spends once the PIN is blocked
 * (`blockedPinGatesSpend`). On v0.2.0 it is not (ENG-615): the third wrong
 * VERIFY_PIN blocks the PIN and a blocked PIN stops gating SPEND_PROOF, so a
 * set PIN won't stop whoever holds the card, and a blocked card spends for
 * anyone and cannot be unblocked (ENG-617). Nothing is said about a set PIN
 * only on a confirmed version. A state byte this app cannot decode is said to
 * be unknown, not guessed at.
 */
const PinStateNotice: React.FC<Pick<CashuCardInfo, "pinState" | "version">> = ({
  pinState,
  version,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  const notice = pinNotice(pinState, version, LL)
  if (!notice) return null

  // One element for a screen reader, labelled with the words on screen. A
  // plain testID, not `testProps`, which would label it with the id instead.
  return (
    <View
      style={[styles.notice, notice.severe ? styles.noticeSevere : styles.noticeWarning]}
      testID={notice.testID}
      accessible
      accessibilityLabel={`${notice.title}. ${notice.body}`}
    >
      <Text type="bl" bold>
        {notice.title}
      </Text>
      <Text type="caption">{notice.body}</Text>
    </View>
  )
}

const pinNotice = (
  pinState: CashuCardInfo["pinState"],
  version: string,
  LL: LLType,
): Notice | undefined => {
  switch (pinState) {
    case "set":
      // CashuApplet.java@v0.2.0:517-521 blocks the PIN on the third wrong
      // VERIFY_PIN, after which requirePinIfSet (:587-591) gates nothing.
      return blockedPinGatesSpend(version)
        ? undefined
        : {
            testID: "flashcard-v2-pin-bypassable",
            title: LL.FlashcardV2.pinSetBypassableTitle(),
            body: LL.FlashcardV2.pinSetBypassableBody(),
            severe: false,
          }
    case "unset":
      return {
        testID: "flashcard-v2-no-pin",
        title: LL.FlashcardV2.noPinTitle(),
        body: LL.FlashcardV2.noPinBody(),
        severe: false,
      }
    case "blocked":
      return blockedPinGatesSpend(version)
        ? {
            testID: "flashcard-v2-blocked",
            title: LL.FlashcardV2.blockedLockedTitle(),
            body: LL.FlashcardV2.blockedLockedBody(),
            severe: true,
          }
        : {
            testID: "flashcard-v2-blocked",
            title: LL.FlashcardV2.blockedOpenTitle(),
            body: LL.FlashcardV2.blockedOpenBody(),
            severe: true,
          }
    case "unknown":
      return {
        testID: "flashcard-v2-pin-unknown",
        title: LL.FlashcardV2.pinUnknownTitle(),
        body: LL.FlashcardV2.pinUnknownBody(),
        severe: false,
      }
  }
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
      <Text type="p2" bold testID={testID}>
        {value}
      </Text>
    </View>
  )
}

type LLType = ReturnType<typeof useI18nContext>["LL"]

const unfinishedText = (record: TopUpRecord, expired: boolean, LL: LLType): string => {
  const amount = formatUnitAmount(record.amount, record.unit, LL)
  if (record.state !== "quoted") return LL.FlashcardV2.topUpUnfinishedPaid({ amount })
  if (expired) return LL.FlashcardV2.topUpUnfinishedExpired({ amount })
  return LL.FlashcardV2.topUpUnfinishedUnpaid({ amount })
}

const slotSummary = (card: CashuCardInfo, LL: LLType) =>
  LL.FlashcardV2.slotSummary({
    unspent: card.unspent,
    free: card.empty,
    max: card.maxSlots,
  })

// en-US grouping, as the app's own money formatting uses (use-display-currency).
const grouped = new Intl.NumberFormat("en-US")
const cents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * An amount in its keyset unit's own terms, never converted through a price.
 * Slot amounts are in the keyset's base unit, "sats or cents"
 * (cashu-javacard spec/NUT-XX.md:86), so `sat` reads as sats and `usd` as
 * dollars and cents. The spec is silent on any other unit, so those show the
 * mint's number with the mint's unit code.
 */
export const formatUnitAmount = (amount: number, unit: string, LL: LLType): string => {
  switch (unit) {
    case "sat":
      return LL.FlashcardV2.amountInUnit({ amount: grouped.format(amount), unit: "sats" })
    case "usd":
      return LL.FlashcardV2.amountInUnit({
        amount: cents.format(amount / 100),
        unit: "USD",
      })
    default:
      return LL.FlashcardV2.amountInUnit({ amount: grouped.format(amount), unit })
  }
}

/**
 * The card's figures, one per unit the mint named. Until the mint has answered
 * (or when it could not be asked, or the tap lost the keyset split so there
 * was nothing to ask it) the card's own total is shown labelled "unit
 * unknown", never bare: GET_BALANCE adds every keyset together and the card
 * stores no unit. Value in a keyset the mint does not list is shown the same
 * way.
 */
export const balanceLines = (
  card: CashuCardState,
  LL: LLType,
): { testID: string; text: string }[] => {
  const unknown = (amount: number) => ({
    testID: "flashcard-v2-balance-unknown",
    text: LL.FlashcardV2.unitUnknown({ amount: grouped.format(amount) }),
  })
  // An empty card has nothing to name a unit for; no need to wait on the mint.
  // A split that was not read (`keysets` undefined) is not an empty one.
  const totals =
    card.unitTotals ??
    (card.balance === 0 && card.keysets?.length === 0
      ? { byUnit: [], unknown: 0 }
      : undefined)
  if (!totals) return [unknown(card.balance)]
  const lines = totals.byUnit.map(({ unit, amount }) => ({
    testID: `flashcard-v2-balance-${unit}`,
    text: formatUnitAmount(amount, unit, LL),
  }))
  if (totals.unknown > 0) lines.push(unknown(totals.unknown))
  if (lines.length === 0) {
    lines.push({ testID: "flashcard-v2-balance-empty", text: LL.FlashcardV2.empty() })
  }
  return lines
}

/** First eight and last six hex chars of the 33-byte pubkey: enough to tell cards apart. */
export const shortPubkey = (pubkey: string) =>
  pubkey.length > 16 ? `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}` : pubkey

/**
 * The last four hex digits of the card's pubkey, upper case: the card as
 * flash-pos masks it ("•••• 0C67", last4FromPubkey). Undefined for a key too
 * short to have them.
 */
export const cardLast4 = (pubkey: string): string | undefined => {
  const hex = pubkey.replace(/[^0-9a-f]/gi, "")
  return hex.length >= 4 ? hex.slice(-4).toUpperCase() : undefined
}

/** The card's offset from the top of the screen, and the room kept under it. */
const CARD_TOP = 10
const CARD_GAP = 16

const useStyles = makeStyles(({ colors }) => ({
  flashcard: {
    position: "absolute",
    alignSelf: "center",
    top: CARD_TOP,
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
  noticeWarning: {
    borderColor: colors.warning,
    backgroundColor: colors.layer,
  },
  noticeSevere: {
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
  unfinished: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.grey5,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  unfinishedText: {
    flex: 1,
  },
  unfinishedNotice: {
    marginHorizontal: 20,
    marginTop: 8,
    textAlign: "center",
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
