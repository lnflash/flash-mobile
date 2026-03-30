import React from "react"
import {
  Linking,
  TouchableWithoutFeedback,
  View,
  TouchableOpacity,
  ScrollView,
} from "react-native"
import { makeStyles, Text, useTheme, Card } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import Icon from "react-native-vector-icons/Ionicons"
import { useNavigation } from "@react-navigation/native"
import moment from "moment"

// components
import { IconTransaction } from "../../components/icon-transactions"
import { Screen } from "../../components/screen"

// hooks
import { useAppConfig, useDisplayCurrency, usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"

// utils | types
import { toBtcMoneyAmount } from "@app/types/amounts"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import {
  PaymentType,
  PaymentStatus,
  PaymentDetails_Tags,
  PaymentMethod,
} from "@breeztech/breez-sdk-spark-react-native"

type RowProps = {
  entry: string
  value?: string | JSX.Element
  isOnChain?: boolean
  content?: JSX.Element
}

const Row = ({ entry, value, isOnChain, content }: RowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <View style={styles.rowContainer}>
      <View style={styles.entryContainer}>
        <Text style={styles.entryLabel} type="p2">
          {entry}
        </Text>
        {isOnChain && (
          <Icon
            name="open-outline"
            size={16}
            color={colors.primary}
            style={styles.externalIcon}
          />
        )}
      </View>
      {content || (
        <View style={styles.valueContainer}>
          <Text selectable style={styles.valueText} type="p1">
            {value}
          </Text>
        </View>
      )}
    </View>
  )
}

const getStatusText = (status: PaymentStatus) => {
  switch (status) {
    case PaymentStatus.Completed:
      return "Completed"
    case PaymentStatus.Pending:
      return "Pending"
    case PaymentStatus.Failed:
      return "Failed"
    default:
      return "Unknown"
  }
}

const getStatusColor = (
  status: PaymentStatus,
  colors: ReturnType<typeof useTheme>["theme"]["colors"],
) => {
  switch (status) {
    case PaymentStatus.Completed:
      return colors.success
    case PaymentStatus.Pending:
      return colors.warning
    case PaymentStatus.Failed:
      return colors.error
    default:
      return colors.grey2
  }
}

const getPaymentMethodText = (method: PaymentMethod) => {
  switch (method) {
    case PaymentMethod.Spark:
      return "Spark"
    case PaymentMethod.Lightning:
      return "Lightning"
    case PaymentMethod.Deposit:
      return "Bitcoin (On-chain Deposit)"
    case PaymentMethod.Withdraw:
      return "Bitcoin (On-chain Withdrawal)"
    default:
      return "Unknown"
  }
}

type Props = StackScreenProps<RootStackParamList, "breezTransactionDetail">

