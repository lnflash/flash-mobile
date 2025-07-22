import React from "react"
import { View } from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { PrimaryBtn } from "@app/components/buttons"

type PaymentSuccessScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, "paymentSuccess">
  route: RouteProp<RootStackParamList, "paymentSuccess">
}

const PaymentSuccessScreen: React.FC<PaymentSuccessScreenProps> = () => {
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<RootStackParamList, "paymentSuccess">>()
  const styles = useStyles()

  const { amount, wallet, transactionId } = route.params

  const handleDone = () => {
    // Navigate back to home screen
    navigation.navigate("Primary")
  }

  const handleViewTransaction = () => {
    // TODO: Navigate to transaction details
    console.log("Navigate to transaction details:", transactionId)
    handleDone()
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={[styles.successIcon, { color: colors.success }]}>✓</Text>

          <Text type="h1" style={styles.title}>
            {LL.PaymentSuccessScreen.title()}
          </Text>

          <Text type="p1" style={[styles.message, { color: colors.grey1 }]}>
            {LL.PaymentSuccessScreen.successMessage()}
          </Text>

          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text type="p1" style={[styles.detailLabel, { color: colors.grey1 }]}>
                {LL.PaymentSuccessScreen.amountSent()}:
              </Text>
              <Text type="p1" style={[styles.detailValue, { color: colors.black }]}>
                ${amount.toFixed(2)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text type="p1" style={[styles.detailLabel, { color: colors.grey1 }]}>
                {LL.PaymentSuccessScreen.depositedTo()}:
              </Text>
              <Text type="p1" style={[styles.detailValue, { color: colors.black }]}>
                {wallet} Wallet
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text type="p1" style={[styles.detailLabel, { color: colors.grey1 }]}>
                {LL.PaymentSuccessScreen.transactionId()}:
              </Text>
              <Text type="p1" style={[styles.detailValue, { color: colors.black }]}>
                {transactionId}
              </Text>
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <PrimaryBtn
              label={LL.PaymentSuccessScreen.viewTransaction()}
              onPress={handleViewTransaction}
              type="outline"
              btnStyle={styles.secondaryButton}
            />

            <PrimaryBtn
              label={LL.PaymentSuccessScreen.done()}
              onPress={handleDone}
              btnStyle={styles.primaryButton}
            />
          </View>
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  successContainer: {
    alignItems: "center",
    width: "100%",
  },
  successIcon: {
    fontSize: 80,
    marginBottom: 20,
    textAlign: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: 16,
  },
  message: {
    textAlign: "center",
    marginBottom: 32,
  },
  detailsContainer: {
    width: "100%",
    backgroundColor: colors.grey5,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  detailLabel: {
    flex: 1,
  },
  detailValue: {
    fontWeight: "600",
    textAlign: "right",
  },
  buttonContainer: {
    width: "100%",
    gap: 16,
  },
  primaryButton: {
    marginTop: 8,
  },
  secondaryButton: {
    marginTop: 8,
  },
}))

export default PaymentSuccessScreen
