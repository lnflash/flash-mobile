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
  isValidCardPin,
  setCardPin,
  triesLeft,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { toastShow } from "@app/utils/toast"

type Step = "current" | "new" | "confirm"

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** A status word as the log shows it, e.g. "6F00". */
const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

/** What one tap told the screen besides what it threw. Filled in while the tap runs. */
type TapReport = {
  /** CHANGE_PIN reached the wire: a tap lost after this may have left either PIN. */
  changeSent: boolean
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
}

/**
 * Set or change the Cashu card's PIN (ENG-616).
 *
 * The PINs live in this screen's state and nowhere else: not in the store,
 * not in a log. Everything the card does with them happens inside one tap at
 * the end — VERIFY_PIN then CHANGE_PIN in the same session, or SET_PIN alone
 * on a card that has none yet. Verifying first matters on v0.2.0 firmware:
 * CHANGE_PIN's own failed checks burn tries without ever marking the PIN
 * blocked, which would freeze the card for its owner too. A wrong current PIN
 * costs one of the card's three tries and the screen says how many are left.
 * What a blocked PIN does depends on the firmware (`blockedPinGatesSpend`): it
 * blocks the card for good (no unblock path exists: ENG-617), or on v0.2.0 it
 * switches the PIN check off (ENG-615), and the copy says which. A blocked PIN
 * ends the flow: the screen goes back to the card, which the refusal's re-read
 * has already updated.
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

  const steps: Step[] =
    params.mode === "set" ? ["new", "confirm"] : ["current", "new", "confirm"]
  const [stepIndex, setStepIndex] = useState(0)
  const [entry, setEntry] = useState("")
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // iOS has no live regions (the status area below is one on Android), so an
  // error is read out as it appears.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  const step = steps[stepIndex]
  const canContinue = isValidCardPin(entry) && !busy

  const onDigit = (d: string) => {
    setError(undefined)
    setEntry((e) => (e.length < PIN_MAX_LENGTH ? e + d : e))
  }

  const advance = () => {
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
    const tap: TapReport = { changeSent: false }
    try {
      await runCardOperation(
        async (transceive) => {
          if (params.mode === "set") {
            await setCardPin(transceive, next)
          } else {
            await verifyCardPin(transceive, current)
            tap.changeSent = true
            await changeCardPin(transceive, current, next)
          }
        },
        cashuCard.pubkey,
        {
          // A 9000 to either command leaves the card with a PIN set, whether
          // or not it stays in the field for the re-read.
          assume: { pinState: "set" },
          onReread: (info) => {
            tap.after = info
          },
        },
      )
      toastShow({
        position: "top",
        type: "success",
        message:
          params.mode === "set" ? LL.FlashcardV2.pinSet() : LL.FlashcardV2.pinChanged(),
      })
      navigation.goBack()
    } catch (err) {
      // Cancelling the sheet is the holder's choice, not a failure: no error,
      // and only the confirmation to retype (flash-pos treats a cancel the
      // same way: isUserCancel, docs/13-cashu-card.md).
      if (err instanceof NfcError.UserCancel) {
        setError(undefined)
        setStepIndex(steps.indexOf("confirm"))
        return
      }
      const failure = describeFailure(err, { ...tap, cardVersion: cashuCard.version }, LL)
      if (failure.final) {
        toastShow({ position: "top", type: "error", message: failure.message })
        // The toast is not announced, and this screen is about to go.
        AccessibilityInfo.announceForAccessibility(failure.message)
        navigation.goBack()
        return
      }
      setError(failure.message)
      // Whatever else went wrong, the current PIN is what to re-enter.
      setStepIndex(0)
    } finally {
      setBusy(false)
    }
  }

  const title = {
    current: LL.FlashcardV2.currentPin(),
    new: LL.FlashcardV2.newPin(),
    confirm: LL.FlashcardV2.confirmPin(),
  }[step]

  // Plain testIDs below: `testProps` would label each element with its id, so
  // a screen reader would say "pin-error" instead of the error.
  return (
    <Screen backgroundColor={colors.background}>
      <View style={styles.header}>
        <Text type="h02" testID="pin-step-title" accessibilityRole="header">
          {title}
        </Text>
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
        {/* Always mounted, so TalkBack reads a message as it appears in it. */}
        <View style={styles.status} testID="pin-status" accessibilityLiveRegion="polite">
          {error && (
            <Text type="p2" style={styles.error} testID="pin-error">
              {error}
            </Text>
          )}
          {params.mode === "set" && step === "new" && !error && (
            <Text type="caption" style={styles.warning}>
              {blockFreezes
                ? LL.FlashcardV2.setPinWarning()
                : LL.FlashcardV2.setPinWarningOpen()}
            </Text>
          )}
          {step === "confirm" && !error && (
            <Text type="caption">{LL.FlashcardV2.tapToApply()}</Text>
          )}
        </View>
      </View>
      <PinPad
        onDigit={onDigit}
        onBackspace={() => setEntry((e) => e.slice(0, -1))}
        onClear={() => setEntry("")}
      />
      <View style={styles.footer}>
        <PrimaryBtn
          label={LL.FlashcardV2.next()}
          disabled={!canContinue}
          loading={busy}
          onPress={advance}
        />
      </View>
    </Screen>
  )
}

/**
 * What to tell the holder about a tap that failed. Nothing here carries a
 * status word or a PIN: the words are for the holder, the status word for
 * the log. `cardVersion` is the version of the card on screen, for when the
 * tap produced no re-read.
 */
const describeFailure = (
  err: unknown,
  { changeSent, after, cardVersion }: TapReport & { cardVersion: string },
  LL: LLType,
): Failure => {
  const version = after?.version ?? cardVersion
  if (err instanceof WrongCardError) return { message: LL.FlashcardV2.wrongCard() }
  // Before CardError, which it extends: a tag without the applet (a BoltCard,
  // a bank card) lands here, and its message is developer text.
  if (err instanceof AppletNotSelectedError) {
    return { message: LL.FlashcardV2.notCashuCard() }
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
      case 0x6985:
        return { message: LL.FlashcardV2.pinAlreadySet() }
      case 0x6986:
        // LOCK_CARD was run on this card: SET_PIN and CHANGE_PIN both refuse
        // (CashuApplet.java@v0.2.0:530, 543).
        return { message: LL.FlashcardV2.cardLocked() }
      default:
        console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
        return { message: LL.FlashcardV2.cardRefused() }
    }
  }
  // The card gave no answer: the tap was lost, timed out, or never reached
  // the applet. Once CHANGE_PIN was sent the card may have saved the new PIN
  // before the answer was lost, and retyping the old one would spend a try.
  if (changeSent) return { message: LL.FlashcardV2.pinChangeUncertain() }
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
