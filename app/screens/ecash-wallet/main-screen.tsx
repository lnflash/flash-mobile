import React, { useEffect, useState } from "react"
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from "react-native"
import { StackScreenProps } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { Screen } from "@app/components/screen"
import { GaloyIcon, IconNamesType } from "@app/components/atomic/galoy-icon"
import { CashuService } from "@app/services/ecash/cashu-service"
import { toBtcMoneyAmount } from "@app/types/amounts"
import { CashuTransaction, RedemptionRequest } from "@app/types/ecash"
import { makeStyles, useTheme } from "@rneui/themed"
import { TokenDecoder } from "@app/services/ecash/token-decoder"
import { RedemptionQueue } from "@app/services/ecash/redemption-queue"
import NetInfo from "@react-native-community/netinfo"

type TransactionRowProps = {
  amount: string
  status: "sent" | "received" | "converted" | "pending" | "failed"
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
  let statusColor: string = theme.colors.primary // Default color

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
    case "pending":
      icon = "loading"
      statusColor = theme.colors.warning
      break
    case "failed":
      icon = "close"
      statusColor = theme.colors.error
      break
  }

  // Use a safe approach to render the icon, which is compatible with both platforms
  const renderTransactionIcon = () => {
    if (Platform.OS === "ios") {
      // On iOS, use a simple colored View instead of the SVG icon
      return <View style={[rowStyles.fallbackIcon, { backgroundColor: statusColor }]} />
    }

    // On Android, use the GaloyIcon component
    return <GaloyIcon name={icon} size={24} color={statusColor} />
  }

  return (
    <View style={rowStyles.transactionRow}>
      <View style={rowStyles.transactionIcon}>{renderTransactionIcon()}</View>
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
          {status === "failed" ? "" : status === "sent" ? "-" : "+"}
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey5,
  },
  transactionIcon: {
    marginRight: 12,
  },
  fallbackIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.grey0,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.grey2,
  },
  transactionDescription: {
    fontSize: 12,
    color: colors.grey1,
    marginTop: 4,
  },
  transactionAmount: {
    alignItems: "flex-end",
  },
  transactionAmountText: {
    fontSize: 16,
    fontWeight: "600",
  },
}))

type Props = StackScreenProps<RootStackParamList, "ECashWallet">

