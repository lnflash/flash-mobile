import React from "react"
import { View, ActivityIndicator } from "react-native"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { Screen } from "@app/components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { PrimaryBtn } from "@app/components/buttons"
import { useFygaroTopupStatus } from "@app/hooks/use-fygaro-topup-status"

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

  const { amount, wallet, checkoutId } = route.params
  // What the BACKEND says happened, not what the payment page implied.
  const resolution = useFygaroTopupStatus(checkoutId)

  const handleDone = () => {
    // Navigate back to home screen
    navigation.navigate("Primary")
  }

  const credited = resolution.phase === "credited"
  const checking = resolution.phase === "checking"
  const held = resolution.phase === "held"
  const failed = resolution.phase === "failed"
  // Held and failed share an icon and a colour, and nothing else: they are the
  // two phases where the money is not on its way to the wallet.
  const stalled = held || failed

  // The headline is the one thing this screen got wrong before: it claimed a
  // completed deposit off a Fygaro redirect. Each branch now says only what is
  // actually known at that moment.
  const title = checking
    ? LL.PaymentSuccessScreen.checkingTitle()
    : credited
    ? LL.PaymentSuccessScreen.title()
    : held
    ? LL.PaymentSuccessScreen.heldTitle()
    : failed
    ? LL.PaymentSuccessScreen.failedTitle()
    : LL.PaymentSuccessScreen.receivedTitle()

  // `reason` is Maybe<String> — the backend sends one when the state needs one,
  // and null otherwise. Held and failed therefore need their OWN fallbacks:
  // falling through to pendingMessage told customers whose payment was frozen
  // for manual review that we were "crediting your wallet", which is the exact
  // class of false claim this screen exists to remove.
  const message = checking
    ? LL.PaymentSuccessScreen.checkingMessage()
    : credited
    ? LL.PaymentSuccessScreen.successMessage()
    : held
    ? resolution.reason ?? LL.PaymentSuccessScreen.heldMessage()
    : failed
    ? resolution.reason ?? LL.PaymentSuccessScreen.failedMessage()
    : LL.PaymentSuccessScreen.pendingMessage()

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.successContainer}>
          {checking ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Text
              style={[
                styles.successIcon,
                {
                  color: credited
                    ? colors.success
                    : stalled
                    ? colors.error
                    : colors.warning,
                },
              ]}
            >
              {/* A clock says "on its way". Held and failed are not on their
                  way, so they must not wear the waiting icon. */}
              {credited ? "✓" : stalled ? "⚠" : "⏱"}
            </Text>
          )}

          <Text type="h1" style={styles.title}>
            {title}
          </Text>

          <Text type="p1" style={[styles.message, { color: colors.grey1 }]}>
            {message}
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
                {/* Three labels, because there are three truths. Credited: the
                    money is there. Pending: it is on its way. Held or failed:
                    it is neither, so the row may only name the wallet — the
                    headline says "Payment on hold" and "Crediting to" one row
                    below it would put the claim straight back on the screen. */}
                {credited
                  ? LL.PaymentSuccessScreen.depositedTo()
                  : stalled
                  ? LL.PaymentSuccessScreen.wallet()
                  : LL.PaymentSuccessScreen.destinationWallet()}
                :
              </Text>
              <Text type="p1" style={[styles.detailValue, { color: colors.black }]}>
                {wallet} Wallet
              </Text>
            </View>

            {credited && resolution.netAmountCents !== undefined && (
              <View style={styles.detailRow}>
                <Text type="p1" style={[styles.detailLabel, { color: colors.grey1 }]}>
                  {LL.PaymentSuccessScreen.amountCredited()}:
                </Text>
                <Text type="p1" style={[styles.detailValue, { color: colors.black }]}>
                  ${(resolution.netAmountCents / 100).toFixed(2)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
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
}))

export default PaymentSuccessScreen
