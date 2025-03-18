import React from "react"
import { Icon, makeStyles, Text, useTheme } from "@rneui/themed"
import { View } from "react-native"
import moment from "moment"

// hooks
import { useDisplayCurrency } from "@app/hooks"

// types
import { ConvertMoneyAmount } from "@app/screens/send-bitcoin-screen/payment-details"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"

type TransactionItem = {
  date: string
  sats: string
}

type Props = {
  transactions?: TransactionItem[]
  convertMoneyAmount: ConvertMoneyAmount
}

const RecentActivity: React.FC<Props> = ({ transactions, convertMoneyAmount }) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { formatMoneyAmount } = useDisplayCurrency()

  const renderItem = (item: TransactionItem) => {
    const sats = parseInt(item.sats.replaceAll(",", ""), 10)

    const convertedAmount = convertMoneyAmount(toBtcMoneyAmount(sats), DisplayCurrency)

    const formattedAmount = formatMoneyAmount({
      moneyAmount: convertedAmount,
      noSymbol: false,
    })

    return (
      <View style={styles.row} key={item.date}>
        <Icon
          name={sats < 0 ? "arrow-up" : "arrow-down"}
          size={20}
          type="ionicon"
          color={sats < 0 ? "#B31B1B" : "#007856"}
        />
        <Text type="bl" style={styles.date}>
          {moment(item.date).format("MMM Do, h:mm a")}
        </Text>
        <View style={styles.column}>
          <Text type="bl">{formattedAmount}</Text>
          <Text type="caption" color={colors.placeholder}>{`${item.sats} SATS`}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text type="bl" bold style={styles.title}>
        Recent activity
      </Text>
      {transactions?.map((el) => renderItem(el))}
    </View>
  )
}

export default RecentActivity

const useStyles = makeStyles(() => ({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  date: {
    marginLeft: 10,
  },
  column: {
    flex: 1,
    alignItems: "flex-end",
  },
}))
