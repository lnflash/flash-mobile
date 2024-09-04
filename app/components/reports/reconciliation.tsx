import React, { useEffect, useState } from "react"
import { View, Text, ScrollView } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useTheme, Button, makeStyles } from "@rneui/themed"
import { format } from "date-fns"
import { Screen } from "../screen"
import { usePriceConversion } from "@app/hooks"
import {
  useTransactionListForDefaultAccountQuery,
  TransactionFragment,
} from "@app/graphql/generated"
import { RouteProp, useRoute } from "@react-navigation/native"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { DisplayCurrency, toUsdMoneyAmount } from "@app/types/amounts"
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"

import { exportTransactionsToHTML, exportTransactionsToPDF } from "../../utils/pdfExport"
import { DateRangeDisplay } from "../date-range-display"

export const TxDirection = {
  Receive: "RECEIVE",
  Send: "SEND",
} as const

export type TxDirection = (typeof TxDirection)[keyof typeof TxDirection]

// Define route params type
type ReconciliationReportRouteParams = {
  from: string
  to: string
}

// Define the type of the route
type ReconciliationReportRouteProp = RouteProp<
  { Reconciliation: ReconciliationReportRouteParams },
  "Reconciliation"
>

const orderAndConvertTransactionsByDate = (
  transactions: TransactionFragment[],
  convertMoneyAmount?: ConvertMoneyAmount,
) => {
  // Sort the transactions by date (newest first)
  const orderedTransactions = transactions.sort((a, b) => b.createdAt - a.createdAt)

  // Map through the transactions and convert amounts, including the display date
  return orderedTransactions.map((tx) => {
    const displayAmount = tx.settlementAmount
    const convertedAmount = convertMoneyAmount?.(
      toUsdMoneyAmount(displayAmount * 100),
      DisplayCurrency,
    )

    return {
      ...tx,
      displayDate: format(new Date(tx.createdAt * 1000), "dd-MMM-yyyy hh:mm a"),
      settlementDisplayAmount:
        convertedAmount && convertedAmount.currencyCode !== "USD"
          ? (convertedAmount.amount / 100).toFixed(2)
          : tx.settlementDisplayAmount,
    }
  })
}

