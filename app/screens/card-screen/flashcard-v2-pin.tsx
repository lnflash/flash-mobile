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
  CardNeedsUpdateError,
  PIN_MAX_LENGTH,
  SW_NO_OWNER,
  SW_OWNER_PROOF,
  Transceiver,
  WrongCardError,
  getInfo,
  isValidCardPin,
  setCardPin,
} from "@app/utils/cashu-card"
import { allowLoad, changePinAsOwner, ownerSigner } from "@app/utils/cashu-card-owner"
import { OwnerKey, ownerKeyFor, saveOwnerKey } from "@app/utils/cashu-card-owner-store"
import { toastShow } from "@app/utils/toast"

type Step = "new" | "confirm"

type PinMode = RootStackParamList["FlashcardV2Pin"]["mode"]

const STEPS: Step[] = ["new", "confirm"]

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** A status word as the log shows it, e.g. "6F00". */
const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

/** SET_PIN on a card holding value (spec/APDU.md, SET_PIN). */
const SW_CARD_IN_USE = 0x6a8d
const SW_LOCKED = 0x6986

/** This phone holds no key for the card's owner: nothing was sent. */
class NoOwnerKeyError extends Error {
  constructor() {
    super("this phone holds no owner key for the card")
    this.name = "NoOwnerKeyError"
  }
}

/** What one tap told the screen besides what it threw. Filled in while the tap runs. */
type TapReport = {
  /**
   * SET_PIN or CHANGE_PIN reached the wire: a tap lost after this may or may
   * not have left the new PIN on the card. Sending the same PIN again settles
   * it either way: the owner's CHANGE_PIN sets whatever PIN it carries.
   */
  pinWriteSent: boolean
}

type Failure = {
  message: string
  /** Nothing more can be done here; Close returns to the card screen. */
  final?: boolean
  /**
   * The PINs typed still stand, so only the confirmation is retyped.
   * Otherwise the flow starts again from its first step.
   */
  keepPins?: boolean
}

/**
 * Set or change the Cashu card's PIN as its owner (ENG-616; card protocol
 * 2.0, ENG-675).
 *
 * The PINs live in this screen's state and nowhere else: not in the store,
 * not in a log. Everything the card does with them happens inside one tap at
 * the end. On a card with an owner, this phone proves it is that owner, and
 * needs no old PIN: a card with no PIN gets one under the owner's grant
 * (ALLOW_LOAD, then SET_PIN: "ADD PIN"), and a card with one gets the new one
 * by the owner's CHANGE_PIN, which also refills the tries and unblocks a
 * blocked PIN. The PIN goes sealed to the card's PIN key on a card that takes
 * it so (`CardInfo.sealed`). On a card with no owner (an open card), SET_PIN
 * sets or replaces the PIN while the card holds nothing.
 *
 * Every write here leaves the card with the PIN just typed, whatever it held
 * before, so a tap cut short is settled by tapping again with the same PIN:
 * the PINs typed stay, and only the confirmation is retyped. A phone that is
 * not the owner is told so; nothing it sends changes the card.
 */