export const ECashWalletScreen: React.FC<Props> = ({ navigation, route }) => {
  const { LL: _LL } = useI18nContext()
  const { moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<CashuTransaction[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [pendingRedemptions, setPendingRedemptions] = useState<RedemptionRequest[]>([])
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false)
  const [showAdminMenu, setShowAdminMenu] = useState<boolean>(false)
  const styles = useStyles()
  const { colors } = useTheme().theme

  // Load data from the local cache first, then update from network if available
  const loadWalletData = async (forceRefresh = false) => {
    try {
      const cashuService = CashuService.getInstance()

      // Initialize wallet, which loads from storage
      await cashuService.initializeWallet()

      // Get cached data immediately
      const cachedBalance = await cashuService.getBalance()
      setBalance(cachedBalance)

      const cachedTransactions = await cashuService.getTransactions()
      setTransactions(cachedTransactions)

      const pendingRedemptions = cashuService.getPendingRedemptions()
      setPendingRedemptions(pendingRedemptions)

      // If this is the first load or we're forcing a refresh, update the UI right away
      if (!initialLoadComplete || forceRefresh) {
        setInitialLoadComplete(true)
        setLoading(false)
        console.log(
          `Loaded from cache: Balance: ${cachedBalance} sats, Transactions: ${cachedTransactions.length}`,
        )
      }

      // Check network status before attempting to refresh from network
      const networkState = await NetInfo.fetch()
      setIsOnline(networkState.isConnected ?? false)

      // Only try to refresh from network if we're online
      if (networkState.isConnected) {
        // Force recalculation of balances to ensure accuracy
        await cashuService.recalculateBalances()

        // Get fresh data
        const walletBalance = await cashuService.getBalance()
        setBalance(walletBalance)

        const walletTransactions = await cashuService.getTransactions()
        setTransactions(walletTransactions)

        const pending = cashuService.getPendingRedemptions()
        setPendingRedemptions(pending)

        console.log(
          `Updated from network: Balance: ${walletBalance} sats, Transactions: ${walletTransactions.length}`,
        )
      } else {
        console.log("Device is offline, using cached data")
      }
    } catch (error) {
      console.error("Failed to load ECash wallet data:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    console.log("Manual refresh triggered by pull-to-refresh")
    setRefreshing(true)
    await loadWalletData(true)
  }

  // Set up network monitoring
  useEffect(() => {
    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false)

      // When we come back online, refresh data
      if (state.isConnected) {
        loadWalletData(true)
      }
    })

    // Initial load (from cache first, then network)
    setLoading(true)
    loadWalletData()

    // Set up a less frequent refresh interval for when the app is online
    const refreshInterval = setInterval(() => {
      NetInfo.fetch().then((state) => {
        if (state.isConnected) {
          loadWalletData()
        }
      })
    }, 10000) // Refresh every 10 seconds if online

    // Clean up
    return () => {
      unsubscribe()
      clearInterval(refreshInterval)
    }
  }, [])

  // Check for force refresh parameter (e.g., after redeeming a token)
  useEffect(() => {
    if (route.params?.forceRefresh) {
      console.log("Force refresh detected with timestamp:", route.params.refreshTimestamp)
      loadWalletData(true)
    }
  }, [route.params?.refreshTimestamp])

  const formattedBalance = moneyAmountToDisplayCurrencyString({
    moneyAmount: toBtcMoneyAmount(balance),
  })

  // Add a function to handle retrying a failed redemption
  const handleRetryRedemption = async (requestId: string) => {
    try {
      const cashuService = CashuService.getInstance()
      await cashuService.retryRedemption(requestId)

      // Refresh data
      const pending = cashuService.getPendingRedemptions()
      setPendingRedemptions(pending)

      // Show success message
      Alert.alert("Retry Initiated", "The redemption will be retried.")
    } catch (error) {
      console.error("Error retrying redemption:", error)
      Alert.alert("Error", "Failed to retry redemption.")
    }
  }

  // Add a function to handle wallet reset
  const handleResetWallet = async () => {
    Alert.alert(
      "Reset Wallet",
      "This will remove ALL tokens and transactions (including failed ones) from your eCash wallet. This action cannot be undone. Are you sure?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true)
              const cashuService = CashuService.getInstance()
              await cashuService.resetWallet()

              // Explicitly clear the pending redemptions state first
              setPendingRedemptions([])

              // Refresh data
              const walletBalance = await cashuService.getBalance()
              setBalance(walletBalance)
              const walletTransactions = await cashuService.getTransactions()
              setTransactions(walletTransactions)

              // Double-check that pending redemptions are cleared
              setPendingRedemptions([])

              // Show success message
              Alert.alert(
                "Wallet Reset",
                "Your eCash wallet has been completely reset. All tokens and transactions have been removed.",
              )
            } catch (error) {
              console.error("Failed to reset wallet:", error)
              Alert.alert("Error", "Failed to reset wallet.")
            } finally {
              setLoading(false)
            }
          },
        },
      ],
    )
  }

  // Add a function to clear all pending transactions
  const handleClearPending = async () => {
    if (pendingRedemptions.length === 0) {
      Alert.alert(
        "No Pending Transactions",
        "There are no pending transactions to clear.",
      )
      return
    }

    Alert.alert(
      "Clear Pending Transactions",
      "This will remove all pending token redemptions. Use this if you're having issues with stuck transactions. Continue?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true)
              const cashuService = CashuService.getInstance()

              // First try to clear just already redeemed tokens
              await cashuService.clearAlreadyRedeemedTokens()

              // Update pending redemptions
              const updatedPending = cashuService.getPendingRedemptions()

              // If there are still pending redemptions, ask if user wants to clear all
              if (updatedPending.length > 0) {
                setPendingRedemptions(updatedPending)

                Alert.alert(
                  "Some Transactions Cleared",
                  "Already redeemed tokens were cleared, but some pending transactions remain. Would you like to clear all pending transactions?",
                  [
                    {
                      text: "No, Keep Remaining",
                      style: "cancel",
                    },
                    {
                      text: "Yes, Clear All",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          setLoading(true)

                          // Clear all from redemption queue
                          const redemptionQueue = RedemptionQueue.getInstance()
                          await redemptionQueue.clearAll()

                          // Update state
                          setPendingRedemptions([])

                          // Refresh transactions
                          const walletTransactions = await cashuService.getTransactions()
                          setTransactions(walletTransactions)

                          Alert.alert(
                            "All Pending Transactions Cleared",
                            "All pending transactions have been removed.",
                          )
                        } catch (error) {
                          console.error(
                            "Failed to clear all pending transactions:",
                            error,
                          )
                          Alert.alert(
                            "Error",
                            "Failed to clear all pending transactions.",
                          )
                        } finally {
                          setLoading(false)
                        }
                      },
                    },
                  ],
                )
              } else {
                // All were already redeemed tokens, which have been cleared
                setPendingRedemptions([])

                // Refresh transactions
                const walletTransactions = await cashuService.getTransactions()
                setTransactions(walletTransactions)

                // Show success message
                Alert.alert(
                  "Pending Transactions Cleared",
                  "All pending transactions have been removed.",
                )
              }
            } catch (error) {
              console.error("Failed to clear pending transactions:", error)
              Alert.alert("Error", "Failed to clear pending transactions.")
            } finally {
              setLoading(false)
            }
          },
        },
      ],
    )
  }

  // Add a function to handle clearing already redeemed tokens
  const handleClearAlreadyRedeemed = async () => {
    try {
      setLoading(true)
      const cashuService = CashuService.getInstance()

      // Use the new method to clear just already redeemed tokens
      await cashuService.clearAlreadyRedeemedTokens()

      // Update pending redemptions
      const updatedPending = cashuService.getPendingRedemptions()
      setPendingRedemptions(updatedPending)

      // Refresh transactions
      const walletTransactions = await cashuService.getTransactions()
      setTransactions(walletTransactions)

      // Show success message
      Alert.alert(
        "Already Redeemed Tokens Cleared",
        "All tokens with 'already redeemed' errors have been removed from the pending list.",
      )
    } catch (error) {
      console.error("Failed to clear already redeemed tokens:", error)
      Alert.alert("Error", "Failed to clear already redeemed tokens.")
    } finally {
      setLoading(false)
    }
  }

  // Add a function to handle clearing failed transactions
  const handleClearFailedTransactions = async () => {
    try {
      setLoading(true)
      const cashuService = CashuService.getInstance()

      // Use the new method to clear failed transactions
      await cashuService.clearFailedTransactions()

      // Refresh transactions
      const walletTransactions = await cashuService.getTransactions()
      setTransactions(walletTransactions)

      // Show success message
      Alert.alert(
        "Failed Transactions Cleared",
        "All failed transactions have been removed from the history.",
      )
    } catch (error) {
      console.error("Failed to clear failed transactions:", error)
      Alert.alert("Error", "Failed to clear failed transactions.")
    } finally {
      setLoading(false)
    }
  }

  // Add a component to display for tokens with unknown mints
  const UnknownMintSelector = ({ request }: { request: RedemptionRequest }) => {
    const [selectedMint, setSelectedMint] = useState<string | null>(null)
    const knownMints = TokenDecoder.getKnownMints()

    const handleRetryWithMint = async () => {
      if (!selectedMint) {
        Alert.alert("Error", "Please select a mint first.")
        return
      }

      try {
        const cashuService = CashuService.getInstance()
        // Create new token with the specified mint
        await cashuService.retryRedemptionWithMint(request.id, selectedMint)

        // Refresh data
        const pending = cashuService.getPendingRedemptions()
        setPendingRedemptions(pending)

        // Show success message
        Alert.alert(
          "Retry Initiated",
          "The redemption will be retried with the selected mint.",
        )
      } catch (error) {
        console.error("Error retrying redemption:", error)
        Alert.alert("Error", "Failed to retry redemption.")
      }
    }

    return (
      <View style={styles.mintSelector}>
        <Text style={styles.mintSelectorTitle}>Select Correct Mint</Text>
        <Text style={styles.mintSelectorDesc}>
          This token's mint couldn't be determined. Please select the correct mint.
        </Text>

        {knownMints.map((mint) => (
          <TouchableOpacity
            key={mint}
            style={[styles.mintOption, selectedMint === mint && styles.selectedMint]}
            onPress={() => setSelectedMint(mint)}
          >
            <Text style={styles.mintOptionText}>{mint}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.mintActionButtons}>
          <TouchableOpacity style={styles.mintRetryButton} onPress={handleRetryWithMint}>
            <Text style={styles.mintRetryText}>Retry with Selected Mint</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // Update the PendingRedemption component to show mint selection UI
  const PendingRedemption = ({ request }: { request: RedemptionRequest }) => {
    // Check if this is a mint selection issue
    const needsMintSelection =
      (request.status === "failed" && request.error?.includes("Unknown mint")) ||
      request.error?.includes("please select the correct mint")

    if (needsMintSelection) {
      return <UnknownMintSelector request={request} />
    }

    return (
      <View style={styles.pendingItem}>
        <View style={styles.pendingHeader}>
          <Text style={styles.pendingTitle}>Pending Token Redemption</Text>
          {request.status === "processing" ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : request.status === "failed" ? (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => handleRetryRedemption(request.id)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.pendingStatus}>{request.status}</Text>
          )}
        </View>
        <Text style={styles.pendingAmount}>
          {request.amount ? `${request.amount} sats` : "Amount unknown"}
        </Text>
        <Text style={styles.pendingDate}>{request.createdAt.toLocaleString()}</Text>
        {request.error && <Text style={styles.errorText}>{request.error}</Text>}
      </View>
    )
  }

  return (
    <Screen
      preset="scroll"
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>Powered by Cashu</Text>
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <Text style={styles.offlineText}>Offline Mode - Using Cached Data</Text>
            </View>
          )}
        </View>
        <View style={styles.adminMenuContainer}>
          <TouchableOpacity
            style={styles.adminIconButton}
            onPress={() => setShowAdminMenu(!showAdminMenu)}
          >
            <GaloyIcon name="settings" size={24} color={colors.primary} />
          </TouchableOpacity>

          {showAdminMenu && (
            <>
              <TouchableOpacity
                style={styles.adminMenuBackdrop}
                onPress={() => setShowAdminMenu(false)}
              />
              <View style={styles.adminMenuDropdown}>
                <TouchableOpacity
                  style={styles.adminMenuItem}
                  onPress={() => {
                    navigation.navigate("ManageMints")
                    setShowAdminMenu(false)
                  }}
                >
                  <View style={styles.adminMenuItemContent}>
                    <GaloyIcon name="gear" size={18} color={colors.primary} />
                    <View style={styles.iconSpacing} />
                    <Text style={[styles.adminMenuItemText, { color: colors.primary }]}>
                      Manage Mints
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminMenuItem}
                  onPress={() => {
                    handleClearPending()
                    setShowAdminMenu(false)
                  }}
                >
                  <View style={styles.adminMenuItemContent}>
                    <GaloyIcon name="refresh" size={18} color={colors.warning} />
                    <View style={styles.iconSpacing} />
                    <Text style={[styles.adminMenuItemText, { color: colors.warning }]}>
                      Clear All Pending
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminMenuItem}
                  onPress={() => {
                    handleClearAlreadyRedeemed()
                    setShowAdminMenu(false)
                  }}
                >
                  <View style={styles.adminMenuItemContent}>
                    <GaloyIcon name="check" size={18} color={colors.warning} />
                    <View style={styles.iconSpacing} />
                    <Text style={[styles.adminMenuItemText, { color: colors.warning }]}>
                      Clear Already Redeemed
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminMenuItem}
                  onPress={() => {
                    handleClearFailedTransactions()
                    setShowAdminMenu(false)
                  }}
                >
                  <View style={styles.adminMenuItemContent}>
                    <GaloyIcon name="close" size={18} color={colors.error} />
                    <View style={styles.iconSpacing} />
                    <Text style={[styles.adminMenuItemText, { color: colors.error }]}>
                      Clear Failed Transactions
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.adminMenuItem, styles.lastMenuItem]}
                  onPress={() => {
                    handleResetWallet()
                    setShowAdminMenu(false)
                  }}
                >
                  <View style={styles.adminMenuItemContent}>
                    <GaloyIcon name="close" size={18} color={colors.error} />
                    <View style={styles.iconSpacing} />
                    <Text style={[styles.adminMenuItemText, { color: colors.error }]}>
                      Reset Wallet
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceAmount}>{balance} sats</Text>
        <Text style={styles.balanceValue}>{formattedBalance}</Text>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("SendECash")}
        >
          <GaloyIcon name="send" size={24} color={colors.white} />
          <Text style={styles.actionButtonText}>Send</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("scanningQRCode")}
        >
          <GaloyIcon name="receive" size={24} color={colors.white} />
          <Text style={styles.actionButtonText}>Receive</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.transactionsTitle}>Transactions</Text>
      </View>

      {pendingRedemptions.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.pendingSectionTitle}>Pending Redemptions</Text>
          {pendingRedemptions.map((request, index) => (
            <PendingRedemption key={`${request.id}-${index}`} request={request} />
          ))}
        </View>
      )}

      {loading ? (
        <Text style={styles.loadingText}>Loading transactions...</Text>
      ) : transactions.length > 0 ? (
        <View style={styles.transactionsList}>
          {transactions.map((tx, index) => (
            <TransactionRow
              key={`${tx.id}-${index}`}
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
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    position: "relative",
    zIndex: 10,
  },
  titleContainer: {
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
  },
  mainTitle: {
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
  pendingSection: {
    marginBottom: 20,
  },
  pendingSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.grey1,
    marginBottom: 8,
  },
  pendingItem: {
    backgroundColor: colors.grey5,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  pendingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.black,
  },
  pendingStatus: {
    fontSize: 12,
    color: colors.grey1,
  },
  pendingAmount: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.black,
    marginBottom: 4,
  },
  pendingDate: {
    fontSize: 12,
    color: colors.grey2,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  retryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "500",
  },
  mintSelector: {
    backgroundColor: colors.grey5,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  mintSelectorTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.black,
    marginBottom: 8,
  },
  mintSelectorDesc: {
    fontSize: 14,
    color: colors.grey1,
    marginBottom: 12,
  },
  mintOption: {
    backgroundColor: colors.grey4,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedMint: {
    backgroundColor: colors.grey3,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  mintOptionText: {
    fontSize: 14,
  },
  mintActionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  mintRetryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  mintRetryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "500",
  },
  offlineIndicator: {
    backgroundColor: colors.error,
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  offlineText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "500",
  },
  adminMenuContainer: {
    position: "relative",
    zIndex: 2,
  },
  adminIconButton: {
    padding: 8,
    backgroundColor: colors.grey5,
    borderRadius: 20,
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  adminMenuBackdrop: {
    position: "absolute",
    top: -300,
    left: -300,
    right: -300,
    bottom: -300,
    zIndex: 1,
    backgroundColor: "transparent",
  },
  adminMenuDropdown: {
    position: "absolute",
    top: 45,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 3,
    minWidth: 250,
    borderWidth: 1,
    borderColor: colors.grey5,
  },
  adminMenuItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey5,
    borderRadius: 6,
    marginBottom: 4,
  },
  adminMenuItemText: {
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
    paddingVertical: 4,
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  adminMenuItemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconSpacing: {
    width: 10,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
    paddingHorizontal: 16,
    gap: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
}))

export default ECashWalletScreen
