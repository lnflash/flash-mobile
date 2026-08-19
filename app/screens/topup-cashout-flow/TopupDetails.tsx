/**
 * TopupDetails Component
 *
 * This screen collects payment details before initiating the topup flow.
 * Users select:
 * 1. Target wallet (USD or BTC)
 * 2. Amount to topup
 *
 * Previously, this screen also collected email address, but that was removed
 * to avoid double entry - users now enter email directly on Fygaro's form.
 *
 * The component supports both card payments (Fygaro) and bank transfers,
 * routing to the appropriate flow based on the selected payment type.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  View,
  TextInput,
  Alert,
  InputAccessoryView,
  Keyboard,
  TouchableOpacity,
  Platform,
} from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { useFocusEffect } from "@react-navigation/native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ButtonGroup } from "@app/components/button-group"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useCardTopupAllowance } from "@app/hooks/use-card-topup-allowance"
import { useCardTopupLimit } from "@app/hooks/use-card-topup-limit"
import { AccountLevel } from "@app/graphql/level-context"

// utils
import { estimateTopupNet } from "./topup-fee-estimate"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

// Card top-ups are gated to at least $10 unless the backend overrides it. Used
// when Globals.fygaroTopup is null (settings unavailable) so the floor never
// silently drops back to the old $1.
const DEFAULT_CARD_MINIMUM = 10

// Checkout holds lapse within the day, so the clock time is the useful part.
// Exported for the test that pins the rendered line, so the expectation is
// derived the same way rather than hard-coding one machine's locale.
export const formatHoldExpiry = (at: Date): string =>
  at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

/**
 * How long Continue may be held waiting for the allowance before the screen
 * falls back to the flat per-level cap.
 *
 * A deadline is required, not optional. The allowance query is `network-only`
 * and nothing in the stack will ever time it out: React Native sets no default
 * network timeout on Android and this app's HttpLink (app/graphql/client.tsx)
 * passes no AbortController, so a stalled connection produces a promise that
 * hangs rather than one that rejects. Without this, `allowanceLoading` stays
 * true forever, Continue renders a permanent unlabelled spinner and
 * `handleContinue` early-returns — the card top-up flow becomes unstartable,
 * with no error and no way out. Past the deadline the documented flat-cap
 * degrade path applies, which is strictly what this screen did before the
 * allowance existed.
 */
const ALLOWANCE_DEADLINE_MS = 5_000

type Props = StackScreenProps<RootStackParamList, "TopupDetails">

