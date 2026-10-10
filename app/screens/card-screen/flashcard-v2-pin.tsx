import React, { useEffect, useState } from "react"
import { AccessibilityInfo, Platform, View } from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { PinPad } from "@app/components/card/PinPad"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  AppletNotSelectedError,
  CardError,
  CardInfo,
  PIN_MAX_LENGTH,
  WrongCardError,
  blockedPinGatesSpend,
  changeCardPin,
  clearCardPin,
  isValidCardPin,
  setCardPin,
  triesLeft,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { toastShow } from "@app/utils/toast"

/** `remove` is the confirmation step of the remove flow: no digits, one button. */
type Step = "current" | "new" | "confirm" | "remove"

type PinMode = RootStackParamList["FlashcardV2Pin"]["mode"]

/** The steps of each flow, in order: the last one is the step the tap runs from. */
const STEPS: Record<PinMode, Step[]> = {
  set: ["new", "confirm"],
  change: ["current", "new", "confirm"],
  remove: ["current", "remove"],
}

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** A status word as the log shows it, e.g. "6F00". */
const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

/** SET_PIN's answer on a card that already has a PIN (spec/APDU.md, SET_PIN). */
const SW_PIN_ALREADY_SET = 0x6985
/** VERIFY_PIN's answer on a card with no PIN (spec/APDU.md, VERIFY_PIN). */
const SW_NO_PIN_SET = 0x6984

/** What one tap told the screen besides what it threw. Filled in while the tap runs. */
type TapReport = {
  /**
   * VERIFY_PIN or SET_PIN reached the wire. Until then no PIN from this tap
   * has reached the card, so a failure leaves every PIN typed standing.
   */
  pinSent: boolean
  /**
   * SET_PIN, CHANGE_PIN or CLEAR_PIN reached the wire: a tap lost after this
   * may or may not have left the new PIN state on the card.
   */
  pinWriteSent: boolean
  /**
   * SET_PIN answered 6985 to the PIN an earlier, cut-short SET_PIN carried:
   * the card saved that one before the earlier tap lost its answer.
   */
  earlierSetLanded: boolean
  /**
   * VERIFY_PIN answered 6984 (no PIN) after an earlier, cut-short CLEAR_PIN:
   * the card removed the PIN before that tap lost its answer.
   */
  earlierClearLanded: boolean
  /** What GET_INFO said when the card was re-read after the operation. */
  after?: CardInfo
}

type Failure = {
  message: string
  /**
   * The PIN is blocked: nothing more can be tried here, and the card screen,
   * re-read after the refusal, shows what that means for this card.
   */
  final?: boolean
  /**
   * The PINs typed so far still stand, so only the confirmation is retyped.
   * Otherwise the flow starts again from its first step.
   */
  keepPins?: boolean
  /** SET_PIN went out and its answer was lost: the card may already hold the new PIN. */
  setInDoubt?: boolean
  /** CLEAR_PIN went out and its answer was lost: the card may already have no PIN. */
  clearInDoubt?: boolean
}

/**
 * Set, change or remove the Cashu card's PIN (ENG-616, ENG-633).
 *
 * The PINs live in this screen's state and nowhere else: not in the store,
 * not in a log. Everything the card does with them happens inside one tap at
 * the end — VERIFY_PIN then CHANGE_PIN in the same session, VERIFY_PIN then
 * CLEAR_PIN to remove it (applet 0.5, offered only on a card whose
 * `clearPin` capability is set), or SET_PIN alone on a card that has none
 * yet. Verifying first matters on v0.2.0 firmware:
 * CHANGE_PIN's own failed checks burn tries without ever marking the PIN
 * blocked, which would freeze the card for its owner too. A wrong current PIN
 * costs one of the card's three tries and the screen says how many are left.
 * What a blocked PIN does depends on the firmware (`blockedPinGatesSpend`): it
 * blocks the card for good (no unblock path exists: ENG-617), or on v0.2.0 it
 * switches the PIN check off (ENG-615), and the copy says which. A blocked PIN
 * ends the flow: the screen goes back to the card, which the refusal's re-read
 * has already updated.
 *
 * A tap that fails before any PIN reaches the card (a different card, a tag
 * without the applet, a tap lost before VERIFY_PIN or SET_PIN) keeps the PINs:
 * only the confirmation is retyped. SET_PIN saves the PIN before it answers
 * (CashuApplet.java@v0.2.0:538-539; 0.3: 574-575), so a tap lost after it went
 * out keeps the new PIN too, and says the card may already use it. Tapping
 * again with that PIN finishes the job either way: a card that already has it
 * answers 6985, which here means the earlier write landed. CLEAR_PIN writes
 * its one byte atomically, so a tap lost after it went out left the PIN set
 * or gone: tapping again settles it, and a 6984 from VERIFY_PIN then means
 * the earlier clear landed.
 */
