import React, { useEffect, useState } from "react"
import { ActivityIndicator } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import styled from "styled-components/native"

// components
import { TxItem } from "../../components/transaction-item"

// hooks
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useBreez, usePriceConversion } from "@app/hooks"

// utils
import { formatBreezPayments } from "@app/utils/transactions"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"

// gql
import { TransactionEdge } from "@app/graphql/generated"

// breez
import {
  addEventListener,
  breezSDKInitialized,
  listPaymentsBreezSDK,
  removeEventListener,
} from "@app/utils/breez-sdk"
import { Payment, SdkEvent, SdkEvent_Tags } from "@breeztech/breez-sdk-spark-react-native"

// types
import {
  UnifiedTransaction,
  IbexTransaction,
  getTransactionId,
  getTransactionTimestamp,
} from "@app/types/transactions"

type Props = {
  loadingAuthed: boolean
  transactionsEdges: TransactionEdge[]
  refreshTriggered: boolean
}

const Transactions: React.FC<Props> = ({
  loadingAuthed,
  transactionsEdges,
  refreshTriggered,
}) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { persistentState } = usePersistentStateContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { refreshBreez } = useBreez()

  const [breezListenerId, setBreezListenerId] = useState<string>()
  const [breezTxsLoading, setBreezTxsLoading] = useState(false)
  const [breezPayments, setBreezPayments] = useState<Payment[]>([])
  const [mergedTransactions, setMergedTransactions] = useState<UnifiedTransaction[]>([])

  useEffect(() => {
    if (persistentState.isAdvanceMode && breezSDKInitialized) {
      fetchPaymentsBreez()
    }
  }, [refreshTriggered, breezSDKInitialized, persistentState.isAdvanceMode])

  useEffect(() => {
    if (!loadingAuthed && !breezTxsLoading) {
      mergeTransactions(breezPayments)
    }
  }, [transactionsEdges, breezPayments, loadingAuthed, breezTxsLoading])

  useEffect(() => {
    if (persistentState.isAdvanceMode && breezSDKInitialized && !breezListenerId) {
      addBreezEventListener()
    } else if (!persistentState.isAdvanceMode) {
      setBreezPayments([])
      setBreezListenerId(undefined)
    }
    return removeBreezEventListener
  }, [persistentState.isAdvanceMode, breezSDKInitialized, breezListenerId])

  const addBreezEventListener = async () => {
    const listenerId = await addEventListener((e: SdkEvent) => {
      if (e.tag !== SdkEvent_Tags.Synced && e.tag !== SdkEvent_Tags.Optimization) {
        fetchPaymentsBreez()
      }
    })
    setBreezListenerId(listenerId)
  }

  const removeBreezEventListener = () => {
    if (breezListenerId) {
      removeEventListener(breezListenerId)
      setBreezListenerId(undefined)
    }
  }

  const fetchPaymentsBreez = async () => {
    try {
      if (!breezTxsLoading) {
        setBreezTxsLoading(true)
        refreshBreez()
        const payments = await listPaymentsBreezSDK(0, 3)
        setBreezPayments(payments)
        setBreezTxsLoading(false)
      }
    } catch (err) {
      console.log("listPaymentsBreezSDK ERROR:", err)
    }
  }

  const mergeTransactions = (breezTxs: Payment[]) => {
    if (!convertMoneyAmount) return

    // Convert Ibex transactions to UnifiedTransaction
    const ibexTxs: IbexTransaction[] = transactionsEdges.map((edge) => ({
      source: "ibex" as const,
      transaction: edge.node,
    }))

    // Convert Breez payments to UnifiedTransaction
    const breezTransactions = formatBreezPayments({
      payments: breezTxs,
      convertMoneyAmount,
    })

    // Merge and sort by timestamp (newest first)
    const merged: UnifiedTransaction[] = [...ibexTxs, ...breezTransactions].sort(
      (a, b) => getTransactionTimestamp(b) - getTransactionTimestamp(a),
    )

    if (merged.length > 0) {
      setMergedTransactions(merged.slice(0, 3))
    }
  }

  const navigateToTransactionHistory = () => {
    navigation.navigate(
      persistentState.isAdvanceMode ? "TransactionHistoryTabs" : "USDTransactionHistory",
    )
  }

  if (mergedTransactions.length > 0) {
    return (
      <Wrapper>
        <RecentActivity onPress={navigateToTransactionHistory} activeOpacity={0.5}>
          <Text type="bl" bold>
            {LL.TransactionScreen.title()}
          </Text>
        </RecentActivity>
        {mergedTransactions.map((item) => (
          <TxItem key={getTransactionId(item)} tx={item} />
        ))}
      </Wrapper>
    )
  } else {
    return (
      <ActivityIndicator
        animating={breezTxsLoading || loadingAuthed}
        size="large"
        color={colors.primary}
        style={{ marginTop: 24 }}
      />
    )
  }
}

export default Transactions

const Wrapper = styled.View`
  padding-horizontal: 20px;
`

const RecentActivity = styled.TouchableOpacity`
  margin-top: 10px;
  margin-bottom: 10px;
`
