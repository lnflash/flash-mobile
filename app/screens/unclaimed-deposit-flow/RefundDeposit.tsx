import React, { useEffect, useState } from "react"
import { View, ScrollView } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// components
import { Screen } from "@app/components/screen"
import { PrimaryBtn } from "@app/components/buttons"
import { DestinationField, Fees, SuccessModal } from "@app/components/refund-flow"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { refundDeposit, fetchRecommendedFees } from "@app/utils/breez-sdk"

type Props = StackScreenProps<RootStackParamList, "RefundDeposit">

type FeeType = "fast" | "medium" | "slow"

type FeeRates = {
  fast: number
  medium: number
  slow: number
}

const RefundDeposit: React.FC<Props> = ({ navigation, route }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const { deposit } = route.params

  const [destination, setDestination] = useState("")
  const [destinationStatus, setDestinationStatus] = useState<
    "entering" | "valid" | "invalid"
  >("entering")
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType>("medium")
  const [feeRates, setFeeRates] = useState<FeeRates>({ fast: 10, medium: 5, slow: 3 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string>()
  const [refundTxId, setRefundTxId] = useState<string>()
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  if (!convertMoneyAmount) return null

  useEffect(() => {
    loadRecommendedFees()
  }, [])

  const loadRecommendedFees = async () => {
    try {
      const fees = await fetchRecommendedFees()
      setFeeRates({
        fast: Number(fees.fastestFee),
        medium: Number(fees.halfHourFee),
        slow: Number(fees.hourFee),
      })
    } catch (err) {
      console.error("Failed to load recommended fees:", err)
      // Use fallback values already set in initial state
    }
  }

  const handleChangeText = (text: string) => {
    setDestination(text)
    setDestinationStatus("entering")
    setError(undefined)
  }

  const validateDestination = () => {
    if (!destination.trim()) {
      setDestinationStatus("invalid")
      setError("Please enter a destination address")
      return false
    }

    const trimmedAddress = destination.trim()
    if (trimmedAddress.length < 26 || trimmedAddress.length > 90) {
      setDestinationStatus("invalid")
      setError("Invalid Bitcoin address format")
      return false
    }

    setDestinationStatus("valid")
    setError(undefined)
    return true
  }

  const navigateToScanning = () => {
    navigation.navigate("scanningQRCode")
  }

  const handleSelectFee = (feeType: FeeType) => {
    setSelectedFeeType(feeType)
  }

  const handleRefund = async () => {
    // Validate destination before proceeding
    if (!validateDestination()) {
      return
    }

    setIsProcessing(true)
    setError(undefined)

    try {
      const selectedFeeRate = feeRates[selectedFeeType]
      const result = await refundDeposit(
        deposit,
        destination.trim(),
        BigInt(selectedFeeRate),
      )

      if (result.success && result.txId) {
        setRefundTxId(result.txId)
        setShowSuccessModal(true)
      } else {
        setError(result.error || "Refund failed")
      }
    } catch (err) {
      console.error("Refund error:", err)
      setError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setIsProcessing(false)
    }
  }

  const formattedAmount = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(
      toBtcMoneyAmount(Number(deposit.amountSats)),
      "USD" as any,
    ),
    walletAmount: toBtcMoneyAmount(Number(deposit.amountSats)),
  })

  // Estimate fee (rough estimate: ~200 vbytes for a refund tx)
  const selectedFeeRate = feeRates[selectedFeeType]
  const estimatedFeeSats = selectedFeeRate * 200
  const receivableAmount = Math.max(0, Number(deposit.amountSats) - estimatedFeeSats)

  const formattedFee = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(toBtcMoneyAmount(estimatedFeeSats), "USD" as any),
    walletAmount: toBtcMoneyAmount(estimatedFeeSats),
  })

  const formattedReceivable = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(toBtcMoneyAmount(receivableAmount), "USD" as any),
    walletAmount: toBtcMoneyAmount(receivableAmount),
  })

  const isFormValid = destinationStatus === "valid" && !isProcessing

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          {LL.RefundFlow.refundTitle?.() || "Refund Deposit"}
        </Text>
        <Text style={styles.subtitle}>
          {LL.RefundFlow.enterAddress?.() ||
            "Enter your Bitcoin address to receive the refund"}
        </Text>

        {/* Destination Field */}
        <View style={styles.section}>
          <DestinationField
            destination={destination}
            status={destinationStatus}
            validateDestination={validateDestination}
            handleChangeText={handleChangeText}
            setDestination={setDestination}
            navigateToScanning={navigateToScanning}
          />
        </View>

        {/* Amount Display */}
        <View style={styles.section}>
          <Text style={styles.label}>{LL.SendBitcoinScreen.amount()}</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountText}>{formattedAmount}</Text>
          </View>
        </View>

        {/* Fee Selection */}
        <View style={styles.section}>
          <Fees selectedFeeType={selectedFeeType} onSelectFee={handleSelectFee} />
        </View>

        {/* Confirmation Card with Fee Breakdown */}
        <View style={styles.confirmationCard}>
          <Text style={styles.confirmationTitle}>
            {LL.RefundFlow.confirmRefund?.() || "Confirm Refund"}
          </Text>
          <View style={styles.feeBreakdown}>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabel}>Deposit Amount</Text>
              <Text style={styles.feeRowValue}>{formattedAmount}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabel}>
                Network Fee ({selectedFeeRate} sat/vB)
              </Text>
              <Text style={styles.feeRowValue}>-{formattedFee}</Text>
            </View>
            <View style={[styles.feeRow, styles.totalRow]}>
              <Text style={styles.feeRowLabelBold}>You'll Receive</Text>
              <Text style={styles.feeRowValueBold}>{formattedReceivable}</Text>
            </View>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <PrimaryBtn
            label={
              isProcessing
                ? LL.RefundFlow.processing?.() || "Processing..."
                : LL.RefundFlow.confirmRefund?.() || "Confirm Refund"
            }
            onPress={handleRefund}
            loading={isProcessing}
            disabled={!isFormValid}
          />
          <View style={{ height: 12 }} />
          <PrimaryBtn
            type="outline"
            label={LL.common.cancel()}
            onPress={() => navigation.goBack()}
            disabled={isProcessing}
          />
        </View>
      </ScrollView>

      {/* Success Modal */}
      <SuccessModal
        txId={refundTxId}
        isVisible={showSuccessModal}
        setIsVisible={setShowSuccessModal}
      />
    </Screen>
  )
}

export default RefundDeposit

const useStyles = makeStyles(({ colors }) => ({
  screenStyle: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.grey1,
    marginBottom: 8,
  },
  amountContainer: {
    backgroundColor: colors.grey5,
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  amountText: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.black,
  },
  confirmationCard: {
    backgroundColor: colors.grey5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  confirmationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
    marginBottom: 12,
  },
  feeBreakdown: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 12,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.grey3,
    paddingTop: 8,
    marginTop: 4,
    marginBottom: 0,
  },
  feeRowLabel: {
    fontSize: 14,
    color: colors.grey1,
  },
  feeRowValue: {
    fontSize: 14,
    color: colors.grey1,
  },
  feeRowLabelBold: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
  },
  feeRowValueBold: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
  },
  errorBox: {
    backgroundColor: colors.error + "20",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: "auto",
    paddingTop: 20,
  },
}))
