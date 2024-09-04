import React from "react"
import { View, Text } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { format } from "date-fns"
import { makeStyles } from "@rneui/themed"

const formatDate = (date: string) => format(new Date(date), "dd-MMM-yyyy hh:mm a")

export const DateRangeDisplay: React.FC<{ from: string; to: string }> = ({
  from,
  to,
}) => {
  const styles = useStyles()
  const { LL } = useI18nContext()

  return (
    <View style={styles.dateContainer}>
      <View style={styles.dateColumn}>
        <Text style={styles.dateLabel}>{LL.reports.fromDate()}</Text>
        <Text style={styles.dateValue}>{formatDate(from)}</Text>
      </View>
      <View style={styles.dateColumn}>
        <Text style={styles.dateLabel}>{LL.reports.toDate()}</Text>
        <Text style={styles.dateValue}>{formatDate(to)}</Text>
      </View>
    </View>
  )
}

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