export const FlashcardV2PinScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { params } = useRoute<RouteProp<RootStackParamList, "FlashcardV2Pin">>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCard, runCardOperation } = useFlashcard()

  const lastStep = STEPS.length - 1
  const [stepIndex, setStepIndex] = useState(0)
  const [entry, setEntry] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  // Set once the card has settled the flow with nothing more to try here:
  // the message stays on this screen and Close returns to the card screen.
  const [finished, setFinished] = useState(false)

  // iOS has no live regions (the status area below is one on Android), so an
  // error is read out as it appears.
  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  const step = STEPS[stepIndex]
  const canContinue = isValidCardPin(entry) && !busy

  const onDigit = (d: string) => {
    setError(undefined)
    setEntry((e) => (e.length < PIN_MAX_LENGTH ? e + d : e))
  }

  const advance = () => {
    if (step === "new") {
      setNext(entry)
      setEntry("")
      setStepIndex(1)
      return
    }
    if (entry !== next) {
      // Back to "new": a mismatch means one of the two was mistyped.
      setError(LL.FlashcardV2.pinMismatch())
      setEntry("")
      setStepIndex(0)
      return
    }
    setEntry("")
    apply()
  }

  /** The tap: the PIN written as the card and this phone allow (see the screen's comment). */
  const writePin = async (
    transceive: Transceiver,
    owner: OwnerKey | undefined,
    tap: TapReport,
  ) => {
    if (!cashuCard) return
    const info = await getInfo(transceive)
    const form = { sealed: info.sealed, cardPubkey: cashuCard.pubkey }
    if (!info.hasOwner) {
      tap.pinWriteSent = true
      await setCardPin(transceive, next, form)
      return
    }
    if (!owner) throw new NoOwnerKeyError()
    const sign = ownerSigner(owner.privateKey)
    if (info.pinState === "unset") {
      await allowLoad(transceive, sign)
      tap.pinWriteSent = true
      await setCardPin(transceive, next, form)
    } else {
      tap.pinWriteSent = true
      await changePinAsOwner(transceive, next, { ...form, sign })
    }
    await saveOwnerKey(cashuCard.pubkey, owner).catch(() => undefined)
  }

  const apply = async () => {
    if (!cashuCard) return
    setBusy(true)
    setError(undefined)
    const tap: TapReport = { pinWriteSent: false }
    try {
      // Found before the tap: a seed's derivation takes a moment.
      const owner = cashuCard.hasOwner
        ? await ownerKeyFor(cashuCard.pubkey).catch(() => undefined)
        : undefined
      await runCardOperation(
        (transceive) => writePin(transceive, owner, tap),
        cashuCard.pubkey,
        // A 9000 to SET_PIN or CHANGE_PIN leaves the card with a PIN set,
        // unblocked, whether or not the card stays in the field for the re-read.
        { assume: { pinState: "set", tries: 3 } },
      )
      const message =
        params.mode === "change" ? LL.FlashcardV2.pinChanged() : LL.FlashcardV2.pinSet()
      toastShow({ position: "top", type: "success", message })
      // A toast is not announced, and this screen is about to go.
      AccessibilityInfo.announceForAccessibility(message)
      navigation.goBack()
    } catch (err) {
      // Cancelling the sheet before any PIN reached the card is the holder's
      // choice, not a failure: no error, and only the confirmation to retype.
      if (err instanceof NfcError.UserCancel && !tap.pinWriteSent) {
        setError(undefined)
        setStepIndex(lastStep)
        return
      }
      const failure = describeFailure(err, { ...tap, mode: params.mode }, LL)
      setError(failure.message)
      if (failure.final) {
        setFinished(true)
        return
      }
      setStepIndex(failure.keepPins ? lastStep : 0)
    } finally {
      setBusy(false)
    }
  }

  const title = {
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
        {!finished && (
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
          {step === "new" && !error && (
            <Text type="caption" style={styles.warning} testID="pin-warning">
              {params.mode === "change"
                ? LL.FlashcardV2.changePinBody()
                : LL.FlashcardV2.setPinWarning()}
            </Text>
          )}
          {step === "confirm" && !error && (
            <Text type="caption">{LL.FlashcardV2.tapToApply()}</Text>
          )}
        </View>
      </View>
      {!finished && (
        <PinPad
          onDigit={onDigit}
          onBackspace={() => setEntry((e) => e.slice(0, -1))}
          onClear={() => setEntry("")}
        />
      )}
      <View style={styles.footer}>
        {finished ? (
          <PrimaryBtn
            label={LL.common.close()}
            onPress={() => navigation.goBack()}
            testID="pin-close"
          />
        ) : (
          <PrimaryBtn
            label={LL.FlashcardV2.next()}
            disabled={!canContinue}
            loading={busy}
            onPress={advance}
            testID="pin-next"
          />
        )}
      </View>
    </Screen>
  )
}

/**
 * What to tell the holder about a tap that failed, and whether the PINs typed
 * still stand. Nothing here carries a status word or a PIN: the words are for
 * the holder, the status word for the log.
 */
const describeFailure = (
  err: unknown,
  { pinWriteSent, mode }: TapReport & { mode: PinMode },
  LL: LLType,
): Failure => {
  // Thrown before anything was written (runCardOperation checks the card
  // first, and the owner key is looked up before the tap).
  if (err instanceof WrongCardError) {
    return { message: LL.FlashcardV2.wrongCard(), keepPins: true }
  }
  if (err instanceof NoOwnerKeyError) {
    return { message: LL.FlashcardV2.notOwner(), final: true }
  }
  if (err instanceof CardNeedsUpdateError) {
    return { message: LL.FlashcardV2.needsUpdateBody(), final: true }
  }
  // Before CardError, which it extends: a tag without the applet (a BoltCard,
  // a bank card) lands here, and its message is developer text.
  if (err instanceof AppletNotSelectedError) {
    return { message: LL.FlashcardV2.notCashuCard(), keepPins: true }
  }
  if (err instanceof CardError) {
    switch (err.sw) {
      case SW_OWNER_PROOF:
        // The card took no proof from this phone: nothing changed on it.
        return { message: LL.FlashcardV2.notOwner(), final: true }
      case SW_NO_OWNER:
        return { message: LL.FlashcardV2.noOwner(), final: true }
      case SW_LOCKED:
        return { message: LL.FlashcardV2.cardLocked(), final: true }
      case SW_CARD_IN_USE:
      default:
        console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
        return { message: LL.FlashcardV2.cardRefused() }
    }
  }
  // The card gave no answer: the tap was lost, timed out, or never reached
  // the applet. Before any PIN write went out, nothing on the card changed.
  if (!pinWriteSent) return { message: LL.FlashcardV2.cardNotFound(), keepPins: true }
  // The card may already hold the new PIN. Tapping again with the same one
  // settles it: every write here leaves the card with the PIN it carries.
  return {
    message:
      mode === "change"
        ? LL.FlashcardV2.pinChangeUncertain()
        : LL.FlashcardV2.pinSetUncertain(),
    keepPins: true,
  }
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
