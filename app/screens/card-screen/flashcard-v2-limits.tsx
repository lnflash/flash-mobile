import React, { useEffect, useState } from "react"
import { AccessibilityInfo, Platform, TextInput, View } from "react-native"
import { NfcError } from "react-native-nfc-manager"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { PrimaryBtn } from "@app/components/buttons"
import { Screen } from "@app/components/screen"
import { useFlashcard } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { cardLimitsSet } from "@app/store/redux/slices/flashcardV2Slice"
import {
  AppletNotSelectedError,
  CardError,
  CardNeedsUpdateError,
  ROLL_BUDGET_DEFAULT,
  ROLL_BUDGET_MOST,
  SW_NO_OWNER,
  SW_OWNER_PROOF,
  WrongCardError,
} from "@app/utils/cashu-card"
import { CardLimits, ownerSigner, setLimits } from "@app/utils/cashu-card-owner"
import { ownerKeyFor, saveOwnerKey } from "@app/utils/cashu-card-owner-store"
import { toastShow } from "@app/utils/toast"

type LLType = ReturnType<typeof useI18nContext>["LL"]

const swHex = (sw: number) => sw.toString(16).toUpperCase().padStart(4, "0")

/** Field text as a whole number, or undefined for anything else. */
const wholeNumber = (text: string): number | undefined =>
  /^\d{1,10}$/.test(text.trim()) && Number(text) <= 0xffffffff ? Number(text) : undefined

/**
 * The limits as typed, checked: whole numbers of sats (0 is off), and a
 * rollover budget of 1 to 30. Undefined when any field is not.
 */
export const limitsFromFields = (fields: {
  day: string
  payment: string
  allowance: string
  rollBudget: string
}): CardLimits | undefined => {
  const day = wholeNumber(fields.day)
  const payment = wholeNumber(fields.payment)
  const allowance = wholeNumber(fields.allowance)
  const rollBudget = wholeNumber(fields.rollBudget)
  if (
    day === undefined ||
    payment === undefined ||
    allowance === undefined ||
    rollBudget === undefined ||
    rollBudget < 1 ||
    rollBudget > ROLL_BUDGET_MOST
  ) {
    return undefined
  }
  return { day, payment, allowance, rollBudget }
}

/**
 * The owner's limits on a card this phone owns (ENG-675, card protocol 2.0;
 * architect's decision 16).
 *
 * All off on a new card, and off here until the owner sets them: a daily
 * limit on what leaves the card, a limit on one payment (a larger one waits,
 * by the card's own work), a no-PIN allowance (only on a card with a PIN),
 * and the rollover budget, how many days the card's window may roll on its
 * own clock before this phone refreshes it (1 to 30, 7 by default). One tap:
 * the owner's thirteen-byte SET_LIMIT, so the budget the owner chose is the
 * one the card holds. The card says the payment limit only under the owner's
 * grant, so what is shown for it is what this phone last set.
 */
