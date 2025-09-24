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

  const [selectedWallet, setSelectedWallet] = useState("USD")
  const [amount, setAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const validateAmount = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    return !isNaN(numAmount) && numAmount >= 1.0
  }

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
        navigation.navigate("CardPayment", {
          amount: parseFloat(amount),
          wallet: selectedWallet,
        })
      }
    } catch (error) {
      Alert.alert("Error", "Failed to initiate payment. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

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
