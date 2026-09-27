import React, { useState } from "react"
import { View } from "react-native"
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
  CardError,
  PIN_MAX_LENGTH,
  WrongCardError,
  blockedPinGatesSpend,
  changeCardPin,
  isValidCardPin,
  setCardPin,
  triesLeft,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { testProps } from "@app/utils/testProps"
import { toastShow } from "@app/utils/toast"

type Step = "current" | "new" | "confirm"

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
 * What the third does depends on the firmware (`blockedPinGatesSpend`): it
 * blocks the card for good (no unblock path exists: ENG-617), or on v0.2.0 it
 * switches the PIN check off (ENG-615), and the copy says which.
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
    try {
      await runCardOperation(async (transceive) => {
        if (params.mode === "set") {
          await setCardPin(transceive, next)
        } else {
          await verifyCardPin(transceive, current)
          await changeCardPin(transceive, current, next)
        }
      }, cashuCard.pubkey)
      toastShow({
        position: "top",
        type: "success",
        message:
          params.mode === "set" ? LL.FlashcardV2.pinSet() : LL.FlashcardV2.pinChanged(),
      })
      navigation.goBack()
    } catch (err) {
      setError(describeFailure(err, LL))
      // Whatever went wrong, the current PIN is what to re-enter.
      setStepIndex(0)
    } finally {
      setBusy(false)
    }
  }

  const describeFailure = (err: unknown, ll: typeof LL): string => {
    if (err instanceof WrongCardError) return ll.FlashcardV2.wrongCard()
    const lastTry = blockFreezes
      ? ll.FlashcardV2.cardNowBlocked()
      : ll.FlashcardV2.cardNowOpen()
    if (err instanceof CardError) {
      const tries = triesLeft(err.sw)
      if (tries !== undefined) {
        if (tries === 0) return lastTry
        return blockFreezes
          ? ll.FlashcardV2.wrongPin({ tries })
          : ll.FlashcardV2.wrongPinOpen({ tries })
      }
      if (err.sw === 0x6983) return lastTry
      if (err.sw === 0x6985) return ll.FlashcardV2.pinAlreadySet()
      return err.message
    }
    // The tap never reached the applet: cancelled, lost, or not our card.
    return ll.FlashcardV2.cardNotFound()
  }

  const title = {
    current: LL.FlashcardV2.currentPin(),
    new: LL.FlashcardV2.newPin(),
    confirm: LL.FlashcardV2.confirmPin(),
  }[step]

  return (
    <Screen backgroundColor={colors.background}>
      <View style={styles.header}>
        <Text type="h02" {...testProps("pin-step-title")}>
          {title}
        </Text>
        <Text type="caption">{LL.FlashcardV2.pinLength()}</Text>
        <Text type="h01" style={styles.dots} {...testProps("pin-entry")}>
          {"●".repeat(entry.length)}
          <Text type="h01" style={styles.empty}>
            {"○".repeat(Math.max(0, 4 - entry.length))}
          </Text>
        </Text>
        {error && (
          <Text type="p2" style={styles.error} {...testProps("pin-error")}>
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
