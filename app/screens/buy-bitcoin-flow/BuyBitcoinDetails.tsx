/**
 * BuyBitcoinDetails Component
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
import { View, TextInput, Alert } from "react-native"
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

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

type Props = StackScreenProps<RootStackParamList, "BuyBitcoinDetails">

const BuyBitcoinDetails: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { bottom } = useSafeAreaInsets()
  const styles = useStyles()({ bottom })

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

  /**
   * Validates the entered amount.
   * Minimum topup amount is $1.00 to prevent micro-transactions
   * that would be unprofitable due to processing fees.
   */
  const validateAmount = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    return !isNaN(numAmount) && numAmount >= 1.0
  }

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
    if (!validateAmount(amount)) {
      Alert.alert("Invalid Amount", LL.BuyBitcoinDetails.minimumAmount())
      return
    }

    setIsLoading(true)

    try {
      if (route.params.paymentType === "bankTransfer") {
        navigation.navigate("BankTransfer", {
          amount: parseFloat(amount),
          wallet: selectedWallet,
        })
      } else {
        // Card payment flow via Fygaro WebView
        navigation.navigate("CardPayment", {
          amount: parseFloat(amount),
          wallet: selectedWallet, // Will be sent to webhook via metadata
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
      text: LL.BuyBitcoinDetails.usdWallet(),
      icon: {
        selected: <Cash width={30} height={30} />,
        normal: <Cash width={30} height={30} />,
      },
    },
    {
      id: "BTC",
      text: LL.BuyBitcoinDetails.btcWallet(),
      icon: {
        selected: <Bitcoin width={30} height={30} />,
        normal: <Bitcoin width={30} height={30} />,
      },
    },
  ]

  return (
    <Screen>
      <View style={styles.container}>
        <Text type="h02" bold style={styles.title}>
          {route.params.paymentType === "card"
            ? LL.BuyBitcoinDetails.title()
            : LL.BuyBitcoinDetails.bankTransfer()}
        </Text>

        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.BuyBitcoinDetails.wallet()}
          </Text>
          <ButtonGroup
            buttons={walletButtons}
            selectedId={selectedWallet}
            onPress={setSelectedWallet}
            style={styles.buttonGroup}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.BuyBitcoinDetails.amount()}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={LL.BuyBitcoinDetails.amountPlaceholder()}
            placeholderTextColor={colors.grey1}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>
      </View>
      <PrimaryBtn
        label={LL.BuyBitcoinDetails.continue()}
        onPress={handleContinue}
        loading={isLoading}
        btnStyle={styles.primaryButton}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => (props: { bottom: number }) => ({
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
  primaryButton: {
    marginHorizontal: 20,
    marginBottom: Math.max(20, props.bottom),
  },
}))

export default BuyBitcoinDetails