export const FlashcardV2PinScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { params } = useRoute<RouteProp<RootStackParamList, "FlashcardV2Pin">>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCard, runCardOperation } = useFlashcard()
  // Whether three wrong entries freeze this card or switch its PIN off.
  const blockFreezes = cashuCard ? blockedPinGatesSpend(cashuCard.version) : false
  // Whether this card answers CLEAR_PIN: the set-PIN warning says so.
  const removable = cashuCard?.clearPin ?? false

  const steps = STEPS[params.mode]
  // The step the tap runs from: a failure that keeps the PINs returns here.
  const lastStep = steps.length - 1
  const [stepIndex, setStepIndex] = useState(0)
  const [entry, setEntry] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  // Set once the card has settled the flow with no retry left (the last try):
  // the message stays on this screen and Close returns to the card screen.
  const [finished, setFinished] = useState(false)
  // Each PIN a cut-short tap sent with SET_PIN: the card may hold any one of
  // them. Kept only while this screen is open, like the PINs themselves.
  const [unansweredSetPins, setUnansweredSetPins] = useState<string[]>([])
  // A cut-short tap sent CLEAR_PIN: the card may already have no PIN.
  const [unansweredClear, setUnansweredClear] = useState(false)

  // iOS has no live regions (the status area below is one on Android), so an
  // error is read out as it appears.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  const step = steps[stepIndex]
  const canContinue = step === "remove" ? !busy : isValidCardPin(entry) && !busy

  const onDigit = (d: string) => {
    setError(undefined)
    setEntry((e) => (e.length < PIN_MAX_LENGTH ? e + d : e))
  }

  const advance = () => {
    if (step === "remove") {
      apply()
      return
    }
    if (step === "current") {
      setCurrent(entry)
    } else if (step === "new") {
      if (params.mode === "change" && entry === current) {
        setError(LL.FlashcardV2.pinSameAsCurrent())
        setEntry("")
        return
      }
      setNext(entry)
    } else if (entry !== next) {
      // Back to "new": a mismatch means one of the two was mistyped.
      setError(LL.FlashcardV2.pinMismatch())
      setEntry("")
      setStepIndex(steps.indexOf("new"))
      return
    }
    setEntry("")
    if (step === "confirm") {
      apply()
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  const apply = async () => {
    if (!cashuCard) return
    setBusy(true)
    setError(undefined)
    const tap: TapReport = {
      pinSent: false,
      pinWriteSent: false,
      earlierSetLanded: false,
      earlierClearLanded: false,
    }
    // When `next` is the only PIN a cut-short SET_PIN carried, a 6985 to it
    // means the card holds it: the card was read with no PIN, and nothing
    // else on this screen writes one.
    const onlyUnansweredSet =
      unansweredSetPins.length === 1 && unansweredSetPins[0] === next
    try {
      await runCardOperation(
        async (transceive) => {
          if (params.mode === "set") {
            tap.pinSent = true
            tap.pinWriteSent = true
            try {
              await setCardPin(transceive, next)
            } catch (err) {
              // A 6985 here means the earlier write landed. Returning makes
              // this tap a success, so the provider re-reads the card, or
              // applies `assume` when the card leaves first, and the card
              // screen offers Change PIN.
              if (
                err instanceof CardError &&
                err.sw === SW_PIN_ALREADY_SET &&
                onlyUnansweredSet
              ) {
                tap.earlierSetLanded = true
                return
              }
              throw err
            }
          } else if (params.mode === "remove") {
            tap.pinSent = true
            try {
              await verifyCardPin(transceive, current)
            } catch (err) {
              // A 6984 here, after a tap cut short on CLEAR_PIN, means that
              // clear landed: the card had a PIN when it was read, and
              // nothing else on this screen removes one. Returning makes
              // this tap a success, so the provider re-reads the card.
              if (
                err instanceof CardError &&
                err.sw === SW_NO_PIN_SET &&
                unansweredClear
              ) {
                tap.earlierClearLanded = true
                return
              }
              throw err
            }
            tap.pinWriteSent = true
            await clearCardPin(transceive, current)
          } else {
            tap.pinSent = true
            await verifyCardPin(transceive, current)
            tap.pinWriteSent = true
            await changeCardPin(transceive, current, next)
          }
        },
        cashuCard.pubkey,
        {
          // A 9000 to SET_PIN or CHANGE_PIN, or the 6985 above, leaves the
          // card with a PIN set; a 9000 to CLEAR_PIN, or the 6984 above,
          // leaves it with none. Either way, whether or not the card stays
          // in the field for the re-read.
          assume: { pinState: params.mode === "remove" ? "unset" : "set" },
          onReread: (info) => {
            tap.after = info
          },
        },
      )
      const message = successMessage(params.mode, tap, LL)
      toastShow({ position: "top", type: "success", message })
      // A toast is not announced, and this screen is about to go.
      AccessibilityInfo.announceForAccessibility(message)
      navigation.goBack()
    } catch (err) {
      // Cancelling the sheet before any PIN reached the card is the holder's
      // choice, not a failure: no error, and only the confirmation to retype
      // (flash-pos treats a cancel the same way: isUserCancel,
      // docs/13-cashu-card.md). A cancel that cuts off a PIN command is a
      // lost answer like any other, below.
      if (err instanceof NfcError.UserCancel && !tap.pinSent) {
        setError(undefined)
        setStepIndex(lastStep)
        return
      }
      const failure = describeFailure(
        err,
        { ...tap, mode: params.mode, cardVersion: cashuCard.version },
        LL,
      )
      if (failure.final) {
        // End the flow here, not in a toast: a toast shows two ellipsized
        // lines, and this message's last sentence (what the card now does,
        // and what to do about it) is the one that matters. The status area
        // announces it (a live region on Android, the effect above on iOS).
        setError(failure.message)
        setFinished(true)
        return
      }
      if (failure.setInDoubt) {
        setUnansweredSetPins((pins) => (pins.includes(next) ? pins : [...pins, next]))
      }
      if (failure.clearInDoubt) setUnansweredClear(true)
      setError(failure.message)
      // The last step alone while the PINs typed still stand. Otherwise the
      // first step: the current PIN was wrong, the card refused the PIN, or
      // a lost answer leaves which PIN is current in doubt.
      setStepIndex(failure.keepPins ? lastStep : 0)
    } finally {
      setBusy(false)
    }
  }

  const title = {
    current: LL.FlashcardV2.currentPin(),
    new: LL.FlashcardV2.newPin(),
    confirm: LL.FlashcardV2.confirmPin(),
    // Its own words: the navigator header above already says "Remove card PIN".
    remove: LL.FlashcardV2.removePinStep(),
  }[step]
  // The remove step takes no digits: it says what a card with no PIN is and
  // carries the one button that taps.
  const confirmingRemove = step === "remove" && !finished

  // Plain testIDs below: `testProps` would label each element with its id, so
  // a screen reader would say "pin-error" instead of the error.
  return (
    <Screen backgroundColor={colors.background}>
      <View style={styles.header}>
        <Text type="h02" testID="pin-step-title" accessibilityRole="header">
          {title}
        </Text>
        {confirmingRemove && (
          <View style={styles.body} testID="pin-remove-confirm">
            <Text type="p2" style={styles.bodyText}>
              {LL.FlashcardV2.removePinBody()}
            </Text>
            <Text type="p2" bold style={styles.bodyText}>
              {LL.FlashcardV2.noPinBody()}
            </Text>
          </View>
        )}
        {!finished && step !== "remove" && (
          <>
            <Text type="caption">{LL.FlashcardV2.pinLength()}</Text>
            <Text
              type="h01"
              style={styles.dots}
              testID="pin-entry"
              accessibilityLabel={LL.FlashcardV2.pinEntered({ count: entry.length })}
            >
              {"●".repeat(entry.length)}
              <Text type="h01" style={styles.empty}>
                {"○".repeat(Math.max(0, 4 - entry.length))}
              </Text>
            </Text>
          </>
        )}
        {/* Always mounted, so TalkBack reads a message as it appears in it. */}
        <View style={styles.status} testID="pin-status" accessibilityLiveRegion="polite">
          {error && (
            <Text type="p2" style={styles.error} testID="pin-error">
              {error}
            </Text>
          )}
          {params.mode === "set" && step === "new" && !error && (
            <Text type="caption" style={styles.warning}>
              {setPinWarning(removable, blockFreezes, LL)}
            </Text>
          )}
          {(step === "confirm" || step === "remove") && !error && (
            <Text type="caption">{LL.FlashcardV2.tapToApply()}</Text>
          )}
        </View>
      </View>
      {!finished && step !== "remove" && (
        <PinPad
          onDigit={onDigit}
          onBackspace={() => setEntry((e) => e.slice(0, -1))}
          onClear={() => setEntry("")}
        />
      )}
      <View style={styles.footer}>
        {finished ? (
          <PrimaryBtn label={LL.common.close()} onPress={() => navigation.goBack()} />
        ) : (
          <PrimaryBtn
            label={
              step === "remove"
                ? LL.FlashcardV2.removePinConfirm()
                : LL.FlashcardV2.next()
            }
            disabled={!canContinue}
            loading={busy}
            onPress={advance}
          />
        )}
      </View>
    </Screen>
  )
}

/**
 * What the new-PIN step says a PIN commits the holder to, by what this card
 * can do: whether its PIN can be removed again (CLEAR_PIN, applet 0.5: the
 * capability, never the version) and what three wrong entries do to it
 * (`blockedPinGatesSpend`).
 */
const setPinWarning = (removable: boolean, blockFreezes: boolean, LL: LLType): string => {
  if (removable) {
    return blockFreezes
      ? LL.FlashcardV2.setPinWarningRemovable()
      : LL.FlashcardV2.setPinWarningRemovableOpen()
  }
  return blockFreezes
    ? LL.FlashcardV2.setPinWarning()
    : LL.FlashcardV2.setPinWarningOpen()
}

/** What to tell the holder about a tap that worked. */
const successMessage = (mode: PinMode, tap: TapReport, LL: LLType): string => {
  if (mode === "change") return LL.FlashcardV2.pinChanged()
  if (mode === "remove") {
    return tap.earlierClearLanded
      ? LL.FlashcardV2.removePinDoneEarlier()
      : LL.FlashcardV2.removePinDone()
  }
  return tap.earlierSetLanded ? LL.FlashcardV2.pinSetEarlier() : LL.FlashcardV2.pinSet()
}

/**
 * What to tell the holder about a tap that failed, and whether the PINs typed
 * still stand. Nothing here carries a status word or a PIN: the words are for
 * the holder, the status word for the log. `cardVersion` is the version of
 * the card on screen, for when the tap produced no re-read.
 */
const describeFailure = (
  err: unknown,
  {
    pinSent,
    pinWriteSent,
    after,
    mode,
    cardVersion,
  }: TapReport & { mode: PinMode; cardVersion: string },
  LL: LLType,
): Failure => {
  const version = after?.version ?? cardVersion
  // Both are thrown before the operation runs (runCardOperation checks the
  // card first), so no PIN reached any card.
  if (err instanceof WrongCardError) {
    return { message: LL.FlashcardV2.wrongCard(), keepPins: true }
  }
  // Before CardError, which it extends: a tag without the applet (a BoltCard,
  // a bank card) lands here, and its message is developer text.
  if (err instanceof AppletNotSelectedError) {
    return { message: LL.FlashcardV2.notCashuCard(), keepPins: true }
  }
  if (err instanceof CardError) {
    const tries = triesLeft(err.sw)
    // 63C0 is v0.2.0's CHANGE_PIN spending the last try, and that path never
    // marks the PIN blocked (CashuApplet.java@v0.2.0:555-559): VERIFY_PIN
    // answers 6983 from then on (:508) while pinState 1 keeps every gated
    // command refusing (:587-591). The card is frozen for everyone, whatever
    // the firmware would do with a blocked PIN. Applet 0.3 never sends 63C0.
    if (tries === 0) return { message: LL.FlashcardV2.cardNowBlocked(), final: true }
    if (tries !== undefined) {
      return {
        message: blockedPinGatesSpend(version)
          ? LL.FlashcardV2.wrongPin({ tries })
          : LL.FlashcardV2.wrongPinOpen({ tries }),
      }
    }
    switch (err.sw) {
      case 0x6983:
        return { message: blockedPinMessage(after, version, LL), final: true }
      case SW_PIN_ALREADY_SET:
        return { message: LL.FlashcardV2.pinAlreadySet() }
      case SW_NO_PIN_SET:
        // VERIFY_PIN on a card with no PIN. In the remove flow there is
        // nothing left to do: the refusal's re-read has already shown the
        // card screen a card with none. (With a cut-short CLEAR_PIN before
        // it, the operation turned this into a success instead.)
        if (mode === "remove") {
          return { message: LL.FlashcardV2.pinAlreadyUnset(), final: true }
        }
        console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
        return { message: LL.FlashcardV2.cardRefused() }
      case 0x6986:
        // LOCK_CARD was run on this card: SET_PIN, CHANGE_PIN and CLEAR_PIN
        // all refuse (CashuApplet.java@v0.2.0:530, 543; spec/APDU.md,
        // CLEAR_PIN).
        return {
          message:
            mode === "remove"
              ? LL.FlashcardV2.cardLockedRemove()
              : LL.FlashcardV2.cardLocked(),
        }
      default:
        console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
        return { message: LL.FlashcardV2.cardRefused() }
    }
  }
  // The card gave no answer: the tap was lost, timed out, or never reached
  // the applet. Before any PIN command went out, nothing on the card changed.
  if (!pinSent) return { message: LL.FlashcardV2.cardNotFound(), keepPins: true }
  if (pinWriteSent) {
    // SET_PIN saves the PIN before it answers (CashuApplet.java@v0.2.0:
    // 538-539; 0.3: 574-575), so the card may already hold it. Sending the
    // same PIN again settles it: 9000 sets it, and 6985 says the earlier
    // write landed.
    if (mode === "set") {
      return {
        message: LL.FlashcardV2.pinSetUncertain(),
        keepPins: true,
        setInDoubt: true,
      }
    }
    // CLEAR_PIN writes its one byte atomically (spec/APDU.md, CLEAR_PIN):
    // the PIN is gone or it is not, and the current PIN typed is right
    // either way. Tapping again settles it: 9000 removes it, and a 6984 from
    // VERIFY_PIN says the earlier clear landed.
    if (mode === "remove") {
      return {
        message: LL.FlashcardV2.removePinUncertain(),
        keepPins: true,
        clearInDoubt: true,
      }
    }
    // Once CHANGE_PIN was sent the card may have saved the new PIN before
    // the answer was lost, and retyping the old one would spend a try.
    return { message: LL.FlashcardV2.pinChangeUncertain() }
  }
  // Lost during VERIFY_PIN: a wrong current PIN may have cost a try the
  // holder never heard about, so it is entered again.
  return { message: LL.FlashcardV2.cardNotFound() }
}

/**
 * 6983, the PIN is blocked: what that means comes from the state the card
 * reported when it was re-read after refusing.
 *
 * pinState 2 (blocked): on v0.2.0 the PIN check is off, because
 * `requirePinIfSet` gates state 1 only (CashuApplet.java@v0.2.0:587-591); on a
 * fixed version the card is frozen. pinState 1 with a blocked PIN is v0.2.0's
 * frozen card: CHANGE_PIN spent the tries elsewhere without setting state 2
 * (:555-559), VERIFY_PIN answers 6983 at entry (:508), and state 1 keeps
 * gating spends. Without a re-read the firmware decides, which on v0.2.0
 * means the warning that anyone holding the card can spend from it.
 *
 * The copy does not say this tap spent the last try: a card blocked before
 * the tap answers the same 6983.
 */
const blockedPinMessage = (
  after: CardInfo | undefined,
  version: string,
  LL: LLType,
): string => {
  if (after?.pinState === "set") return LL.FlashcardV2.cardNowBlocked()
  return blockedPinGatesSpend(version)
    ? LL.FlashcardV2.cardNowBlocked()
    : LL.FlashcardV2.cardNowOpen()
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  dots: {
    letterSpacing: 6,
    marginVertical: 12,
  },
  empty: {
    color: colors.grey3,
  },
  status: {
    alignItems: "center",
    gap: 8,
  },
  body: {
    gap: 12,
    marginVertical: 12,
  },
  bodyText: {
    textAlign: "center",
  },
  error: {
    color: colors.error,
    textAlign: "center",
  },
  warning: {
    color: colors.grey2,
    textAlign: "center",
  },
  footer: {
    padding: 20,
  },
}))
