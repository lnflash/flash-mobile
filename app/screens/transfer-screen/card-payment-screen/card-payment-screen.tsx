import React, { useState, useEffect } from "react"
import { View, TextInput, Alert } from "react-native"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { ButtonGroup } from "@app/components/button-group"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useSafeAreaInsets } from "react-native-safe-area-context"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

type CardPaymentScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "cardPayment">
}

const CardPaymentScreen: React.FC<CardPaymentScreenProps> = ({ navigation }) => {
  const { bottom } = useSafeAreaInsets()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const isAuthed = useIsAuthed()
  const styles = useStyles()

  const [email, setEmail] = useState("")
  const [selectedWallet, setSelectedWallet] = useState("USD")
  const [amount, setAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const { data } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
  })

  useEffect(() => {
    if (data?.me?.email?.address) {
      setEmail(data.me.email.address)
    }
  }, [data])

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validateAmount = (amount: string): boolean => {
    const numAmount = parseFloat(amount)
    return !isNaN(numAmount) && numAmount >= 1.0
  }

  const handleContinue = async () => {
    if (!validateEmail(email)) {
      Alert.alert("Invalid Email", LL.CardPaymentScreen.invalidEmail())
      return
    }

    if (!validateAmount(amount)) {
      Alert.alert("Invalid Amount", LL.CardPaymentScreen.minimumAmount())
      return
    }

    setIsLoading(true)

    try {
      // Mock API call to initiate payment
      const username = data?.me?.username || "user"
      const paymentUrl = `https://fygaro.com/en/pb/bd4a34c1-3d24-4315-a2b8-627518f70916?amount=${amount}&client_reference=${username}`
      const sessionId = `session_${Date.now()}`

      // Simulate API delay
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 1000)
      })

      navigation.navigate("fygaroWebView", {
        amount: parseFloat(amount),
        email,
        wallet: selectedWallet,
        sessionId,
        paymentUrl,
        username,
      })
    } catch (error) {
      Alert.alert("Error", "Failed to initiate payment. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const walletButtons = [
    {
      id: "USD",
      text: LL.CardPaymentScreen.usdWallet(),
      icon: {
        selected: <Cash width={30} height={30} />,
        normal: <Cash width={30} height={30} />,
      },
    },
    {
      id: "BTC",
      text: LL.CardPaymentScreen.btcWallet(),
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
          {LL.CardPaymentScreen.title()}
        </Text>
        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.CardPaymentScreen.email()}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={LL.CardPaymentScreen.emailPlaceholder()}
            placeholderTextColor={colors.grey1}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text type="p1" bold>
            {LL.CardPaymentScreen.wallet()}
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
            {LL.CardPaymentScreen.amount()}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={LL.CardPaymentScreen.amountPlaceholder()}
            placeholderTextColor={colors.grey1}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>
      </View>
      <PrimaryBtn
        label={LL.CardPaymentScreen.continue()}
        onPress={handleContinue}
        loading={isLoading}
        btnStyle={{ marginHorizontal: 20, marginBottom: bottom + 20 }}
      />
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    textAlign: "center",
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
}))

export default CardPaymentScreen
