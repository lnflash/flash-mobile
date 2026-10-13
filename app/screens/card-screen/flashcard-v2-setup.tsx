import React, { useEffect, useState } from "react"
import { AccessibilityInfo, ActivityIndicator, Platform, View } from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { PrimaryBtn } from "@app/components/buttons"
import { PinPad } from "@app/components/card/PinPad"
import { Screen } from "@app/components/screen"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  AppletNotSelectedError,
  CardError,
  CardNeedsUpdateError,
  PIN_MAX_LENGTH,
  Transceiver,
  WrongCardError,
  getInfo,
  isValidCardPin,
} from "@app/utils/cashu-card"
import { cardMintUrl } from "@app/utils/cashu-card-bridge"
import { refreshTipHeader } from "@app/utils/cashu-card-headers"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import {
  CardNotOpenError,
  OwnerKey,
  newOwnerKey,
  ownerKeyFor,
  saveOwnerKey,
  setUpCard,
} from "@app/utils/cashu-card-owner-store"
import { toastShow } from "@app/utils/toast"

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** A status word as the log shows it, e.g. "6F00". */
const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

const SW_CARD_IN_USE = 0x6a8d
const SW_OWNER_PROOF = 0x6a91

type Step =
  | { name: "preparing" }
  | { name: "intro" }
  | { name: "pin"; confirm: boolean }
  | { name: "tap" }
  | { name: "finished" }

/** What the tap did. */
type SetUpOutcome = "set-up" | "already-mine"

/**
 * Set up a Cashu card (ENG-675, card protocol 2.0; architect's decision 15):
 * this phone becomes the owner of an empty card that has none.
 *
 * Before the tap, off the card: the owner key (derived from the wallet's
 * recovery phrase when the phone has one, else a random key that lives only
 * on this phone, which the screen says), and the tip block header, the card
 * clock's anchor (none when the network does not answer: the card then waits
 * for its first header). Then one tap, owner last (`setUpCard`): the PIN if
 * one is chosen, the record (the mint), the key saved on this phone, and
 * SET_OWNER. A tap cut short is finished by the next: a card that answers it
 * already has an owner is asked for the owner's grant with the key this phone
 * saved, and if it gives it, the setup had landed.
 *
 * An empty card with no owner belongs to the first phone that sets it up
 * (SECURITY-MODEL): the screen says so.
 */