export const ReconciliationReport: React.FC = () => {
  const { LL } = useI18nContext()
  const isAuthed = useIsAuthed()
  const { colors } = useTheme()
  const styles = useStyles()
  const { from, to } = useRoute<ReconciliationReportRouteProp>().params

  const [balance, setBalance] = useState("$0.00")
  const [balanceInDisplayCurrency, setBalanceInDisplayCurrency] = useState("$0.00")
  const [selectedDirection, setSelectedDirection] = useState<TxDirection | null>(null)

  const { formatMoneyAmount } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const { data, error, loading } = useTransactionListForDefaultAccountQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    nextFetchPolicy: "cache-and-network",
    variables: { first: 100 },
  })

  useEffect(() => {
    if (data) {
      const transactions =
        data.me?.defaultAccount?.transactions?.edges?.map((edge) => edge.node) || []

      const filteredTransactions = filterTransactionsByDirection(
        filterTransactionsByDate(transactions, from, to),
        selectedDirection,
      )

      const totalAmount = calculateTotalAmount(filteredTransactions)
      setBalance(
        formatMoneyAmount({
          moneyAmount: toUsdMoneyAmount(totalAmount * 100),
          noSymbol: false,
        }),
      )

      const convertedBalance = convertToDisplayCurrency(totalAmount, convertMoneyAmount)
      if (convertedBalance) {
        setBalanceInDisplayCurrency(
          formatMoneyAmount({
            moneyAmount: convertedBalance,
            noSymbol: false,
          }),
        )
      }
    }
  }, [data, convertMoneyAmount, formatMoneyAmount, from, to, selectedDirection])

  if (loading) return <Text>{LL.common.soon()}</Text>
  if (error) return <Text>{LL.common.error()}</Text>

  const filteredTransactionsByDirection = filterTransactionsByDirection(
    filterTransactionsByDate(
      data?.me?.defaultAccount?.transactions?.edges?.map((edge) => edge.node) || [],
      from,
      to,
    ),
    selectedDirection,
  )

  const orderedTransactions = orderAndConvertTransactionsByDate(
    filteredTransactionsByDirection,
    convertMoneyAmount,
  )

  return (
    <Screen>
      <View style={styles.container}>
        <DateRangeDisplay from={from} to={to} />

        <Text style={styles.totalText}>
          {LL.reports.total()}:{"\nUSD"} {balance}{" "}
          {balanceInDisplayCurrency !== balance && (
            <Text>{`( ~${balanceInDisplayCurrency} )`}</Text>
          )}
        </Text>

        <View style={styles.filterContainer}>
          <Button
            title="All"
            type={selectedDirection === null ? "solid" : "outline"}
            onPress={() => setSelectedDirection(null)}
          />
          <Button
            title="Received"
            type={selectedDirection === TxDirection.Receive ? "solid" : "outline"}
            onPress={() => setSelectedDirection(TxDirection.Receive)}
          />
          <Button
            title="Sent"
            type={selectedDirection === TxDirection.Send ? "solid" : "outline"}
            onPress={() => setSelectedDirection(TxDirection.Send)}
          />
        </View>
        <ScrollView style={styles.scrollView}>
          {orderedTransactions.map((tx) => (
            <View key={tx.id} style={styles.transactionRow}>
              <View style={styles.transactionDetailsRow}>
                <Text style={styles.dateText}>{tx.displayDate}</Text>
                <Text style={styles.txDirectionText}>{tx.direction}</Text>
                <Text style={styles.amountText}>{tx.settlementDisplayAmount}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <Button
          style={styles.button}
          onPress={() =>
            exportTransactionsToHTML({
              transactions: orderedTransactions,
              from,
              to,
              totalAmount: balance,
              balanceInDisplayCurrency,
              currencySymbol: "USD",
            })
          }
        >
          Export as HTML
        </Button>
        <Button
          style={styles.button}
          onPress={() =>
            exportTransactionsToPDF({
              transactions: orderedTransactions,
              from,
              to,
              totalAmount: balance,
              balanceInDisplayCurrency,
              currencySymbol: "USD",
            })
          }
        >
          Export as PDF
        </Button>
      </View>
    </Screen>
  )
}

const filterTransactionsByDate = (
  transactions: TransactionFragment[],
  from: string,
  to: string,
) => {
  const selectedFrom = from ? new Date(from) : null
  const selectedTo = to ? new Date(to) : null

  return transactions.filter((tx) => {
    const txDate = new Date(tx.createdAt * 1000) // Convert seconds to milliseconds
    return (
      (!selectedFrom || txDate >= selectedFrom) && (!selectedTo || txDate <= selectedTo)
    )
  })
}

const filterTransactionsByDirection = (
  transactions: TransactionFragment[],
  direction: TxDirection | null,
) => {
  if (!direction) return transactions
  return transactions.filter((tx) => tx.direction === direction)
}

const calculateTotalAmount = (transactions: TransactionFragment[]) =>
  transactions.reduce((sum, tx) => {
    const displayAmount = tx.settlementAmount
    return sum + (isNaN(displayAmount) ? 0 : displayAmount)
  }, 0)

const convertToDisplayCurrency = (
  totalAmount: number,
  convertMoneyAmount?: ConvertMoneyAmount,
) =>
  convertMoneyAmount &&
  convertMoneyAmount(toUsdMoneyAmount(totalAmount * 100), DisplayCurrency)

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  filterContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  totalText: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
    color: colors.black,
  },
  scrollView: {
    marginBottom: 16,
  },
  transactionRow: {
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: colors.grey4,
  },
  transactionDetailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    fontSize: 14,
    color: colors.black,
    flex: 1,
  },
  txDirectionText: {
    fontSize: 14,
    color: colors.black,
    textAlign: "center",
    flex: 1,
  },
  amountText: {
    fontSize: 14,
    color: colors.black,
    textAlign: "right",
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 8,
    color: colors.primary,
  },
  dateContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  dateColumn: {
    flex: 1,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.grey4,
    padding: 10,
    borderRadius: 10,
    marginHorizontal: 10,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    color: colors.black,
  },
  dateValue: {
    fontSize: 12,
    color: colors.black,
  },
  button: {
    marginVertical: 10,
    // center the button with space on the sides
    marginHorizontal: "auto",
    paddingHorizontal: 40,
  },
}))
