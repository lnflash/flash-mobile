import React, { useState } from "react"
import { View, ScrollView } from "react-native"
import { makeStyles, Text } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { claimDeposit } from "@app/utils/breez-sdk"

type Props = StackScreenProps<RootStackParamList, "UnclaimedDepositDetails">

const UnclaimedDepositDetails: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const { deposit } = route.params

  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string>()

  if (!convertMoneyAmount) return null

  const claimError = deposit.claimError
  const isFeeError = claimError?.tag === "MaxDepositClaimFeeExceeded"
  const requiredFeeSats = isFeeError
    ? ((claimError.inner as any).requiredFeeSats as bigint)
    : undefined

  const handleClaim = async () => {
    if (!requiredFeeSats) return

    setIsProcessing(true)
    setError(undefined)

    try {
      const result = await claimDeposit(deposit, requiredFeeSats)

      if (result.success) {
        navigation.goBack()
      } else {
        setError(result.error || LL.RefundFlow.failedToClaim())
      }
    } catch (err) {
      console.error("Claim error:", err)
      setError(err instanceof Error ? err.message : LL.RefundFlow.unknownError())
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRefund = () => {
    navigation.navigate("RefundDeposit", { deposit })
  }

  const formattedAmount = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(
      toBtcMoneyAmount(Number(deposit.amountSats)),
      DisplayCurrency,
    ),
    walletAmount: toBtcMoneyAmount(Number(deposit.amountSats)),
  })

  const formattedFee = requiredFeeSats
    ? formatDisplayAndWalletAmount({
        displayAmount: convertMoneyAmount(
          toBtcMoneyAmount(Number(requiredFeeSats)),
          DisplayCurrency,
        ),
        walletAmount: toBtcMoneyAmount(Number(requiredFeeSats)),
      })
    : null

  const receivableAmount = requiredFeeSats
    ? Number(deposit.amountSats) - Number(requiredFeeSats)
    : Number(deposit.amountSats)

  const formattedReceivable = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(toBtcMoneyAmount(receivableAmount), DisplayCurrency),
    walletAmount: toBtcMoneyAmount(receivableAmount),
  })

  const getErrorExplanation = () => {
    if (claimError?.tag === "MissingUtxo") {
      return LL.RefundFlow.missingUtxo()
    }
    if (claimError?.tag === "Generic" && claimError.inner?.message) {
      return claimError.inner.message
    }
    return LL.RefundFlow.couldNotClaimAutomatically()
  }

  return (
    <Screen preset="fixed" style={styles.screenStyle}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Amount */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LL.SendBitcoinScreen.amount()}</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountText}>{formattedAmount}</Text>
          </View>
        </View>

        {/* Transaction ID */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{LL.RefundFlow.txId()}</Text>
          <View style={styles.fieldBackground}>
            <Text style={styles.txIdText} numberOfLines={1} ellipsizeMode="middle">
              {deposit.txid}
            </Text>
          </View>
        </View>

        {/* Scenario: Fee too high — Approve or Reject */}
        {isFeeError && requiredFeeSats !== undefined && (
          <>
            <View style={styles.section}>
              <View style={styles.feeBreakdown}>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{LL.SendBitcoinScreen.amount()}</Text>
                  <Text style={styles.feeValue}>{formattedAmount}</Text>
                </View>
                <View style={styles.feeRow}>
                  <Text style={styles.feeLabel}>{LL.RefundFlow.networkFee()}</Text>
                  <Text style={styles.feeValue}>-{formattedFee}</Text>
                </View>
                <View style={[styles.feeRow, styles.totalRow]}>
                  <Text style={styles.feeLabelBold}>{LL.RefundFlow.youReceive()}</Text>
                  <Text style={styles.feeValueBold}>{formattedReceivable}</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{LL.RefundFlow.approveFee()}</Text>
            </View>

            <View style={styles.buttonRow}>
              <View style={styles.halfButton}>
                <PrimaryBtn
                  type="outline"
                  label={LL.RefundFlow.refund()}
                  onPress={handleRefund}
                  disabled={isProcessing}
                />
              </View>
              <View style={styles.halfButton}>
                <PrimaryBtn
                  label={LL.RefundFlow.approve()}
                  onPress={handleClaim}
                  loading={isProcessing}
                  disabled={isProcessing}
                />
              </View>
            </View>
          </>
        )}

        {/* Scenario: Generic / MissingUtxo — show error + Refund */}
        {!!claimError && !isFeeError && (
          <>
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>{LL.RefundFlow.claimFailed()}</Text>
              <Text style={styles.warningText}>{getErrorExplanation()}</Text>
              <Text style={[styles.warningText, { marginTop: 5 }]}>
                {LL.RefundFlow.refundToExternalWallet()}
              </Text>
            </View>

            <PrimaryBtn label={LL.RefundFlow.refund()} onPress={handleRefund} />
          </>
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

export default UnclaimedDepositDetails

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.grey1,
    marginBottom: 8,
  },
  amountContainer: {
    backgroundColor: colors.grey5,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  amountText: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.black,
  },
  fieldBackground: {
    backgroundColor: colors.grey5,
    padding: 12,
    borderRadius: 8,
  },
  txIdText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: colors.grey1,
  },
  feeBreakdown: {
    backgroundColor: colors.grey5,
    padding: 16,
    borderRadius: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.grey3,
    paddingTop: 12,
    marginTop: 4,
    marginBottom: 0,
  },
  feeLabel: {
    fontSize: 14,
    color: colors.grey1,
  },
  feeValue: {
    fontSize: 14,
    color: colors.grey1,
  },
  feeLabelBold: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
  },
  feeValueBold: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
  },
  infoBox: {
    backgroundColor: colors.primary + "20",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: colors.black,
    textAlign: "center",
  },
  warningBox: {
    backgroundColor: colors.warning + "20",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.warning,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: colors.black,
  },
  errorBox: {
    backgroundColor: colors.error + "20",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  halfButton: {
    flex: 1,
  },
}))
