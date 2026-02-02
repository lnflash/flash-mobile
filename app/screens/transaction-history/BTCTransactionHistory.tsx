import React, { useEffect, useState } from "react"
import { RefreshControl, SectionList, View } from "react-native"
import { usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useNavigation } from "@react-navigation/native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { BarIndicator } from "react-native-indicators"
import { StackNavigationProp } from "@react-navigation/stack"

// components
import { Screen } from "@app/components/screen"
import { TxItem } from "@app/components/transaction-item"
import { Loading } from "@app/contexts/ActivityIndicatorContext"
import { PrimaryBtn } from "@app/components/buttons"

// graphql
import { WalletCurrency } from "@app/graphql/generated"
import { groupTransactionsByDate } from "@app/graphql/transactions"

// Breez SDK
import {
  listPaymentsBreezSDK,
  Payment,
  listUnclaimedDeposits,
  DepositInfo,
} from "@app/utils/breez-sdk-spark"
import { formatPaymentsBreezSDK } from "@app/hooks/useBreezPayments"

// types
import { toBtcMoneyAmount } from "@app/types/amounts"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"
import { loadJson } from "@app/utils/storage"

type NavigationProp = StackNavigationProp<RootStackParamList, "USDTransactionHistory">

export const BTCTransactionHistory = () => {
  const navigation = useNavigation<NavigationProp>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL, locale } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()

  const { persistentState, updateState } = usePersistentStateContext()

  const [refundables, setRefundables] = useState<DepositInfo[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [breezLoading, setBreezLoading] = useState(false)
  const [txsList, setTxsList] = useState<any[]>(persistentState.btcTransactions || [])

  useEffect(() => {
    fetchPaymentsBreez(0)
    fetchRefundables()
  }, [])

  const fetchRefundables = async () => {
    const refundables = (await listUnclaimedDeposits()) || []
    const refundedTxs = (await loadJson("refundedTxs")) || []
    console.log("Refundable and Refunded Transactions>>>>>>>>>>", [
      ...refundables,
      ...refundedTxs,
    ])
    setRefundables([...refundables, ...refundedTxs])
  }

  const fetchPaymentsBreez = async (offset: number) => {
    setBreezLoading(true)

    const payments = await listPaymentsBreezSDK(offset, 15)

    let formattedBreezTxs = await formatBreezTransactions(payments)

    if (offset === 0) {
      setTxsList(formattedBreezTxs)
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            btcTransactions: formattedBreezTxs,
          }
        return undefined
      })
    } else {
      setTxsList([...txsList, ...formattedBreezTxs])
    }

    setBreezLoading(false)
    setRefreshing(false)
    setFetchingMore(false)
    if (payments.length < 15) {
      setHasMore(false)
    } else {
      setHasMore(true)
    }
  }

  const formatBreezTransactions = async (txs: Payment[]) => {
    if (!convertMoneyAmount || !txs) {
      return []
    }
    const formattedTxs = txs?.map((txDetails) =>
      formatPaymentsBreezSDK({ txDetails, convertMoneyAmount }),
    )

    return formattedTxs?.filter(Boolean) ?? []
  }

  const transactionSections = groupTransactionsByDate({
    txs: txsList ?? [],
    LL,
    locale,
  })

  const onRefresh = () => {
    if (!breezLoading) {
      setRefreshing(true)
      fetchPaymentsBreez(0)
    }
  }

  const onEndReached = () => {
    if (!breezLoading && hasMore) {
      setFetchingMore(true)
      fetchPaymentsBreez(txsList.length)
    }
  }

  if (breezLoading && transactionSections.length === 0) {
    return <Loading />
  } else {
    return (
      <Screen>
        <SectionList
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <TxItem key={item.id} tx={item} />}
          initialNumToRender={20}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderContainer}>
              <Text type="p1" bold>
                {title}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.noTransactionView}>
              <Text type="h1">{LL.TransactionScreen.noTransaction()}</Text>
            </View>
          }
          ListFooterComponent={() =>
            fetchingMore && (
              <BarIndicator
                color={colors.primary}
                count={5}
                size={20}
                style={{ marginVertical: 20 }}
              />
            )
          }
          sections={transactionSections}
          keyExtractor={(item, index) => item.id + index}
          onEndReachedThreshold={0.5}
          onEndReached={onEndReached}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 20 }}
        />
        {refundables.length > 0 && (
          <View style={styles.floatingButtonWrapper}>
            <View style={styles.floatingButton}>
              <PrimaryBtn
                label={LL.RefundFlow.pendingTransactions()}
                onPress={() => navigation.navigate("RefundTransactionList")}
              />
            </View>
          </View>
        )}
      </Screen>
    )
  }
}

const useStyles = makeStyles(({ colors }) => ({
  noTransactionView: {
    flex: 1,
    alignItems: "center",
    marginVertical: 48,
  },
  sectionHeaderContainer: {
    backgroundColor: colors.white,
    padding: 15,
  },
  floatingButtonWrapper: {
    alignItems: "center",
  },
  floatingButton: {
    width: "90%",
    position: "absolute",
    bottom: 20,
  },
}))
