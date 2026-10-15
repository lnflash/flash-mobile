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
import { FlashcardV2Art, flashcardV2ArtWidth } from "@app/components/flashcard-v2-art"
import HideableArea from "@app/components/hideable-area/hideable-area"
import {
  CardOwnership,
  CashuCardPreview,
  CashuCardState,
  OwnerUnsettled,
  cardOwnership,
} from "@app/contexts/Flashcard"
import { useHideBalanceQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useFlashcard, useTapFlashcard, useUnfinishedTopUps } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { CardInfo } from "@app/utils/cashu-card"
import { balanceLines, formatUnitAmount } from "@app/utils/cashu-card-format"
import { TopUpRecord, isCurrentFormat, quoteIsDead } from "@app/utils/cashu-card-topup"
import { soleUnit } from "@app/utils/cashu-mint"

import { FlashcardV2Tidy } from "./flashcard-v2-tidy"

import Sync from "@app/assets/icons/sync.svg"

/**
 * Flashcard v2 — the Cashu NFC card (ENG-616).
 *
 * Everything shown here came off the card in the last tap and touches nothing
 * on it: balance, slot counts, PIN state, owner, the card's public key. The
 * actions hang off it (card protocol 2.0, ENG-675): a card with no owner is
 * set up first (this phone becomes its owner); a card this phone owns is
 * topped up with the owner's grant, and its PIN and limits are this phone's
 * to set; a card another phone owns is topped up with its PIN.
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
  const { cashuCard, cashuCardPreview, forgetCashuCard } = useFlashcard()
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
  // screen. A tap still verifying its card (ENG-707) keeps the screen up: the
  // read navigates here at GET_BALANCE, and pops it here if AUTH then fails.
  useEffect(() => {
    if (!cashuCard && !cashuCardPreview && navigation.isFocused()) navigation.goBack()
  }, [cashuCard, cashuCardPreview, navigation])

  // A tap that has the card's balance but not yet its proof (AUTH): only what
  // the card said, marked as verifying, with nothing to act on. It stands in
  // for a verified card on screen too, so a re-tap never shows card A's
  // actions next to card B's figure.
  if (cashuCardPreview) {
    return <FlashcardV2Verifying preview={cashuCardPreview} hideBalance={hideBalance} />
  }

  if (!cashuCard) return null

  const last4 = cardLast4(cashuCard.pubkey)
  // The card took this phone's key as its owner's (`ownerKeySource`); or it
  // refused it; or the read tap could not settle which (`cardOwnership`).
  const ownership = cardOwnership(cashuCard)
  const ownedHere = ownership === "mine"
  // A blocked PIN takes no load but the owner's: the grant needs no PIN.
  const canTopUp =
    cashuCard.hasOwner &&
    (cashuCard.pinState === "unset" ||
      cashuCard.pinState === "set" ||
      (cashuCard.pinState === "blocked" && ownedHere))

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      {/* The card as printed (Flash Card v2 "Bearer"), the art flash-pos
          draws. Its id is in the details below, so only a screen reader
          hears it here, masked as flash-pos masks it, one character at a
          time: read whole, "0C67" ends in "sixty-seven" and "BEEF" is a
          word. */}
      <FlashcardV2Art
        width={flashcardV2ArtWidth(windowWidth)}
        style={styles.flashcard}
        accessibilityLabel={
          last4
            ? LL.FlashcardV2.cardEnding({ last4: last4.split("").join(" ") })
            : LL.FlashcardV2.title()
        }
        testID="flashcard-v2-card-art"
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
        <View style={styles.btns} testID="flashcard-v2-actions">
          {/* A card with no owner takes no load (6A90): it is set up first. */}
          {!cashuCard.hasOwner && (
            <IconBtn
              type="clear"
              icon="lockOpen"
              label={LL.FlashcardV2.setUp()}
              onPress={() => navigation.navigate("FlashcardV2Setup")}
              testID="flashcard-v2-action-setup"
            />
          )}
          {canTopUp && (
            <IconBtn
              type="clear"
              icon="down"
              label={LL.FlashcardV2.topUp()}
              onPress={() => navigation.navigate("FlashcardV2TopUp")}
              testID="flashcard-v2-action-topup"
            />
          )}
          {/* The PIN is the owner's to set or change, blocked or not: no old
              PIN needed. An unknown PIN state is a card this app does not
              understand (see the notice below). */}
          {ownedHere && cashuCard.pinState !== "unknown" && (
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
              testID={
                cashuCard.pinState === "unset"
                  ? "flashcard-v2-action-set-pin"
                  : "flashcard-v2-action-change-pin"
              }
            />
          )}
          {ownedHere && (
            <IconBtn
              type="clear"
              icon="upDown"
              label={LL.FlashcardV2.limits()}
              onPress={() => navigation.navigate("FlashcardV2Limits")}
              testID="flashcard-v2-action-limits"
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

      <CardNotices card={cashuCard} ownership={ownership} />

      {/* The tidy (ENG-702): offered after an online read by the owner. */}
      {isAuthed && (
        <FlashcardV2Tidy
          card={cashuCard}
          formatAmount={(amount) =>
            formatUnitAmount(
              amount,
              (cashuCard.unitTotals && soleUnit(cashuCard.unitTotals)) ?? "sat",
              LL,
            )
          }
        />
      )}

      {unfinishedTopUps.map((record) => {
        // A sent payment whose invoice expired long enough ago that nothing
        // can pay it now (by the quote's age, not the phone's clock against
        // the mint's): Dismiss asks the mint once more, and drops the top-up
        // only if it still holds the invoice unpaid. Only a quote: a paid
        // top-up is never offered for dropping, even one the mint no longer
        // issues (Finish says so).
        const expired = record.state === "quoted" && quoteIsDead(record, Date.now())
        // A 0.x card's top-up: kept on this phone for a human, with nothing
        // to finish or dismiss here.
        const oldFormat = !isCurrentFormat(record)
        return (
          <View
            key={record.id}
            style={styles.unfinished}
            testID="flashcard-v2-unfinished-topup"
          >
            <Text type="p2" style={styles.unfinishedText}>
              {oldFormat
                ? LL.FlashcardV2.topUpUnfinishedNeedsUpdate({
                    amount: formatUnitAmount(record.amount, record.unit, LL),
                  })
                : unfinishedText(record, expired, LL)}
            </Text>
            {oldFormat ? null : expired ? (
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
        {cashuCard.spent > 0 && (
          <Text type="caption" testID="flashcard-v2-slots-spent-note">
            {LL.FlashcardV2.slotsSpentNote()}
          </Text>
        )}
        <DetailRow
          label={LL.FlashcardV2.ownerRow()}
          value={ownerText(ownership, cashuCard.ownerUnsettled, LL)}
          testID="flashcard-v2-owner"
        />
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

/**
 * The card as a read tap saw it before AUTH (ENG-707): its art, its balance
 * and its details, said to be verifying. Nothing here can be acted on: no
 * action, no refresh, no tidy, no top-up to finish. No notice and no owner
 * either: whose card it is is settled only after AUTH (`tendCard`), so until
 * then an owner's own card would read "Another phone".
 */
const FlashcardV2Verifying: React.FC<{
  preview: CashuCardPreview
  hideBalance: boolean
}> = ({ preview, hideBalance }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { width: windowWidth } = useWindowDimensions()
  const last4 = cardLast4(preview.pubkey)
  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <FlashcardV2Art
        width={flashcardV2ArtWidth(windowWidth)}
        style={styles.flashcard}
        accessibilityLabel={
          last4
            ? LL.FlashcardV2.cardEnding({ last4: last4.split("").join(" ") })
            : LL.FlashcardV2.title()
        }
        testID="flashcard-v2-card-art"
      />

      <View style={styles.balanceWrapper}>
        <HideableArea isContentVisible={hideBalance}>
          <View>
            {/* Ids of their own: the e2e flows wait on flashcard-v2-balance-*
                for the verified figure, never this one. */}
            {balanceLines(preview, LL).map(({ testID, text }) => (
              <Text
                key={testID}
                type="h03"
                testID={testID.replace(
                  "flashcard-v2-balance",
                  "flashcard-v2-preview-balance",
                )}
              >
                {text}
              </Text>
            ))}
          </View>
        </HideableArea>
      </View>
      <View accessibilityLiveRegion="polite">
        <Text
          type="caption"
          style={styles.balanceCaption}
          testID="flashcard-v2-preview-verifying"
        >
          {LL.FlashcardV2.verifying()}
        </Text>
      </View>

      <View style={styles.details}>
        <DetailRow label={LL.FlashcardV2.slots()} value={slotSummary(preview, LL)} />
        <DetailRow label={LL.FlashcardV2.appletVersion()} value={`v${preview.version}`} />
        <DetailRow
          label={LL.FlashcardV2.cardId()}
          value={shortPubkey(preview.pubkey)}
          testID="flashcard-v2-preview-card-id"
        />
      </View>
    </Screen>
  )
}

type Notice = { testID: string; title: string; body: string; severe: boolean }

/**
 * What the card's state means for whoever holds it (card protocol 2.0): a card
 * not set up yet, its PIN (none, blocked, or one this app cannot read), and a
 * clock that has run out of days to count on its own. A set PIN needs no
 * notice: on 2.0 three wrong entries block it, and only the owner unblocks it.
 */
const CardNotices: React.FC<{ card: CashuCardState; ownership: CardOwnership }> = ({
  card,
  ownership,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  const notices = cardNotices(card, ownership, LL)
  if (notices.length === 0) return null

  // One element per notice for a screen reader, labelled with the words on
  // screen. A plain testID, not `testProps`, which would label it with the id.
  return (
    <>
      {notices.map((notice) => (
        <View
          key={notice.testID}
          style={[
            styles.notice,
            notice.severe ? styles.noticeSevere : styles.noticeWarning,
          ]}
          testID={notice.testID}
          accessible
          accessibilityLabel={`${notice.title}. ${notice.body}`}
        >
          <Text type="bl" bold>
            {notice.title}
          </Text>
          <Text type="caption">{notice.body}</Text>
        </View>
      ))}
    </>
  )
}

/**
 * The notices for `card`, as `ownership` says whose it is. Only a card this
 * phone knows to be another's (`other`: it refused this phone's proof, or this
 * phone holds no key for it) is told to find the owner's phone. A card whose
 * owner the read could not settle (`unknown`) may well be this phone's, so it
 * gets the owner's copy for a refresh (decision 16), and a neutral one for a
 * blocked PIN, since this phone offers no new PIN until it is settled.
 */
export const cardNotices = (
  card: Pick<CashuCardState, "hasOwner" | "pinState" | "record" | "locked">,
  ownership: CardOwnership,
  LL: LLType,
): Notice[] => {
  const notices: Notice[] = []
  if (!card.hasOwner) {
    notices.push({
      testID: "flashcard-v2-not-set-up",
      title: LL.FlashcardV2.notSetUpTitle(),
      body: LL.FlashcardV2.notSetUpBody(),
      severe: false,
    })
  }
  switch (card.pinState) {
    case "unset":
      notices.push({
        testID: "flashcard-v2-no-pin",
        title: LL.FlashcardV2.noPinTitle(),
        body: LL.FlashcardV2.noPinBody(),
        severe: false,
      })
      break
    case "blocked":
      notices.push({
        testID: "flashcard-v2-blocked",
        title: LL.FlashcardV2.blockedTitle(),
        // A locked card refuses every PIN change (cashu-javacard
        // spec/APDU.md, CHANGE_PIN 6986 and LOCK_CARD): no one can unblock it.
        body: card.locked
          ? LL.FlashcardV2.blockedLockedBody()
          : blockedBody(ownership, LL),
        severe: true,
      })
      break
    case "unknown":
      notices.push({
        testID: "flashcard-v2-pin-unknown",
        title: LL.FlashcardV2.pinUnknownTitle(),
        body: LL.FlashcardV2.pinUnknownBody(),
        severe: false,
      })
      break
    case "set":
      break
  }
  // The day's window has rolled as often as its owner allows between
  // refreshes: the card's limits stay where they are until its owner's phone,
  // online, refreshes it at a tap (decision 16). Only the owner's phone sends
  // REFRESH (`tendCard`), so only a phone that may be the owner's is told to
  // tap; a phone the card refused is told whose phone can (the spec is silent
  // on what other phones show).
  if (card.hasOwner && card.record && card.record.rolls >= card.record.rollBudget) {
    notices.push({
      testID: "flashcard-v2-refresh-needed",
      title: LL.FlashcardV2.refreshNeededTitle(),
      body:
        ownership === "other"
          ? LL.FlashcardV2.refreshNeededOtherBody()
          : LL.FlashcardV2.refreshNeededBody(),
      severe: false,
    })
  }
  return notices
}

const blockedBody = (ownership: CardOwnership, LL: LLType): string => {
  switch (ownership) {
    case "other":
      return LL.FlashcardV2.blockedOtherBody()
    case "unknown":
      return LL.FlashcardV2.blockedUnconfirmedBody()
    default:
      return LL.FlashcardV2.blockedOwnerBody()
  }
}

/**
 * Who owns the card, as the details say it. "Another phone" only once the
 * card refused this phone's proof (`6A91`, `6A90`) or this phone holds no key
 * for it: a tap that could not settle it says so instead, and asks for another
 * tap only when one can settle it (`failed`), not on a locked card that was
 * not asked (`locked`).
 */
export const ownerText = (
  ownership: CardOwnership,
  unsettled: OwnerUnsettled | undefined,
  LL: LLType,
): string => {
  switch (ownership) {
    case "none":
      return LL.FlashcardV2.ownerNone()
    case "mine":
      return LL.FlashcardV2.ownerThisPhone()
    case "other":
      return LL.FlashcardV2.ownerOther()
    case "unknown":
      return unsettled === "locked"
        ? LL.FlashcardV2.ownerUnconfirmedLocked()
        : LL.FlashcardV2.ownerUnconfirmed()
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

const slotSummary = (
  card: Pick<CardInfo, "unspent" | "spent" | "empty" | "maxSlots">,
  LL: LLType,
) =>
  LL.FlashcardV2.slotSummary({
    unspent: card.unspent,
    spent: card.spent,
    free: card.empty,
    max: card.maxSlots,
  })

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

const useStyles = makeStyles(({ colors }) => ({
  // In flow, 10 dp down, with the balance 16 dp under it: this margin is the
  // only room kept between the two.
  flashcard: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  balanceWrapper: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    // Four actions (Top up, Change PIN, Limits, Remove card) are 384pt
    // at IconBtn's 96pt each: wider than a 360dp phone, so a fourth wraps.
    flexWrap: "wrap",
    rowGap: 8,
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