export const FlashcardV2SetupScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { cashuCard, runCardOperation } = useFlashcard()

  const [step, setStep] = useState<Step>({ name: "preparing" })
  const [key, setKey] = useState<OwnerKey>()
  const [anchor, setAnchor] = useState<number[]>()
  const [entry, setEntry] = useState("")
  const [pin, setPin] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // A card that already has a PIN from before must be given a new one: the
  // record can't be written without a PIN nobody here knows.
  const pinRequired = cashuCard ? cashuCard.pinState !== "unset" : false

  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  useEffect(() => {
    if (!cashuCard) navigation.goBack()
  }, [cashuCard, navigation])

  // The key and the anchor, before any tap. The key saved for this card, if
  // an earlier tap was cut short after saving it, is the one to finish with.
  useEffect(() => {
    if (!cashuCard) return undefined
    let live = true
    ;(async () => {
      const saved = await ownerKeyFor(cashuCard.pubkey).catch(() => undefined)
      const chosen =
        saved && (saved.saved || saved.source === "dev")
          ? saved
          : await newOwnerKey(cashuCard.pubkey)
      const header = await refreshTipHeader()
      if (!live) return
      setKey(chosen)
      setAnchor(header?.bytes)
      setStep({ name: "intro" })
    })().catch(() => {
      if (live) {
        setError(LL.FlashcardV2.setUpFailed())
        setStep({ name: "finished" })
      }
    })
    return () => {
      live = false
    }
    // Once, for the card the screen opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!cashuCard) return null

  /** The tap (see the screen's comment). */
  const setUp = async (
    transceive: Transceiver,
    owner: OwnerKey,
  ): Promise<SetUpOutcome> => {
    const info = await getInfo(transceive)
    if (info.hasOwner) {
      // Owned already: by this phone if it takes this phone's proof (a
      // setup whose answer was lost landed), else by someone else.
      try {
        await allowLoad(transceive, ownerSigner(owner.privateKey))
      } catch (err) {
        if (err instanceof CardError && err.sw === SW_OWNER_PROOF) {
          throw new CardNotOpenError("owned")
        }
        throw err
      }
      await saveOwnerKey(cashuCard.pubkey, owner)
      return "already-mine"
    }
    await setUpCard(
      transceive,
      {
        cardPubkey: cashuCard.pubkey,
        info,
        pin,
        mint: cardMintUrl(),
        anchor,
        key: owner,
      },
      saveOwnerKey,
    )
    return "set-up"
  }

  const tap = async () => {
    if (!key) return
    setBusy(true)
    setError(undefined)
    try {
      const outcome = await runCardOperation(
        (transceive) => setUp(transceive, key),
        cashuCard.pubkey,
        {
          assume: {
            hasOwner: true,
            recordSet: true,
            ...(pin ? { pinState: "set" as const } : {}),
          },
          learned: { ownerKeySource: key.source },
        },
      )
      const message =
        outcome === "already-mine"
          ? LL.FlashcardV2.setUpAlreadyMine()
          : LL.FlashcardV2.setUpDone()
      toastShow({ position: "top", type: "success", message })
      AccessibilityInfo.announceForAccessibility(message)
      navigation.goBack()
    } catch (err) {
      if (err instanceof NfcError.UserCancel) return
      const failure = setUpFailure(err, LL)
      setError(failure.message)
      if (failure.final) setStep({ name: "finished" })
    } finally {
      setBusy(false)
    }
  }

  const onDigit = (d: string) => {
    setError(undefined)
    setEntry((e) => (e.length < PIN_MAX_LENGTH ? e + d : e))
  }

  const pinNext = () => {
    if (step.name !== "pin") return
    if (!step.confirm) {
      setPin(entry)
      setEntry("")
      setStep({ name: "pin", confirm: true })
      return
    }
    if (entry !== pin) {
      setError(LL.FlashcardV2.pinMismatch())
      setPin(undefined)
      setEntry("")
      setStep({ name: "pin", confirm: false })
      return
    }
    setEntry("")
    setStep({ name: "tap" })
  }

  const errorLine = (
    <View style={styles.status} testID="setup-status" accessibilityLiveRegion="polite">
      {error && (
        <Text type="p2" style={styles.error} testID="setup-error">
          {error}
        </Text>
      )}
    </View>
  )

  const body = (() => {
    switch (step.name) {
      case "preparing":
        return <ActivityIndicator color={colors.primary} />
      case "intro":
        return (
          <>
            <Text type="p1" style={styles.center} testID="setup-intro">
              {LL.FlashcardV2.setUpIntro()}
            </Text>
            <Text type="p2" style={styles.center}>
              {LL.FlashcardV2.setUpFirstPhone()}
            </Text>
            <Text
              type="p2"
              bold
              style={styles.center}
              testID={`setup-key-${key?.source}`}
            >
              {key?.source === "device"
                ? LL.FlashcardV2.setUpKeyDevice()
                : LL.FlashcardV2.setUpKeySeed()}
            </Text>
            {pinRequired && (
              <Text type="p2" style={styles.center}>
                {LL.FlashcardV2.setUpPinRequired()}
              </Text>
            )}
            {errorLine}
            <PrimaryBtn
              label={LL.FlashcardV2.setUpChoosePin()}
              onPress={() => setStep({ name: "pin", confirm: false })}
              testID="setup-choose-pin"
            />
            {!pinRequired && (
              <PrimaryBtn
                type="outline"
                label={LL.FlashcardV2.setUpNoPin()}
                onPress={() => {
                  setPin(undefined)
                  setStep({ name: "tap" })
                }}
                testID="setup-no-pin"
              />
            )}
          </>
        )
      case "pin":
        return (
          <>
            <Text type="h02" testID="pin-step-title" accessibilityRole="header">
              {step.confirm ? LL.FlashcardV2.confirmPin() : LL.FlashcardV2.newPin()}
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
            {errorLine}
            <PinPad
              onDigit={onDigit}
              onBackspace={() => setEntry((e) => e.slice(0, -1))}
              onClear={() => setEntry("")}
            />
            <PrimaryBtn
              label={LL.FlashcardV2.next()}
              disabled={!isValidCardPin(entry)}
              onPress={pinNext}
              testID="pin-next"
            />
          </>
        )
      case "tap":
        return (
          <>
            <Text type="p1" style={styles.center} testID="setup-tap-note">
              {pin ? LL.FlashcardV2.tapToApply() : LL.FlashcardV2.setUpNoPinNote()}
            </Text>
            {errorLine}
            <PrimaryBtn
              label={LL.FlashcardV2.setUpTap()}
              loading={busy}
              disabled={busy}
              onPress={tap}
              testID="setup-tap"
            />
          </>
        )
      case "finished":
        return (
          <>
            {errorLine}
            <PrimaryBtn
              label={LL.common.close()}
              onPress={() => navigation.goBack()}
              testID="setup-close"
            />
          </>
        )
    }
  })()

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <View style={styles.container}>{body}</View>
    </Screen>
  )
}

/** What to tell the holder about a setup tap that failed, and whether to try again here. */
const setUpFailure = (err: unknown, LL: LLType): { message: string; final?: boolean } => {
  if (err instanceof WrongCardError) return { message: LL.FlashcardV2.wrongCard() }
  if (err instanceof CardNeedsUpdateError) {
    return { message: LL.FlashcardV2.needsUpdateBody(), final: true }
  }
  if (err instanceof AppletNotSelectedError)
    return { message: LL.FlashcardV2.notCashuCard() }
  if (err instanceof CardNotOpenError) {
    if (err.reason === "owned")
      return { message: LL.FlashcardV2.setUpAlreadyOwned(), final: true }
    if (err.reason === "in-use")
      return { message: LL.FlashcardV2.setUpInUse(), final: true }
    return { message: LL.FlashcardV2.setUpPinRequired() }
  }
  if (err instanceof CardError) {
    if (err.sw === SW_CARD_IN_USE)
      return { message: LL.FlashcardV2.setUpInUse(), final: true }
    if (err.sw === 0x6986) return { message: LL.FlashcardV2.cardLocked(), final: true }
    console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
    return { message: LL.FlashcardV2.setUpFailed() }
  }
  // No answer: the card may hold any part of the setup. The next tap finishes
  // it, with the key this phone already saved.
  return { message: LL.FlashcardV2.setUpUncertain() }
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    padding: 20,
    gap: 16,
    alignItems: "stretch",
  },
  center: {
    textAlign: "center",
  },
  dots: {
    letterSpacing: 6,
    marginVertical: 12,
    textAlign: "center",
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
}))
