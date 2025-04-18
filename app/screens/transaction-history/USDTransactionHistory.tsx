import React, { useEffect, useState } from "react"
import crashlytics from "@react-native-firebase/crashlytics"
import { RefreshControl, SectionList, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import { BarIndicator } from "react-native-indicators"

// components
import { Screen } from "@app/components/screen"
import { TxItem } from "../../components/transaction-item"
import { Loading } from "@app/contexts/ActivityIndicatorContext"

// graphql
import { useTransactionListForDefaultAccountQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { groupTransactionsByDate } from "@app/graphql/transactions"

// utils
import { toastShow } from "../../utils/toast"
import { SectionTransactions } from "./index.types"

// store
import { usePersistentStateContext } from "@app/store/persistent-state"

export const USDTransactionHistory: React.FC = () => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL } = useI18nContext()

  const { persistentState, updateState } = usePersistentStateContext()

  const [hasMore, setHasMore] = useState<boolean | undefined>()
  const [numOfTxs, setNumOfTxs] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [transactions, setTransactions] = useState<SectionTransactions[]>(
    persistentState.usdTransactions || [],
  )

  const { data, error, fetchMore, refetch, loading } =
    useTransactionListForDefaultAccountQuery({
      skip: !useIsAuthed(),
      fetchPolicy: "network-only",
      nextFetchPolicy: "cache-and-network",
      variables: { first: 15 },
    })

  useEffect(() => {
    if (
      data?.me?.defaultAccount?.transactions?.edges &&
      data?.me?.defaultAccount?.transactions?.edges?.length > 0
    ) {
      const txs =
        data?.me?.defaultAccount?.transactions?.edges?.map((el) => el.node) ?? []

      const transactionSections = groupTransactionsByDate({
        txs: txs,
        common: LL.common,
      })

      setHasMore(data.me.defaultAccount.transactions.pageInfo.hasNextPage)
      setNumOfTxs(txs.length)
      setTransactions(transactionSections)
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            usdTransactions: transactionSections,
          }
        return undefined
      })
    }
  }, [data?.me?.defaultAccount?.transactions?.edges])

  const onEndReached = async () => {
    if (!loading && !fetchingMore && hasMore) {
      setFetchingMore(true)
      const { data } = await fetchMore({
        variables: { first: numOfTxs + 15 },
      })
      const txs =
        data?.me?.defaultAccount?.transactions?.edges?.map((el) => el.node) ?? []
      const transactionSections = groupTransactionsByDate({
        txs: txs,
        common: LL.common,
      })

      setHasMore(data.me?.defaultAccount.transactions?.pageInfo.hasNextPage)
      setNumOfTxs(txs.length)
      setTransactions(transactionSections)
      setFetchingMore(false)
    }
  }

  const onRefresh = async () => {
    if (!loading && !refreshing) {
      setRefreshing(true)
      const { data } = await fetchMore({
        variables: { first: 15 },
      })
      const txs =
        data?.me?.defaultAccount?.transactions?.edges?.map((el) => el.node) ?? []
      const transactionSections = groupTransactionsByDate({
        txs: txs,
        common: LL.common,
      })

      setHasMore(data.me?.defaultAccount.transactions?.pageInfo.hasNextPage)
      setNumOfTxs(txs.length)
      setTransactions(transactionSections)
      setRefreshing(false)
    }
  }

  if (error) {
    if (error.message === "Network request failed") {
      toastShow({
        message: "Wallet is offline",
        currentTranslation: LL,
      })
    } else {
      toastShow({
        message: (translations) => translations.common.transactionsError(),
        currentTranslation: LL,
      })
    }
    console.error(error)
    crashlytics().recordError(error)
    return (
      <View style={styles.noTransactionView}>
        <Text type="h1">{LL.TransactionScreen.noTransaction()}</Text>
      </View>
    )
  } else if (loading && transactions.length === 0) {
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
          sections={transactions}
          keyExtractor={(item) => item.id}
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
          contentContainerStyle={{ paddingHorizontal: 20 }}
        />
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
}))
