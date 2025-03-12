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
import { formatPaymentsBreezSDK } from "@app/hooks/useBreezPayments"
import { useBreez, usePriceConversion } from "@app/hooks"
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"

// gql
import {
  TransactionEdge,
  TransactionFragment,
  WalletCurrency,
} from "@app/graphql/generated"

// utils
import { toBtcMoneyAmount } from "@app/types/amounts"
import { breezSDKInitialized, listPaymentsBreezSDK } from "@app/utils/breez-sdk-liquid"

// breez
import {
  addEventListener,
  Payment,
  removeEventListener,
  SdkEvent,
  SdkEventVariant,
} from "@breeztech/react-native-breez-sdk-liquid"

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
  const { persistentState, updateState } = usePersistentStateContext()
  const { convertMoneyAmount } = usePriceConversion()
  const { refreshBreez } = useBreez()

  const [breezListenerId, setBreezListenerId] = useState<string>()
  const [breezTxsLoading, setBreezTxsLoading] = useState(false)
  const [breezTransactions, setBreezTransactions] = useState<Payment[]>([])
  const [mergedTransactions, setMergedTransactions] = useState<TransactionFragment[]>(
    persistentState?.mergedTransactions || [],
  )

  useEffect(() => {
    if (persistentState.isAdvanceMode && breezSDKInitialized) {
      fetchPaymentsBreez()
    }
  }, [refreshTriggered, breezSDKInitialized, persistentState.isAdvanceMode])

  useEffect(() => {
    if (!loadingAuthed && !breezTxsLoading) {
      mergeTransactions(breezTransactions)
    }
  }, [transactionsEdges, breezTransactions, loadingAuthed, breezTxsLoading])

  useEffect(() => {
    if (persistentState.isAdvanceMode && breezSDKInitialized && !breezListenerId) {
      addBreezEventListener()
    } else if (!persistentState.isAdvanceMode) {
      setBreezTransactions([])
      setBreezListenerId(undefined)
    }
    return removeBreezEventListener
  }, [persistentState.isAdvanceMode, breezSDKInitialized, breezListenerId])

  const addBreezEventListener = async () => {
    const listenerId = await addEventListener((e: SdkEvent) => {
      if (e.type !== SdkEventVariant.SYNCED) {
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
        setBreezTransactions(payments)
        setBreezTxsLoading(false)
      }
    } catch (err) {
      console.log("listPaymentsBreezSDK ERROR:", err)
    }
  }

  const mergeTransactions = async (breezTxs: Payment[]) => {
    const mergedTransactions: TransactionFragment[] = []
    const formattedBreezTxs = await formatBreezTransactions(breezTxs)

    let i = 0
    let j = 0
    while (transactionsEdges.length != i && formattedBreezTxs.length != j) {
      if (transactionsEdges[i].node?.createdAt > formattedBreezTxs[j]?.createdAt) {
        mergedTransactions.push(transactionsEdges[i].node)
        i++
      } else {
        mergedTransactions.push(formattedBreezTxs[j])
        j++
      }
    }

    while (transactionsEdges.length !== i) {
      mergedTransactions.push(transactionsEdges[i].node)
      i++
    }

    while (formattedBreezTxs.length !== j) {
      mergedTransactions.push(formattedBreezTxs[j])
      j++
    }

    updateMergedTransactions(mergedTransactions)
  }

  const formatBreezTransactions = async (txs: Payment[]) => {
    if (!convertMoneyAmount || !txs) {
      return []
    }
    const formattedTxs = txs?.map((edge) =>
      formatPaymentsBreezSDK(
        edge.txId,
        txs,
        convertMoneyAmount(toBtcMoneyAmount(edge.amountSat), WalletCurrency.Usd).amount,
      ),
    )

    return formattedTxs?.filter(Boolean) ?? []
  }

  const updateMergedTransactions = (txs: TransactionFragment[]) => {
    setMergedTransactions(txs.slice(0, 3))
    updateState((state: any) => {
      if (state)
        return {
          ...state,
          mergedTransactions: txs.slice(0, 3),
        }
      return undefined
    })
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
        {mergedTransactions.map((item, index) => (
          <TxItem tx={item} />
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

const Wrapper = styled.View``

const RecentActivity = styled.TouchableOpacity`
  margin-top: 30px;
  margin-bottom: 10px;
`
