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

// components
import { IconTransaction } from "../../components/icon-transactions"
import { TransactionDate } from "@app/components/transaction-date"
import { WalletSummary } from "@app/components/wallet-summary"
import { GaloyInfo } from "@app/components/atomic/galoy-info"
import { Screen } from "../../components/screen"

// hooks
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "@app/hooks"

// utils | types
import { toWalletAmount } from "@app/types/amounts"
import { SettlementVia, useTransactionDetailsQuery } from "@app/graphql/generated"
import { getDescriptionDisplay } from "@app/graphql/transactions"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { gql } from "@apollo/client"

gql`
  query transactionDetails($input: TransactionDetailsInput!) {
    transactionDetails(input: $input) {
      errors {
        message
      }
      transactionDetails {
        id
        accountId
        amount
        currency
        status
        type
        createdAt
        updatedAt
        invoice
        paymentHash
        paymentPreimage
        memo
        address
        txid
        vout
        confirmations
        fee
      }
    }
  }
`

type RowProps = {
  entry: string
  value?: string | JSX.Element
  __typename?: "SettlementViaIntraLedger" | "SettlementViaLn" | "SettlementViaOnChain"
  content?: JSX.Element
}

const Row = ({ entry, value, __typename, content }: RowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <View style={styles.rowContainer}>
      <View style={styles.entryContainer}>
        <Text style={styles.entryLabel} type="p2">
          {entry}
        </Text>
        {__typename === "SettlementViaOnChain" && (
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

const typeDisplay = (instance: SettlementVia) => {
  switch (instance.__typename) {
    case "SettlementViaOnChain":
      return "OnChain"
    case "SettlementViaLn":
      return "Lightning"
    case "SettlementViaIntraLedger":
      return "IntraLedger"
  }
}

type Props = StackScreenProps<RootStackParamList, "transactionDetail">

export const TransactionDetailScreen: React.FC<Props> = ({ route }) => {
  const { tx } = route.params

  const styles = useStyles()
  const { colors } = useTheme().theme
  const { galoyInstance } = useAppConfig().appConfig
  const { LL } = useI18nContext()
  const navigation = useNavigation()

  const { formatMoneyAmount, formatCurrency } = useDisplayCurrency()

  const { data: transactionDetailsData } = useTransactionDetailsQuery({
    variables: {
      input: {
        transactionId: tx?.id || "",
      },
    },
    skip: !tx?.id,
  })

  const ibexDetails = transactionDetailsData?.transactionDetails?.transactionDetails

  if (!tx || Object.keys(tx).length === 0)
    return <Text>{"No transaction found with this ID (should not happen)"}</Text>

  const {
    id,
    settlementCurrency,
    settlementAmount,
    settlementDisplayFee,
    settlementDisplayAmount,
    settlementDisplayCurrency,
    settlementFee,
    settlementVia,
    initiationVia,
  } = tx

  const viewInExplorer = (hash: string): Promise<Linking> =>
    Linking.openURL(galoyInstance.blockExplorer + hash)

  const isReceive = tx.direction === "RECEIVE"

  const spendOrReceiveText = isReceive
    ? LL.TransactionDetailScreen.received()
    : LL.TransactionDetailScreen.spent()

  const displayAmount = formatCurrency({
    amountInMajorUnits: settlementDisplayAmount,
    currency: settlementDisplayCurrency,
  })

  const formattedPrimaryFeeAmount = formatCurrency({
    amountInMajorUnits: settlementDisplayFee,
    currency: settlementDisplayCurrency,
  })

  const formattedSettlementFee = formatMoneyAmount({
    moneyAmount: toWalletAmount({
      amount: settlementFee,
      currency: settlementCurrency,
    }),
  })

  const onChainTxBroadcasted =
    settlementVia?.__typename === "SettlementViaOnChain" &&
    settlementVia?.transactionHash !== null

  const onChainTxNotBroadcasted =
    settlementVia?.__typename === "SettlementViaOnChain" &&
    settlementVia?.transactionHash === null

  const formattedSecondaryFeeAmount =
    settlementDisplayCurrency === settlementCurrency ? undefined : formattedSettlementFee

  const formattedFeeText =
    formattedPrimaryFeeAmount +
    (formattedSecondaryFeeAmount ? ` (${formattedSecondaryFeeAmount})` : ``)

  const description = getDescriptionDisplay({
    LL,
    tx,
    bankName: galoyInstance.name,
    showMemo: true,
  })

  return (
    <Screen unsafe preset="fixed">
      <View style={styles.backButtonWrapper}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={colors.black} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scrollContent}>
        <Card containerStyle={styles.headerCard}>
          <View style={styles.amountView}>
            <IconTransaction
              isReceive={isReceive}
              walletCurrency={settlementCurrency}
              pending={false}
              onChain={false}
            />
            <Text type="h2" style={styles.spendReceiveText}>
              {spendOrReceiveText}
            </Text>
            <Text type="h1" style={styles.displayAmount}>
              {displayAmount}
            </Text>
            {/* Show memo for Lightning or confirmations for onchain */}
            {(ibexDetails?.memo ||
              (settlementVia?.__typename === "SettlementViaOnChain" &&
                ibexDetails?.confirmations !== undefined &&
                ibexDetails?.confirmations !== null)) && (
              <View style={styles.memoContainer}>
                {settlementVia?.__typename === "SettlementViaOnChain" &&
                ibexDetails?.confirmations !== undefined &&
                ibexDetails?.confirmations !== null ? (
                  <>
                    <Icon
                      name={
                        ibexDetails.confirmations >= 6
                          ? "shield-checkmark"
                          : ibexDetails.confirmations >= 1
                          ? "shield"
                          : "time"
                      }
                      size={30}
                      color={
                        ibexDetails.confirmations >= 6
                          ? colors.success
                          : ibexDetails.confirmations >= 1
                          ? colors.warning
                          : colors.grey2
                      }
                      style={styles.memoIcon}
                    />
                    <Text
                      type="p1"
                      style={[
                        styles.memoText,
                        {
                          color:
                            ibexDetails.confirmations >= 6
                              ? colors.success
                              : ibexDetails.confirmations >= 1
                              ? colors.warning
                              : colors.grey2,
                        },
                      ]}
                    >
                      {ibexDetails.confirmations === 0
                        ? "Pending"
                        : `${ibexDetails.confirmations} ${
                            ibexDetails.confirmations === 1
                              ? "Confirmation"
                              : "Confirmations"
                          }`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Icon
                      name="document-text"
                      size={30}
                      color={colors.primary}
                      style={styles.memoIcon}
                    />
                    <Text type="p1" style={styles.memoText}>
                      {ibexDetails?.memo}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </Card>

        <Card containerStyle={styles.detailsCard}>
          {onChainTxNotBroadcasted && (
            <View style={styles.txNotBroadcast}>
              <GaloyInfo>{LL.TransactionDetailScreen.txNotBroadcast()}</GaloyInfo>
            </View>
          )}

          <Row
            entry={
              isReceive
                ? LL.TransactionDetailScreen.receivingAccount()
                : LL.TransactionDetailScreen.sendingAccount()
            }
            content={
              <WalletSummary
                amountType={tx.direction}
                settlementAmount={toWalletAmount({
                  amount: Math.abs(settlementAmount),
                  currency: settlementCurrency,
                })}
                txDisplayAmount={settlementDisplayAmount}
                txDisplayCurrency={settlementDisplayCurrency}
              />
            }
          />

          <Row entry={LL.common.date()} value={<TransactionDate {...tx} />} />

          <View style={styles.separator} />

          {(!isReceive || settlementCurrency === "BTC") && (
            <Row entry={LL.common.fees()} value={formattedFeeText} />
          )}

          <Row entry={LL.common.description()} value={description} />

          {settlementVia?.__typename === "SettlementViaIntraLedger" && (
            <Row
              entry={LL.TransactionDetailScreen.paid()}
              value={settlementVia?.counterPartyUsername || galoyInstance.name}
            />
          )}

          <Row entry={LL.common.type()} value={typeDisplay(settlementVia)} />

          <View style={styles.separator} />

          {settlementVia?.__typename === "SettlementViaLn" &&
            initiationVia.__typename === "InitiationViaLn" &&
            initiationVia.paymentHash && (
              <Row entry="Hash" value={initiationVia.paymentHash} />
            )}

          {settlementVia?.__typename === "SettlementViaLn" &&
            ibexDetails?.paymentPreimage && (
              <Row entry="Preimage" value={ibexDetails.paymentPreimage} />
            )}

          {onChainTxBroadcasted && settlementVia?.transactionHash && (
            <TouchableWithoutFeedback
              onPress={() => viewInExplorer(settlementVia?.transactionHash || "")}
            >
              <View>
                <Row
                  entry="Hash"
                  value={settlementVia?.transactionHash}
                  __typename={settlementVia?.__typename}
                />
              </View>
            </TouchableWithoutFeedback>
          )}

          {id && <Row entry="Transaction ID" value={id} />}
        </Card>
      </ScrollView>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  backButtonWrapper: {
    backgroundColor: "white",
    position: "absolute",
    zIndex: 1,
    top: 0,
    left: 0,
    right: 0,
    padding: 15,
  },
  backButton: {
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
    marginTop: 82, // Account for back button
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
    color: colors.primary,
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
  txNotBroadcast: {
    marginBottom: 20,
  },
  separator: {
    height: 1,
    backgroundColor: colors.grey4,
    marginVertical: 8,
  },
  description: {
    marginBottom: 16,
  },
  entry: {
    marginBottom: 8,
    color: colors.grey2,
  },
  transactionDetailView: {
    marginHorizontal: 20,
    marginVertical: 15,
  },
  value: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.black,
  },
}))
