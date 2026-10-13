import React, { useEffect, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  View,
} from "react-native"
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
  getInfo,
} from "@app/utils/cashu-card"
import {
  CardLimits,
  allowLoad,
  ownerSigner,
  setLimits,
} from "@app/utils/cashu-card-owner"
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
 * one the card holds.
 *
 * Every field opens at what the card said on its last read (a tap, or the
 * re-read after an operation, which reads GET_CARD too, so a budget saved
 * here is the one the field reopens at): the daily
 * limit and the allowance from GET_INFO, the budget from GET_CARD, and the
 * payment limit from the GET_INFO the read tap asked under the owner's grant
 * (`ownerPaymentLimit`), the only time the card says it (cashu-javacard
 * spec/APDU.md, GET_INFO bytes 30-33, and ALLOW_LOAD). What this phone
 * stored is not always what the card holds: another phone with the same
 * owner key (the same seed, decision 14) may have changed it since. So the
 * stored payment limit is shown only when the card has not said its own to
 * this phone (a dev bridge's card, say), and is labelled as last known; with
 * neither, the field is blank.
 *
 * SET_LIMIT always writes all three limits. A payment field the owner left as
 * the screen opened it is never written as it stands: the save tap asks for
 * the grant, reads the card's own payment limit (GET_INFO) and writes that
 * back unchanged with the other limits, so a limit changed between the read
 * and the save is not silently restored. Only a payment limit the owner typed
 * here is written as typed.
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
  // The card's own, from its last read under the grant; else what this phone
  // stored, labelled as last known; else blank. The card's is read at the save.
  const cardPayment = cashuCard?.ownerPaymentLimit
  const storedPayment = known?.limits?.payment
  const shownPayment = cardPayment ?? storedPayment
  const [lastKnownPayment] = useState(
    cardPayment === undefined && storedPayment !== undefined,
  )
  // The payment field as the screen opened it: left so, the card's is kept.
  const [openedPayment] = useState(shownPayment === undefined ? "" : String(shownPayment))
  const [payment, setPayment] = useState(openedPayment)
  const [allowance, setAllowance] = useState(String(cashuCard?.allowance ?? 0))
  const [rollBudget, setRollBudget] = useState(
    String(cashuCard?.record?.rollBudget ?? ROLL_BUDGET_DEFAULT),
  )
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  // The number pad covers the lower fields (the budget, first of all): the
  // field being typed in is scrolled to the top of what the pad leaves, once
  // the pad is up and again on each focus while it is.
  const scroller = useRef<ScrollView>(null)
  const fieldTops = useRef<Record<string, number>>({})
  const focusedField = useRef<string>()
  const showFocusedField = () => {
    const id = focusedField.current
    const top = id === undefined ? undefined : fieldTops.current[id]
    if (top === undefined) return
    scroller.current?.scrollTo({ y: Math.max(0, top - FIELD_MARGIN), animated: true })
  }
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", showFocusedField)
    return () => shown.remove()
  }, [])
  const fieldEvents = (testID: string) => ({
    onLayout: (top: number) => {
      fieldTops.current[testID] = top
    },
    onFocus: () => {
      focusedField.current = testID
      if (Keyboard.isVisible()) showFocusedField()
    },
  })

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
    // Left as the screen opened it, the payment limit is what the card holds:
    // it is read in the save tap, so SET_LIMIT neither wipes a limit this
    // phone cannot see nor restores one another phone has changed since.
    const keepCardPayment = payment.trim() === openedPayment
    const limits = limitsFromFields({
      day,
      payment: keepCardPayment ? "0" : payment,
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
      const sign = ownerSigner(owner.privateKey)
      const written = await runCardOperation<CardLimits>(
        async (transceive) => {
          let toWrite = limits
          if (keepCardPayment) {
            // The owner's grant, then the card's payment limit under it.
            await allowLoad(transceive, sign)
            const { paymentLimit } = await getInfo(transceive)
            toWrite = { ...limits, payment: paymentLimit }
          }
          await setLimits(transceive, sign, toWrite)
          await saveOwnerKey(cashuCard.pubkey, owner).catch(() => undefined)
          return toWrite
        },
        cashuCard.pubkey,
        {
          // The budget is GET_CARD's to say, and the re-read reads it; this
          // stands in when the re-read is lost, so the field never reopens at
          // the budget before this save, which the next save would write back.
          assume: {
            dailyLimit: limits.day,
            allowance: limits.allowance,
            record: { dailyLimit: limits.day, rollBudget: limits.rollBudget },
          },
          learned: (set) => ({ ownerPaymentLimit: set.payment }),
        },
      )
      dispatch(
        cardLimitsSet({
          pubkey: cashuCard.pubkey,
          limits: {
            day: written.day,
            payment: written.payment,
            allowance: written.allowance,
            rollBudget: written.rollBudget,
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
    <Screen preset="fixed" backgroundColor={colors.background}>
      <ScrollView ref={scroller} automaticallyAdjustKeyboardInsets testID="limits-scroll">
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
            {...fieldEvents("limits-day")}
          />
          <LimitField
            label={LL.FlashcardV2.limitsPayment()}
            note={LL.FlashcardV2.limitsPaymentNote()}
            remark={
              lastKnownPayment ? LL.FlashcardV2.limitsPaymentLastKnown() : undefined
            }
            value={payment}
            onChange={change(setPayment)}
            editable={!busy}
            placeholder={
              shownPayment === undefined ? LL.FlashcardV2.limitsPaymentKept() : undefined
            }
            testID="limits-payment"
            {...fieldEvents("limits-payment")}
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
            {...fieldEvents("limits-allowance")}
          />
          <LimitField
            label={LL.FlashcardV2.limitsRollBudget()}
            note={LL.FlashcardV2.limitsRollBudgetNote()}
            value={rollBudget}
            onChange={change(setRollBudget)}
            editable={!busy}
            testID="limits-roll-budget"
            {...fieldEvents("limits-roll-budget")}
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
      </ScrollView>
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
  /** Shown while the field is blank. */
  placeholder?: string
  /** Said of the value the field opened at, above what the field does. */
  remark?: string
  testID: string
  /** Where the field sits in the scroll view, as it is laid out. */
  onLayout?: (top: number) => void
  onFocus?: () => void
}> = ({
  label,
  note,
  value,
  onChange,
  editable,
  placeholder,
  remark,
  testID,
  onLayout,
  onFocus,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View
      style={styles.field}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}
      testID={`${testID}-field`}
    >
      <Text type="p2" bold testID={`${testID}-label`}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, { color: colors.black, borderColor: colors.grey4 }]}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.grey3}
        accessibilityLabel={label}
        accessibilityHint={remark ?? placeholder}
        editable={editable}
        onFocus={onFocus}
        testID={testID}
      />
      {remark && (
        <Text type="caption" style={styles.note} testID={`${testID}-remark`}>
          {remark}
        </Text>
      )}
      <Text type="caption" style={styles.note}>
        {note}
      </Text>
    </View>
  )
}

/** Space kept above a field scrolled into view for typing. */
const FIELD_MARGIN = 16

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
