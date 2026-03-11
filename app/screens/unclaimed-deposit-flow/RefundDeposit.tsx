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
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
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
    }
  }

  const handleChangeText = (text: string) => {
    setDestination(text)
    setDestinationStatus("entering")
    setError(undefined)
  }

  const validateDestination = (): boolean => {
    const trimmed = destination.trim()
    if (!trimmed) {
      setDestinationStatus("invalid")
      setError(LL.RefundFlow.enterDestinationAddress())
      return false
    }
    if (trimmed.length < 26 || trimmed.length > 90) {
      setDestinationStatus("invalid")
      setError(LL.RefundFlow.invalidBitcoinAddress())
      return false
    }
    setDestinationStatus("valid")
    setError(undefined)
    return true
  }

  const navigateToScanning = () => {
    navigation.navigate("scanningQRCode")
  }

  const handleRefund = async () => {
    if (!validateDestination()) return

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
        setError(result.error || LL.RefundFlow.refundFailed())
      }
    } catch (err) {
      console.error("Refund error:", err)
      setError(err instanceof Error ? err.message : LL.RefundFlow.unknownError())
    } finally {
      setIsProcessing(false)
    }
  }

  // --- Formatted values ---

  const formattedAmount = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(
      toBtcMoneyAmount(Number(deposit.amountSats)),
      DisplayCurrency,
    ),
    walletAmount: toBtcMoneyAmount(Number(deposit.amountSats)),
  })

  const selectedFeeRate = feeRates[selectedFeeType]
  const ESTIMATED_TX_VBYTES = 140
  const estimatedFeeSats = selectedFeeRate * ESTIMATED_TX_VBYTES
  const receivableAmount = Math.max(0, Number(deposit.amountSats) - estimatedFeeSats)

  const formattedFee = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(
      toBtcMoneyAmount(estimatedFeeSats),
      DisplayCurrency,
    ),
    walletAmount: toBtcMoneyAmount(estimatedFeeSats),
  })

  const formattedReceivable = formatDisplayAndWalletAmount({
    displayAmount: convertMoneyAmount(
      toBtcMoneyAmount(receivableAmount),
      DisplayCurrency,
    ),
    walletAmount: toBtcMoneyAmount(receivableAmount),
  })

  return (
    <Screen preset="scroll" style={styles.screenStyle}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Destination */}
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

        {/* Amount */}
        <View style={styles.section}>
          <Text style={styles.label}>{LL.SendBitcoinScreen.amount()}</Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amountText}>{formattedAmount}</Text>
          </View>
        </View>

        {/* Fee Selection */}
        <View style={styles.section}>
          <Fees
            wrapperStyle={styles.feesWrapper}
            selectedFeeType={selectedFeeType}
            onSelectFee={setSelectedFeeType}
          />
        </View>

        {/* Fee Breakdown */}
        <View style={styles.feeBreakdown}>
          <View style={styles.feeRow}>
            <Text style={styles.feeRowLabel}>{LL.SendBitcoinScreen.amount()}</Text>
            <Text style={styles.feeRowValue}>{formattedAmount}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeRowLabel}>
              {LL.RefundFlow.estimatedFee({ feeRate: String(selectedFeeRate) })}
            </Text>
            <Text style={styles.feeRowValue}>~{formattedFee}</Text>
          </View>
          <View style={[styles.feeRow, styles.totalRow]}>
            <Text style={styles.feeRowLabelBold}>{LL.RefundFlow.estimatedReceive()}</Text>
            <Text style={styles.feeRowValueBold}>~{formattedReceivable}</Text>
          </View>
        </View>

        <Text style={styles.disclaimerText}>{LL.RefundFlow.feeEstimateDisclaimer()}</Text>

        <PrimaryBtn
          label={LL.RefundFlow.confirmRefund()}
          onPress={handleRefund}
          loading={isProcessing}
          disabled={isProcessing}
        />

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

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
  section: {
    marginBottom: 20,
  },
  feesWrapper: {
    marginTop: 0,
    marginBottom: 0,
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
    borderRadius: 12,
    alignItems: "center",
  },
  amountText: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.black,
  },
  feeBreakdown: {
    backgroundColor: colors.grey5,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
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
  disclaimerText: {
    fontSize: 12,
    color: colors.grey1,
    textAlign: "center",
    marginBottom: 20,
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
  buttonContainer: {
    marginTop: "auto",
    paddingTop: 20,
  },
  spacer: {
    height: 12,
  },
}))
