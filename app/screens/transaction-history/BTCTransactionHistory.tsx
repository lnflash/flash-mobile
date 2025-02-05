import React, { useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, SectionList, Text, View } from "react-native"
import { usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, useTheme } from "@rneui/themed"
import { BarIndicator } from "react-native-indicators"
import { StackScreenProps } from "@react-navigation/stack"

// components
import { Screen } from "@app/components/screen"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { BreezTransactionItem } from "@app/components/transaction-item/breez-transaction-item"

// graphql
import { WalletCurrency } from "@app/graphql/generated"
import { groupTransactionsByDate } from "@app/graphql/transactions"

// Breez SDK
import {
  listRefundables,
  Payment,
  RefundableSwap,
} from "@breeztech/react-native-breez-sdk-liquid"
import { listPaymentsBreezSDK } from "@app/utils/breez-sdk-liquid"
import { formatPaymentsBreezSDK } from "@app/hooks/useBreezPayments"

// types
import { toBtcMoneyAmount } from "@app/types/amounts"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"
import { loadJson } from "@app/utils/storage"

type Props = StackScreenProps<RootStackParamList, "USDTransactionHistory">

export const BTCTransactionHistory: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme().theme
  const styles = useStyles()
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()

  const { persistentState, updateState } = usePersistentStateContext()

  const [refundables, setRefundables] = useState<RefundableSwap[]>([])
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
    const refundables = (await listRefundables()) || []
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
    const formattedTxs = txs?.map((edge) =>
      formatPaymentsBreezSDK(
        edge.txId,
        txs,
        convertMoneyAmount(toBtcMoneyAmount(edge.amountSat), WalletCurrency.Usd).amount,
      ),
    )

    return formattedTxs?.filter(Boolean) ?? []
  }

  const transactionSections = groupTransactionsByDate({
    txs: txsList ?? [],
    common: LL.common,
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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size={"large"} />
      </View>
    )
  } else {
    return (
      <Screen>
        <SectionList
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index, section }) => (
            <BreezTransactionItem
              tx={item}
              key={`transaction-${item.id}`}
              subtitle
              isFirst={index === 0}
              isLast={index === section.data.length - 1}
            />
          )}
          initialNumToRender={20}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.noTransactionView}>
              <Text style={styles.noTransactionText}>
                {LL.TransactionScreen.noTransaction()}
              </Text>
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
          contentContainerStyle={{ paddingBottom: 100 }}
        />
        {refundables.length > 0 && (
          <View style={styles.floatingButtonWrapper}>
            <View style={styles.floatingButton}>
              <GaloyPrimaryButton
                title={LL.RefundFlow.pendingTransactions()}
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
  loadingContainer: { justifyContent: "center", alignItems: "center", flex: 1 },
  noTransactionText: {
    fontSize: 24,
  },
  noTransactionView: {
    alignItems: "center",
    flex: 1,
    marginVertical: 48,
  },
  sectionHeaderContainer: {
    backgroundColor: colors.white,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18,
  },
  sectionHeaderText: {
    color: colors.black,
    fontSize: 18,
  },
  floatingButtonWrapper: {
    alignItems: "center",
  },
  floatingButton: {
    position: "absolute",
    bottom: 20,
  },
}))