export const BreezTransactionDetailScreen: React.FC<Props> = ({ route }) => {
  const { payment } = route.params

  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()
  const navigation = useNavigation()
  const { galoyInstance } = useAppConfig().appConfig

  const { formatMoneyAmount, moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  if (!payment) {
    return <Text>{LL.TransactionDetailScreen.noTransaction()}</Text>
  }

  const isReceive = payment.paymentType === PaymentType.Receive
  const amount = Number(payment.amount)
  const fees = Number(payment.fees)
  const timestamp = Number(payment.timestamp)

  const isOnChain =
    payment.method === PaymentMethod.Deposit || payment.method === PaymentMethod.Withdraw

  const moneyAmount = toBtcMoneyAmount(amount)
  const feeMoneyAmount = toBtcMoneyAmount(fees)

  const displayAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount,
    isApproximate: true,
  })

  const btcAmount = formatMoneyAmount({ moneyAmount })
  const feeDisplay = formatMoneyAmount({ moneyAmount: feeMoneyAmount })

  // Get USD equivalent for fees if conversion is available
  let feeUsdDisplay: string | undefined
  if (convertMoneyAmount) {
    const feeUsd = convertMoneyAmount(feeMoneyAmount, "USD")
    feeUsdDisplay = formatMoneyAmount({ moneyAmount: feeUsd })
  }

  const formattedFeeText = feeDisplay + (feeUsdDisplay ? ` (~${feeUsdDisplay})` : "")

  const spendOrReceiveText = isReceive
    ? LL.TransactionDetailScreen.received()
    : LL.TransactionDetailScreen.spent()

  // Extract details based on payment type
  const details = payment.details
  let description: string | undefined
  let paymentHash: string | undefined
  let preimage: string | undefined
  let invoice: string | undefined
  let destinationPubkey: string | undefined
  let onChainTxId: string | undefined

  if (details) {
    if (details.tag === PaymentDetails_Tags.Lightning) {
      description = details.inner.description ?? undefined
      paymentHash = details.inner.htlcDetails.paymentHash
      preimage = details.inner.htlcDetails.preimage ?? undefined
      invoice = details.inner.invoice
      destinationPubkey = details.inner.destinationPubkey
    } else if (details.tag === PaymentDetails_Tags.Spark) {
      description = details.inner.invoiceDetails?.description ?? undefined
      invoice = details.inner.invoiceDetails?.invoice
    } else if (
      details.tag === PaymentDetails_Tags.Deposit ||
      details.tag === PaymentDetails_Tags.Withdraw
    ) {
      onChainTxId = details.inner.txId
    }
  }

  const viewInExplorer = (hash: string): Promise<Linking> =>
    Linking.openURL(galoyInstance.blockExplorer + hash)

  return (
    <Screen unsafe preset="fixed">
      <View style={styles.closeButtonWrapper}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="close" size={24} color={colors.black} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scrollContent}>
        <Card containerStyle={styles.headerCard}>
          <View style={styles.amountView}>
            <IconTransaction
              isReceive={isReceive}
              walletCurrency="BTC"
              pending={payment.status === PaymentStatus.Pending}
              onChain={isOnChain}
            />
            <Text type="h2" style={styles.spendReceiveText}>
              {spendOrReceiveText}
            </Text>
            <Text type="h1" style={styles.displayAmount}>
              {displayAmount}
            </Text>
            <Text type="p2" style={styles.btcAmount}>
              {btcAmount}
            </Text>

            {/* Status badge */}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(payment.status, colors) + "20" },
              ]}
            >
              <Icon
                name={
                  payment.status === PaymentStatus.Completed
                    ? "checkmark-circle"
                    : payment.status === PaymentStatus.Pending
                    ? "time"
                    : "close-circle"
                }
                size={20}
                color={getStatusColor(payment.status, colors)}
                style={styles.statusIcon}
              />
              <Text
                type="p1"
                style={[
                  styles.statusText,
                  { color: getStatusColor(payment.status, colors) },
                ]}
              >
                {getStatusText(payment.status)}
              </Text>
            </View>

            {/* Description/Memo */}
            {description && (
              <View style={styles.memoContainer}>
                <Icon
                  name="document-text"
                  size={30}
                  color={colors.primary}
                  style={styles.memoIcon}
                />
                <Text type="p1" style={styles.memoText}>
                  {description}
                </Text>
              </View>
            )}
          </View>
        </Card>

        <Card containerStyle={styles.detailsCard}>
          {/* Date */}
          <Row
            entry={LL.common.date()}
            value={moment.unix(timestamp).format("MMMM D, YYYY [at] h:mm A")}
          />

          <View style={styles.separator} />

          {/* Fees - only show for sends */}
          {!isReceive && <Row entry={LL.common.fees()} value={formattedFeeText} />}

          {/* Payment Method */}
          <Row entry={LL.common.type()} value={getPaymentMethodText(payment.method)} />

          <View style={styles.separator} />

          {/* Payment Hash - Lightning only */}
          {paymentHash && (
            <Row entry={LL.TransactionDetailScreen.hash()} value={paymentHash} />
          )}

          {/* Preimage (proof of payment) - Lightning only */}
          {preimage && (
            <Row entry={LL.TransactionDetailScreen.preimage()} value={preimage} />
          )}

          {/* Destination Pubkey - Lightning sends only */}
          {destinationPubkey && !isReceive && (
            <Row entry="Destination" value={destinationPubkey} />
          )}

          {/* Invoice - Lightning & Spark */}
          {invoice && <Row entry="Invoice" value={invoice} />}

          {/* On-chain Transaction Hash - Deposit/Withdraw with block explorer link */}
          {onChainTxId && (
            <TouchableWithoutFeedback onPress={() => viewInExplorer(onChainTxId!)}>
              <View>
                <Row
                  entry={LL.TransactionDetailScreen.hash()}
                  value={onChainTxId}
                  isOnChain
                />
              </View>
            </TouchableWithoutFeedback>
          )}

          {/* Transaction ID */}
          <Row entry={LL.TransactionDetailScreen.transactionId()} value={payment.id} />
        </Card>
      </ScrollView>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  closeButtonWrapper: {
    backgroundColor: colors.white,
    position: "absolute",
    zIndex: 1,
    top: 0,
    left: 0,
    right: 0,
    padding: 15,
    alignItems: "flex-end",
  },
  closeButton: {
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  scrollContent: {
    flex: 1,
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 82,
    marginBottom: 8,
    borderRadius: 16,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  detailsCard: {
    marginHorizontal: 16,
    marginBottom: 26,
    borderRadius: 16,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  amountView: {
    alignItems: "center",
    paddingVertical: 20,
  },
  spendReceiveText: {
    marginTop: 12,
    marginBottom: 8,
    color: colors.grey2,
  },
  displayAmount: {
    marginTop: 4,
    fontSize: 32,
    fontWeight: "bold",
  },
  btcAmount: {
    marginTop: 4,
    color: colors.grey2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontWeight: "600",
    fontSize: 14,
  },
  memoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.grey5,
    borderRadius: 12,
    maxWidth: "90%",
  },
  memoIcon: {
    marginRight: 8,
  },
  memoText: {
    flex: 1,
    color: colors.primary,
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
  rowContainer: {
    marginBottom: 16,
    paddingVertical: 8,
  },
  entryContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  entryLabel: {
    color: colors.grey2,
    fontWeight: "500",
  },
  externalIcon: {
    marginLeft: 6,
  },
  valueContainer: {
    backgroundColor: colors.grey5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: "center",
  },
  valueText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.black,
  },
  separator: {
    height: 1,
    backgroundColor: colors.grey4,
    marginVertical: 8,
  },
}))
