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

import React, { useState } from "react"
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
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ButtonGroup } from "@app/components/button-group"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { usePersistentStateContext } from "@app/store/persistent-state"
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
  // manual review. Unknown level (NonAuth) or null fygaroTopup degrades to
  // "no client-side cap": the server still gates, and blocking top-ups on
  // missing metadata would be worse than a manual-review fallback.
  // AccountLevel.Zero is NOT part of that degrade path — the webhook fails
  // CLOSED for level 0 (no-daily-limit-for-level), so handleContinue refuses
  // card top-ups for level 0 outright rather than letting the charge be
  // captured and stranded.
  const { fygaroTopup, dailyLimit: levelDailyLimit, currentLevel } = useCardTopupLimit()

  // Card flow enforces the backend minimum (default $10); other flows keep the
  // long-standing $1 floor.
  const minimumAmount = isCard ? fygaroTopup?.minimumAmount ?? DEFAULT_CARD_MINIMUM : 1

  // Level-0 accounts cannot card top-up at all — see the comment in
  // handleContinue. Shared between the Continue refusal and the net-preview
  // gate so the screen never promises a receive figure Continue will refuse.
  const cardBlockedForLevel = isCard && currentLevel === AccountLevel.Zero

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

  const exceedsDailyLimit = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    return dailyLimit !== undefined && !isNaN(numAmount) && numAmount > dailyLimit
  }

  // "You'll receive" net preview — only for card top-ups, only when the fee
  // params are available, and only once the amount clears the enforced minimum.
  // A null fygaroTopup hides the line rather than showing a guessed (and wrong)
  // number; a below-minimum amount hides it too, as does a level-0 user (whose
  // card top-up Continue refuses outright), so we never promise a concrete
  // receive figure for a gross that Continue will refuse.
  const grossAmount = parseFloat(amount)
  const netAmount =
    isCard &&
    !cardBlockedForLevel &&
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
    // Level-0 accounts cannot card top-up at all: the webhook fails CLOSED
    // for level 0 (no-daily-limit-for-level), so a level-0 charge would be
    // captured by Fygaro and stranded in manual review — the exact failure
    // this screen's pre-checks exist to prevent. The home screen already
    // hides the Transfer button for level 0 (home-screen/Buttons.tsx), but
    // that is a cross-file invariant this screen cannot rely on: refuse here
    // too so a deep link (or a future un-hiding of that button) can never
    // charge a level-0 card.
    if (cardBlockedForLevel) {
      Alert.alert("Upgrade Required", LL.TopupDetails.upgradeRequired())
      return
    }

    if (!validateAmount(amount)) {
      Alert.alert(
        "Invalid Amount",
        LL.TopupDetails.minimumAmount({ amount: `$${minimumAmount.toFixed(2)}` }),
      )
      return
    }

    if (exceedsDailyLimit(amount) && dailyLimit !== undefined) {
      Alert.alert(
        "Invalid Amount",
        LL.TopupDetails.dailyLimitAmount({ amount: `$${dailyLimit.toFixed(2)}` }),
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
      Alert.alert("Error", "Failed to initiate payment. Please try again.")
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
          {dailyLimit !== undefined && (
            <Text type="p3" style={styles.limitNote}>
              {LL.TopupDetails.dailyLimitInfo({ amount: `$${dailyLimit.toFixed(2)}` })}
            </Text>
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
        loading={isLoading}
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