const TopupDetails: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { bottom } = useSafeAreaInsets()
  const styles = useStyles()({ bottom })

  const { persistentState } = usePersistentStateContext()

  /**
   * Component state:
   * - selectedWallet: Which wallet to credit (USD or BTC)
   * - amount: Topup amount in USD
   * - isLoading: Loading state for navigation
   *
   * NOTE: Email field was removed to prevent double entry.
   * Users enter email on Fygaro's payment form instead.
   */
  const [selectedWallet, setSelectedWallet] = useState("USD")
  const [amount, setAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const isCard = route.params.paymentType === "card"

  // Fee params, minimum, and per-level daily cap for card top-ups, sourced
  // from the backend globals (cache-warm from the topup/cashout entry screen).
  // fygaroTopup is null when the instance's Fygaro settings are unavailable —
  // callers must degrade gracefully (hide the net line, fall back on the min).
  //
  // The daily cap is a PER-TRANSACTION pre-check only — the client cannot see
  // the trailing 24h total, which the webhook enforces authoritatively before
  // crediting — but it stops the obvious case where a single charge already
  // exceeds the cap, BEFORE the card is charged and the money is stuck in
  // manual review. Unresolvable level (NonAuth) or null fygaroTopup degrades
  // to "no client-side cap": the server still gates, and blocking top-ups on
  // missing metadata would be worse than a manual-review fallback.
  // AccountLevel.Zero is NOT part of that degrade path — the webhook fails
  // CLOSED for level 0 (no-daily-limit-for-level), so handleContinue refuses
  // card top-ups for level 0 outright rather than letting the charge be
  // captured and stranded. And a level that is merely still LOADING is not
  // "unresolvable": while levelLoading is true the card flow holds (Continue
  // disabled) instead of degrading, so a cold start can't misread an authed
  // level-0 user as NonAuth and wave them through.
  const {
    fygaroTopup,
    dailyLimit: levelDailyLimit,
    currentLevel,
    levelLoading,
  } = useCardTopupLimit()

  // What is ACTUALLY left today for CARD top-ups, as the backend computes it —
  // including unpaid checkout links this account is still holding. The flat
  // per-level cap below is the fallback for when this cannot be established
  // (older backend, feature off, ERPNext unreadable), never a substitute:
  // showing $125 to someone with $25 left is how a customer gets charged for a
  // top-up we then refuse.
  //
  // Skipped off the card flow entirely. Bank transfers and Bridge deposits have
  // their own limits and are not touched by the Fygaro allowance; asking for it
  // here would only tempt this screen into applying a card cap to a rail it has
  // nothing to do with.
  const {
    allowance,
    loading: allowanceLoading,
    refreshing: allowanceRefreshing,
    stale: allowanceStale,
    refetch: refetchAllowance,
  } = useCardTopupAllowance({
    skip: !isCard,
  })

  /**
   * Refresh the allowance every time the customer comes BACK to this screen.
   *
   * This screen is not unmounted when it pushes CardPayment, and asking for a
   * checkout mints a reservation — so the figure it is still rendering is stale
   * the moment the customer returns. Concretely: $65 left, they enter $60 and
   * tap Continue, the server holds $60, and then they are refused (or simply
   * back out of the payment page). Both routes home call `goBack()` — the
   * refusal screen's "Change amount" and the refusal alert's OK — landing them
   * on a screen still promising "$65.00 of $125.00 left today" and still gating
   * Continue against $65. They are invited to try again and refused again. That
   * is precisely the "the app invites a top-up that will be refused" failure the
   * allowance was added to end.
   *
   * `refetchAllowance` is read through a ref so the focus callback's only
   * dependency is `isCard`, which never changes for a given screen instance. A
   * callback whose identity moves re-runs `useFocusEffect` while the screen is
   * still focused, and each re-run is another network-only round trip.
   */
  const refetchAllowanceRef = useRef(refetchAllowance)
  useEffect(() => {
    refetchAllowanceRef.current = refetchAllowance
  })
  // The mount fetch is already `network-only`, so the FIRST focus (a screen is
  // focused as it mounts) has nothing to refresh and would only duplicate the
  // request in flight. Returns to the screen are the whole point.
  const skipFirstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (!isCard) return
      if (skipFirstFocus.current) {
        skipFirstFocus.current = false
        return
      }
      refetchAllowanceRef.current()
    }, [isCard]),
  )

  // Card flow enforces the backend minimum (default $10); other flows keep the
  // long-standing $1 floor.
  const minimumAmount = isCard ? fygaroTopup?.minimumAmount ?? DEFAULT_CARD_MINIMUM : 1

  // Level-0 accounts cannot card top-up at all — see the comment in
  // handleContinue. Shared between the Continue refusal and the net-preview
  // gate so the screen never promises a receive figure Continue will refuse.
  const cardBlockedForLevel = isCard && currentLevel === AccountLevel.Zero

  // While a signed-in user's level is still resolving on the card flow, the
  // level gate cannot run yet — hold Continue (spinner) rather than letting
  // the "no block" degrade path fire before the level is known.
  const cardLevelPending = isCard && levelLoading
  // The allowance query is network-only, so it is ALWAYS a round trip, while
  // the level resolves instantly from a warm cache. Without this the gap
  // between them is a window where Continue is enabled and the screen quotes
  // the flat cap — so the customer is invited to spend $125 they do not have
  // and refused a moment later. Same posture the level already takes: hold the
  // flow rather than treat "not known yet" as "no limit".
  //
  // But only until the deadline. "Not known yet" becomes "not knowable" at some
  // point, and past that the flat cap is a worse gate than the allowance yet a
  // far better one than a screen the customer cannot leave.
  //
  // Two ways the figure can be untrustworthy, and both must hold the flow:
  //  - we have never had one (first load), or
  //  - the one we are holding is being REPLACED right now. That is the return
  //    from CardPayment: asking for a checkout mints a reservation, so the $65
  //    still rendered here is $60 too high until the refetch lands. Waving
  //    Continue through on it invites exactly the top-up the server just
  //    refused — the failure the on-focus refetch was added to end, left half
  //    open because Apollo keeps serving the old data through a refetch.
  const allowanceUnsettled =
    isCard && ((allowanceLoading && !allowance) || allowanceRefreshing)
  const [allowanceDeadlinePassed, setAllowanceDeadlinePassed] = useState(false)
  useEffect(() => {
    // Armed per HOLD, not once per mount. A mount-only timer has always
    // expired by the time the customer comes back from the payment screen,
    // which would make the deadline bound the first hold and none of the
    // later ones.
    if (!allowanceUnsettled) {
      setAllowanceDeadlinePassed(false)
      return undefined
    }
    const timer = setTimeout(
      () => setAllowanceDeadlinePassed(true),
      ALLOWANCE_DEADLINE_MS,
    )
    return () => clearTimeout(timer)
  }, [allowanceUnsettled])
  const cardAllowancePending = allowanceUnsettled && !allowanceDeadlinePassed

  /**
   * The allowance this screen is allowed to ACT on, which is not always the one
   * Apollo is still serving.
   *
   * The deadline releases the hold for both of the reasons the figure can be
   * untrustworthy, but only one of them has a safe fallback:
   *
   *  - First load (`allowanceLoading && !allowance`): there is no figure at
   *    all, so past the deadline the flat per-level cap applies. Documented,
   *    weaker, fine.
   *  - Refresh (`allowanceRefreshing`): there IS a figure, and it is the
   *    PRE-reservation one. This is the return from CardPayment, where asking
   *    for a checkout has just minted a hold. Gating on it, or quoting it, is
   *    quoting a number we know the server has already superseded: the screen
   *    would still say "$65.00 of $125.00 left today" after $60 of it was
   *    taken, wave the customer through on $60, mint a SECOND hold, refuse them
   *    again, and extend their lockout — reopening the exact loop the on-focus
   *    refetch was added to close.
   *
   * So the deadline releases the hold, and this discards the figure with it.
   * Past it the screen falls back to the flat cap — the same place the
   * first-load case lands — rather than repeating a number it knows is stale.
   *
   * And a refresh that FAILS is the same superseded figure by the shorter road.
   * The deadline only ever governs a refresh that STALLS — one still sitting in
   * `NetworkStatus.refetch` — but a rejected refetch never passes through that
   * status at all: Apollo hands it to useQuery's error observer, which re-serves
   * the previous `data` with `loading: false` and `NetworkStatus.error` (see
   * `stale` in use-card-topup-allowance). Nothing about the resulting render
   * says "this number is old", so gating on it is the stall case with the wait
   * removed: the customer comes back from minting a $60 hold, the focus refetch
   * dies on the wire, and the screen goes straight back to promising the whole
   * $125 it had before. No deadline applies here — there is no round trip left
   * to wait out — so this discards the figure immediately and the flat cap
   * takes over.
   */
  const allowanceSuperseded =
    isCard && ((allowanceRefreshing && allowanceDeadlinePassed) || allowanceStale)
  const usableAllowance = allowanceSuperseded ? undefined : allowance

  const dailyLimit = isCard ? levelDailyLimit : undefined

  /**
   * Validates the entered amount against the active minimum. Micro-transactions
   * are unprofitable once processing fees are applied, so card top-ups enforce
   * the backend-provided floor.
   */
  const validateAmount = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    return !isNaN(numAmount) && numAmount >= minimumAmount
  }

  /**
   * Whether this amount is more than the account may still top up today.
   *
   * Prefers the REMAINING allowance over the flat per-level cap, and that is
   * the whole point. Checking each amount against the flat cap is why one
   * account paid $100, $80 and $60 against a $125 limit on 2026-08-16 without
   * the app objecting once — every amount is individually under $125, and the
   * client had no idea $180 was already spent. Two of those three were captured
   * by Fygaro and never credited.
   *
   * Falls back to the flat cap when the allowance cannot be established — or
   * when the one we are holding has been superseded by a reservation we know
   * was just minted (see `usableAllowance`) — which is strictly the old
   * behaviour: weaker, but the pre-charge check still refuses before any card
   * is charged.
   *
   * CARD ONLY, both halves of it — same as `dailyLimit` above. The Fygaro
   * allowance says nothing about a bank transfer or a Bridge deposit, and
   * applying it to them capped a $500 wire at whatever was left of a $125 card
   * allowance, with an alert quoting a limit note the non-card screen does not
   * even show.
   */
  const exceedsDailyLimit = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount)) return false
    if (isCard && usableAllowance) return numAmount > usableAllowance.remainingCents / 100
    return dailyLimit !== undefined && numAmount > dailyLimit
  }

  // "You'll receive" net preview — only for card top-ups, only when the fee
  // params are available, and only once the amount clears the enforced minimum.
  // A null fygaroTopup hides the line rather than showing a guessed (and wrong)
  // number; a below-minimum amount hides it too, as does a level-0 user (whose
  // card top-up Continue refuses outright) and a still-resolving level (which
  // may yet turn out to be 0), so we never promise a concrete receive figure
  // for a gross that Continue will refuse.
  const grossAmount = parseFloat(amount)
  const netAmount =
    isCard &&
    !cardBlockedForLevel &&
    !cardLevelPending &&
    !cardAllowancePending &&
    fygaroTopup &&
    !isNaN(grossAmount) &&
    grossAmount >= minimumAmount &&
    !exceedsDailyLimit(amount)
      ? estimateTopupNet(grossAmount, fygaroTopup)
      : null

  /**
   * Handles the continue button press.
   *
   * Validates amount and navigates to the appropriate payment flow:
   * - Card payment: Goes to CardPayment (WebView with Fygaro)
   * - Bank transfer: Goes to BankTransfer screen
   *
   * The wallet type and amount are passed to the next screen.
   * The wallet type will be included in the webhook metadata
   * to ensure the correct wallet is credited.
   */
  const handleContinue = async () => {
    // The card flow needs a resolved level before the level gate below can
    // run; the Continue button is already disabled while it loads, and this
    // guard backstops that.
    if (cardLevelPending || cardAllowancePending) {
      return
    }

    // Level-0 accounts cannot card top-up at all: the webhook fails CLOSED
    // for level 0 (no-daily-limit-for-level), so a level-0 charge would be
    // captured by Fygaro and stranded in manual review — the exact failure
    // this screen's pre-checks exist to prevent. The home screen already
    // hides the Transfer button for level 0 (home-screen/Buttons.tsx), but
    // that is a cross-file invariant this screen cannot rely on: refuse here
    // too, so a deep link (or a future un-hiding of that button) hits this
    // gate as well. The guarantee is: whenever the user's level RESOLVES to
    // 0 the charge is refused, and while an authed user's level is still
    // resolving the flow holds. If the level genuinely cannot be resolved
    // (level query failed), we degrade to the webhook's manual-review
    // fallback rather than hard-blocking on missing metadata.
    if (cardBlockedForLevel) {
      // Localised, like the body it sits above. A raw English title on a
      // translated message is the same half-fix as translating the success
      // path and leaving the failure path in English.
      Alert.alert(
        LL.TopupDetails.upgradeRequiredTitle(),
        LL.TopupDetails.upgradeRequired(),
      )
      return
    }

    if (!validateAmount(amount)) {
      Alert.alert(
        LL.TopupDetails.invalidAmountTitle(),
        LL.TopupDetails.minimumAmount({ amount: `$${minimumAmount.toFixed(2)}` }),
      )
      return
    }

    if (exceedsDailyLimit(amount)) {
      // Name the number the customer can act on. When the allowance is known
      // that is what is LEFT, not the flat cap — telling someone with $25 left
      // that their limit is $125 is how they retry the same amount and fail
      // again. The `dailyLimit !== undefined` guard that used to sit on this
      // branch is gone: it silently skipped the block whenever the level query
      // had failed but the allowance was perfectly readable.
      Alert.alert(
        LL.TopupDetails.cannotTopUp(),
        isCard && usableAllowance
          ? LL.TopupDetails.allowanceRemaining({
              remaining: `$${(usableAllowance.remainingCents / 100).toFixed(2)}`,
              limit: `$${(usableAllowance.limitCents / 100).toFixed(2)}`,
            })
          : LL.TopupDetails.dailyLimitAmount({
              amount: `$${(dailyLimit ?? 0).toFixed(2)}`,
            }),
      )
      return
    }

    setIsLoading(true)

    try {
      if (
        route.params.paymentType === "bankTransfer" ||
        route.params.paymentType === "bridge"
      ) {
        navigation.navigate("BankTransfer", {
          amount: parseFloat(amount),
          wallet: selectedWallet,
          paymentType: route.params.paymentType,
        })
      } else {
        // Card payment flow via Fygaro WebView.
        // Card top-ups credit the USD wallet only — the BTC option is not
        // offered for card payments, and the wallet is pinned here so the
        // Fygaro record (client_note) can never claim otherwise.
        navigation.navigate("CardPayment", {
          amount: parseFloat(amount),
          wallet: "USD",
        })
      }
    } catch (error) {
      Alert.alert(LL.common.error(), LL.TopupDetails.paymentSetupFailed())
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Wallet selection buttons configuration.
   *
   * Users can choose to credit either:
   * - USD wallet: Fiat balance for USD transactions
   * - BTC wallet: Bitcoin balance (amount converted at current rate)
   *
   * The selected wallet type is passed through the payment flow
   * and included in the webhook metadata to ensure correct crediting.
   */
  const walletButtons = [
    {
      id: "USD",
      text: LL.TopupDetails.usdWallet(),
      icon: {
        selected: <Cash width={30} height={30} />,
        normal: <Cash width={30} height={30} />,
      },
    },
  ]

  // Card top-ups are USD-only: Fygaro payments are recorded and credited in
  // USD, so the BTC wallet option is only offered for bank-transfer flows.
  if (persistentState.isAdvanceMode && route.params.paymentType !== "card") {
    walletButtons.push({
      id: "BTC",
      text: LL.TopupDetails.btcWallet(),
      icon: {
        selected: <Bitcoin width={30} height={30} />,
        normal: <Bitcoin width={30} height={30} />,
      },
    })
  }

  return (
    <Screen keyboardShouldPersistTaps="handled">
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {route.params.paymentType === "card"
            ? LL.TopupDetails.title()
            : route.params.paymentType === "bridge"
            ? LL.BankTransfer.virtualBankTransfer()
            : LL.TopupDetails.bankTransfer()}
        </Text>

        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.TopupDetails.wallet()}
          </Text>
          <ButtonGroup
            buttons={walletButtons}
            selectedId={selectedWallet}
            onPress={setSelectedWallet}
            style={styles.buttonGroup}
          />
          {route.params.paymentType === "card" && (
            <Text type="p3" style={styles.usdOnlyNote}>
              {LL.TopupDetails.usdOnlyNotice()}
            </Text>
          )}
        </View>

        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.TopupDetails.amount()}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={LL.TopupDetails.amountPlaceholder()}
            placeholderTextColor={colors.grey1}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            inputAccessoryViewID="topupAmountAccessory"
          />
          {Platform.OS === "ios" && (
            <InputAccessoryView nativeID="topupAmountAccessory">
              <View style={styles.keyboardAccessory}>
                <TouchableOpacity onPress={Keyboard.dismiss}>
                  <Text style={styles.doneButton}>Done</Text>
                </TouchableOpacity>
              </View>
            </InputAccessoryView>
          )}
          {isCard && usableAllowance ? (
            <>
              <Text type="p3" style={styles.limitNote}>
                {LL.TopupDetails.allowanceRemaining({
                  remaining: `$${(usableAllowance.remainingCents / 100).toFixed(2)}`,
                  limit: `$${(usableAllowance.limitCents / 100).toFixed(2)}`,
                })}
              </Text>
              {usableAllowance.heldCents > 0 && (
                // Without this line, "you have spent nothing and $65 is left of
                // $125" reads as a bug. The hold is the whole difference.
                <Text type="p3" style={styles.limitNote}>
                  {LL.TopupDetails.allowanceHeld({
                    held: `$${(usableAllowance.heldCents / 100).toFixed(2)}`,
                  })}
                </Text>
              )}
              {usableAllowance.heldCents > 0 && usableAllowance.holdsExpireAt && (
                // And the immediate follow-up question — "when do I get the
                // rest back?" — answered in the same breath, so nobody has to
                // guess whether the hold is minutes or days.
                <Text type="p3" style={styles.limitNote}>
                  {LL.TopupDetails.allowanceResets({
                    when: formatHoldExpiry(usableAllowance.holdsExpireAt),
                  })}
                </Text>
              )}
            </>
          ) : cardAllowancePending ? null : (
            dailyLimit !== undefined && (
              <Text type="p3" style={styles.limitNote}>
                {LL.TopupDetails.dailyLimitInfo({ amount: `$${dailyLimit.toFixed(2)}` })}
              </Text>
            )
          )}
          {route.params.paymentType === "bridge" && (
            <Text type="p3" style={styles.limitNote}>
              {LL.BankTransfer.achMinimumNotice()}
            </Text>
          )}
          {netAmount !== null && (
            <View style={styles.receiveInfo}>
              <Text type="p1" bold>
                {LL.TopupDetails.youllReceive({ amount: `$${netAmount.toFixed(2)}` })}
              </Text>
              <Text type="p3" style={styles.receiveNote}>
                {LL.TopupDetails.feeNote()}
              </Text>
            </View>
          )}
        </View>
      </View>
      <PrimaryBtn
        label={LL.TopupDetails.continue()}
        onPress={handleContinue}
        loading={isLoading || cardLevelPending || cardAllowancePending}
        btnStyle={styles.primaryButton}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => (props: { bottom: number }) => ({
  keyboardAccessory: {
    flexDirection: "row" as const,
    justifyContent: "flex-end" as const,
    alignItems: "center" as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.grey3,
  },
  doneButton: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center" as const,
    marginBottom: 30,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey3,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.black,
    marginTop: 8,
  },
  buttonGroup: {
    marginTop: 8,
  },
  usdOnlyNote: {
    marginTop: 8,
    color: colors.grey2,
  },
  limitNote: {
    marginTop: 8,
    color: colors.grey2,
  },
  receiveInfo: {
    marginTop: 12,
    rowGap: 2,
  },
  receiveNote: {
    color: colors.grey2,
  },
  primaryButton: {
    marginHorizontal: 20,
    marginBottom: Math.max(20, props.bottom),
  },
}))

export default TopupDetails