export const FlashcardV2LimitsScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const dispatch = useAppDispatch()
  const { cashuCard, runCardOperation } = useFlashcard()
  const known = useAppSelector((state) =>
    cashuCard ? state.flashcardV2.cards[cashuCard.pubkey] : undefined,
  )

  const [day, setDay] = useState(String(cashuCard?.dailyLimit ?? 0))
  const [payment, setPayment] = useState(String(known?.limits?.payment ?? 0))
  const [allowance, setAllowance] = useState(String(cashuCard?.allowance ?? 0))
  const [rollBudget, setRollBudget] = useState(
    String(cashuCard?.record?.rollBudget ?? ROLL_BUDGET_DEFAULT),
  )
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (error && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(error)
  }, [error])

  useEffect(() => {
    if (!cashuCard) navigation.goBack()
  }, [cashuCard, navigation])

  if (!cashuCard) return null

  // A card with no PIN refuses an allowance above 0 (6985): nothing to spend without.
  const noPin = cashuCard.pinState === "unset"

  const save = async () => {
    const limits = limitsFromFields({
      day,
      payment,
      allowance: noPin ? "0" : allowance,
      rollBudget,
    })
    if (!limits) {
      setError(LL.FlashcardV2.limitsInvalid())
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      const owner = await ownerKeyFor(cashuCard.pubkey).catch(() => undefined)
      if (!owner) {
        setError(LL.FlashcardV2.notOwner())
        return
      }
      await runCardOperation(
        async (transceive) => {
          await setLimits(transceive, ownerSigner(owner.privateKey), limits)
          await saveOwnerKey(cashuCard.pubkey, owner).catch(() => undefined)
        },
        cashuCard.pubkey,
        { assume: { dailyLimit: limits.day, allowance: limits.allowance } },
      )
      dispatch(
        cardLimitsSet({
          pubkey: cashuCard.pubkey,
          limits: {
            day: limits.day,
            payment: limits.payment,
            allowance: limits.allowance,
            rollBudget: limits.rollBudget,
          },
        }),
      )
      const message = LL.FlashcardV2.limitsSaved()
      toastShow({ position: "top", type: "success", message })
      AccessibilityInfo.announceForAccessibility(message)
      navigation.goBack()
    } catch (err) {
      if (err instanceof NfcError.UserCancel) return
      setError(limitsFailure(err, LL))
    } finally {
      setBusy(false)
    }
  }

  /** A field's typed text, digits only; typing clears the error. */
  const change = (set: (text: string) => void) => (text: string) => {
    setError(undefined)
    set(text.replace(/[^0-9]/g, ""))
  }

  return (
    <Screen preset="scroll" backgroundColor={colors.background}>
      <View style={styles.container}>
        <Text type="p2" testID="limits-intro">
          {LL.FlashcardV2.limitsIntro()}
        </Text>
        <LimitField
          label={LL.FlashcardV2.limitsDaily()}
          note={LL.FlashcardV2.limitsDailyNote()}
          value={day}
          onChange={change(setDay)}
          editable={!busy}
          testID="limits-day"
        />
        <LimitField
          label={LL.FlashcardV2.limitsPayment()}
          note={LL.FlashcardV2.limitsPaymentNote()}
          value={payment}
          onChange={change(setPayment)}
          editable={!busy}
          testID="limits-payment"
        />
        <LimitField
          label={LL.FlashcardV2.limitsAllowance()}
          note={
            noPin
              ? LL.FlashcardV2.limitsAllowanceNoPin()
              : LL.FlashcardV2.limitsAllowanceNote()
          }
          value={noPin ? "0" : allowance}
          onChange={change(setAllowance)}
          editable={!busy && !noPin}
          testID="limits-allowance"
        />
        <LimitField
          label={LL.FlashcardV2.limitsRollBudget()}
          note={LL.FlashcardV2.limitsRollBudgetNote()}
          value={rollBudget}
          onChange={change(setRollBudget)}
          editable={!busy}
          testID="limits-roll-budget"
        />
        <View
          style={styles.status}
          testID="limits-status"
          accessibilityLiveRegion="polite"
        >
          {error && (
            <Text type="p2" style={styles.error} testID="limits-error">
              {error}
            </Text>
          )}
        </View>
        <PrimaryBtn
          label={LL.FlashcardV2.limitsSave()}
          loading={busy}
          disabled={busy}
          onPress={save}
          testID="limits-save"
        />
      </View>
    </Screen>
  )
}

/** One limit: its label, a number field, and what it does. */
const LimitField: React.FC<{
  label: string
  note: string
  value: string
  onChange: (text: string) => void
  editable: boolean
  testID: string
}> = ({ label, note, value, onChange, editable, testID }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View style={styles.field}>
      <Text type="p2" bold>
        {label}
      </Text>
      <TextInput
        style={[styles.input, { color: colors.black, borderColor: colors.grey4 }]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        accessibilityLabel={label}
        editable={editable}
        testID={testID}
      />
      <Text type="caption" style={styles.note}>
        {note}
      </Text>
    </View>
  )
}

const limitsFailure = (err: unknown, LL: LLType): string => {
  if (err instanceof WrongCardError) return LL.FlashcardV2.wrongCard()
  if (err instanceof CardNeedsUpdateError) return LL.FlashcardV2.needsUpdateBody()
  if (err instanceof AppletNotSelectedError) return LL.FlashcardV2.notCashuCard()
  if (err instanceof CardError) {
    if (err.sw === SW_OWNER_PROOF) return LL.FlashcardV2.notOwner()
    if (err.sw === SW_NO_OWNER) return LL.FlashcardV2.noOwner()
    if (err.sw === 0x6986) return LL.FlashcardV2.cardLocked()
    console.warn(`Cashu card refused ${err.context}: ${err.name} ${swHex(err.sw)}`)
    return LL.FlashcardV2.cardRefused()
  }
  // No answer: SET_LIMIT is the last command, and sending the same limits
  // again settles a lost one.
  return LL.FlashcardV2.cardNotFound()
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    padding: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
  },
  note: {
    color: colors.grey2,
  },
  status: {
    alignItems: "center",
  },
  error: {
    color: colors.error,
    textAlign: "center",
  },
}))
