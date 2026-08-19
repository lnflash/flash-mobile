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
  // Held and failed share a COLOUR, and nothing else: they are the two phases
  // where something is known to have gone wrong.
  const stalled = held || failed
  // No payment observed. Distinct from `pending` — which means the provider
  // told us it HAS the payment — because the page closes on a decline exactly
  // as it does on a success.
  const unconfirmed = resolution.phase === "unconfirmed"
  // A legacy device-built link: there is no checkout id, so nobody was asked.
  // The redirect is evidence the CARD was charged and evidence of nothing
  // else, so this phase may say "received" and must not say "crediting".
  const unaskable = resolution.phase === "unaskable"
  // The screen may only imply money is moving to the wallet in the two phases
  // where it actually is. Everything else — held, failed, unconfirmed, and
  // "still checking" — must stay neutral, because a clock icon and a "Crediting
  // to" row are each the same assertion the headline is carefully not making.
  // Enumerated as an ALLOWLIST rather than `!stalled`, so a phase added later
  // has to opt IN to claiming a credit: `unconfirmed` was added to this hook
  // after the label was written and silently inherited "Crediting to: USD
  // Wallet" under the headline "We haven't seen this payment yet".
  //
  // `unaskable` is deliberately NOT on it. It is the phase every card top-up
  // in production lands in while the signed checkout is off, and "Crediting
  // to" there is a claim made without asking anyone.
  const claimsCredit = credited || resolution.phase === "pending"

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
    : unconfirmed
    ? LL.PaymentSuccessScreen.unconfirmedTitle()
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
    : unconfirmed
    ? LL.PaymentSuccessScreen.unconfirmedMessage()
    : unaskable
    ? // "We'll confirm it", not "we are crediting your wallet": nothing has
      // been asked and nothing has answered. `pendingMessage` is correct for a
      // real PROCESSING answer, where the backend has actually said it is
      // crediting; it is not correct for "we have no id and cannot ask".
      LL.PaymentSuccessScreen.unaskableMessage()
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
              {/* A clock says "on its way". Only `pending` is — held, failed,
                  unconfirmed and unaskable are not, so none of them may wear
                  the waiting icon. The COLOUR splits differently on purpose:
                  unconfirmed and unaskable are not errors, nothing is known to
                  have gone wrong. */}
              {credited ? "✓" : claimsCredit ? "⏱" : "⚠"}
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
                    money is there. Pending: it is on its way. Anything else —
                    held, failed, unconfirmed, unaskable, still checking — is
                    neither, so the row may only name the wallet. "Payment on
                    hold" (or "We haven't seen this payment yet") with
                    "Crediting to" one row below it puts the claim straight back
                    on the screen. */}
                {credited
                  ? LL.PaymentSuccessScreen.depositedTo()
                  : claimsCredit
                  ? LL.PaymentSuccessScreen.destinationWallet()
                  : LL.PaymentSuccessScreen.wallet()}
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
