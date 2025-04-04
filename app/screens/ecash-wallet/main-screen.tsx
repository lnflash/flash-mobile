import React, { useEffect, useState } from "react"
import { View, Text } from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Screen } from "@app/components/screen"
import { GaloyIcon, IconNamesType } from "@app/components/atomic/galoy-icon"
import { PrimaryBtn } from "@app/components/buttons"
import { CashuService } from "@app/services/ecash/cashu-service"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { CashuTransaction } from "@app/types/ecash"
import { makeStyles, useTheme } from "@rneui/themed"

type TransactionRowProps = {
  amount: string
  status: "sent" | "received" | "converted"
  createdAt: Date
  description?: string
}

const TransactionRow: React.FC<TransactionRowProps> = ({
  amount,
  status,
  createdAt,
  description,
}) => {
  const { theme } = useTheme()
  const rowStyles = useRowStyles()
  // Format the date as a readable string
  const formattedDate = createdAt.toLocaleDateString()

  // Determine icon based on status
  let icon: IconNamesType
  let statusColor

  switch (status) {
    case "sent":
      icon = "send"
      statusColor = theme.colors.error
      break
    case "received":
      icon = "receive"
      statusColor = theme.colors.success
      break
    case "converted":
      icon = "transfer"
      statusColor = theme.colors.primary
      break
  }

  return (
    <View style={rowStyles.transactionRow}>
      <View style={rowStyles.transactionIcon}>
        <GaloyIcon name={icon} size={24} color={statusColor} />
      </View>
      <View style={rowStyles.transactionDetails}>
        <Text style={rowStyles.transactionTitle}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
        <Text style={rowStyles.transactionDate}>{formattedDate}</Text>
        {description && (
          <Text style={rowStyles.transactionDescription}>{description}</Text>
        )}
      </View>
      <View style={rowStyles.transactionAmount}>
        <Text style={[rowStyles.transactionAmountText, { color: statusColor }]}>
          {status === "sent" ? "-" : "+"}
          {amount} sats
        </Text>
      </View>
    </View>
  )
}

// Separate styles for the transaction row component
const useRowStyles = makeStyles(({ colors }) => ({
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey5,
  },
  transactionIcon: {
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.black,
  },
  transactionDate: {
    fontSize: 14,
    color: colors.grey1,
    marginTop: 2,
  },
  transactionDescription: {
    fontSize: 14,
    color: colors.grey3,
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: "flex-end",
  },
  transactionAmountText: {
    fontSize: 16,
    fontWeight: "500",
  },
}))

type Props = StackScreenProps<RootStackParamList, "ECashWallet">

export const ECashWalletScreen: React.FC<Props> = ({ navigation }) => {
  const { LL: _LL } = useI18nContext()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<CashuTransaction[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const styles = useStyles()

  useEffect(() => {
    const loadWalletData = async () => {
      setLoading(true)
      try {
        const cashuService = CashuService.getInstance()
        await cashuService.initializeWallet()

        const walletBalance = await cashuService.getBalance()
        setBalance(walletBalance)

        const walletTransactions = await cashuService.getTransactions()
        setTransactions(walletTransactions)
      } catch (error) {
        console.error("Failed to load ECash wallet data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadWalletData()
  }, [])

  const formattedBalance = moneyAmountToDisplayCurrencyString({
    moneyAmount: toBtcMoneyAmount(balance),
  })

  const handleReceive = () => {
    navigation.navigate("ReceiveECash")
  }

  const handleSend = () => {
    navigation.navigate("SendECash")
  }

  const handleConvert = () => {
    navigation.navigate("ConvertECash", { initialAmount: balance })
  }

  return (
    <Screen preset="scroll" style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Pocket Money</Text>
        <Text style={styles.subtitle}>Powered by Cashu</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceAmount}>{balance} sats</Text>
        <Text style={styles.balanceValue}>{formattedBalance}</Text>
      </View>

      <View style={styles.actionButtons}>
        <PrimaryBtn
          label="Receive"
          onPress={handleReceive}
          btnStyle={styles.actionButton}
        />
        <PrimaryBtn label="Send" onPress={handleSend} btnStyle={styles.actionButton} />
        <PrimaryBtn
          label="Convert"
          onPress={handleConvert}
          btnStyle={styles.actionButton}
        />
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
      </View>

      {loading ? (
        <Text style={styles.loadingText}>Loading transactions...</Text>
      ) : transactions.length > 0 ? (
        <View style={styles.transactionsList}>
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              amount={tx.amount}
              status={tx.status}
              createdAt={tx.createdAt}
              description={tx.description}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>No transactions yet</Text>
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  screen: {
    padding: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.black,
  },
  subtitle: {
    fontSize: 14,
    color: colors.grey1,
    marginTop: 4,
  },
  balanceCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: "center",
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  balanceLabel: {
    fontSize: 16,
    color: colors.grey1,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.black,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 18,
    color: colors.grey1,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  transactionsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.black,
  },
  transactionsList: {
    marginBottom: 24,
  },
  loadingText: {
    textAlign: "center",
    fontSize: 16,
    color: colors.grey1,
    marginTop: 20,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
    color: colors.grey1,
    marginTop: 20,
  },
}))

export default ECashWalletScreen
