import React, { useState, useEffect } from "react"
import { View, TextInput, Alert, ScrollView } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { PrimaryBtn } from "@app/components/buttons"
import { ButtonGroup } from "@app/components/button-group"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"

type CardPaymentScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "cardPayment">
}

const CardPaymentScreen: React.FC<CardPaymentScreenProps> = () => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
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
    // Pre-populate email if available
    if (data?.me?.email?.address) {
      setEmail(data.me.email.address)
    }
  }, [data])

  if (!isAuthed) {
    navigation.goBack()
    return null
  }

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
        selected: <Cash color={colors.primary} width={20} height={20} />,
        normal: <Cash color={colors.grey1} width={20} height={20} />,
      },
    },
    {
      id: "BTC",
      text: LL.CardPaymentScreen.btcWallet(),
      icon: {
        selected: <Bitcoin color={colors.primary} width={20} height={20} />,
        normal: <Bitcoin color={colors.grey1} width={20} height={20} />,
      },
    },
  ]

  return (
    <Screen>
      <ScrollView style={styles.scrollView}>
        <View style={styles.container}>
          <Text type="h1" style={styles.title}>
            {LL.CardPaymentScreen.title()}
          </Text>

          <View style={styles.formContainer}>
            <View style={styles.fieldContainer}>
              <Text type="p1" style={styles.label}>
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
              <Text type="p1" style={styles.label}>
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
              <Text type="p1" style={styles.label}>
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

            <PrimaryBtn
              label={LL.CardPaymentScreen.continue()}
              onPress={handleContinue}
              loading={isLoading}
              btnStyle={styles.continueButton}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    textAlign: "center",
    marginBottom: 40,
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
  },
  fieldContainer: {
    marginBottom: 24,
  },
  label: {
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey3,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: colors.white,
    color: colors.black,
  },
  buttonGroup: {
    marginTop: 8,
  },
  continueButton: {
    marginTop: 32,
  },
}))

export default CardPaymentScreen
