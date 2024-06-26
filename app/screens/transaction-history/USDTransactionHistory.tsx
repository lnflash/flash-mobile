import * as React from "react"
import crashlytics from "@react-native-firebase/crashlytics"
import { ActivityIndicator, SectionList, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Text, makeStyles, useTheme } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { TransactionItem } from "../../components/transaction-item"

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
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const { persistentState, updateState } = usePersistentStateContext()
  const [transactions, setTransactions] = React.useState<SectionTransactions[]>(
    persistentState.usdTransactions || [],
  )

  const { data, error, fetchMore, refetch, loading } =
    useTransactionListForDefaultAccountQuery({
      skip: !useIsAuthed(),
      fetchPolicy: "network-only",
      nextFetchPolicy: "cache-and-network",
    })

  React.useEffect(() => {
    if (
      data?.me?.defaultAccount?.transactions?.edges &&
      data?.me?.defaultAccount?.transactions?.edges?.length > 0
    ) {
      const transactionSections = groupTransactionsByDate({
        txs: data?.me?.defaultAccount?.transactions?.edges?.map((el) => el.node) ?? [],
        common: LL.common,
      })
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

  const fetchNextTransactionsPage = () => {
    const pageInfo = data?.me?.defaultAccount?.transactions?.pageInfo
    if (pageInfo?.hasNextPage) {
      fetchMore({
        variables: {
          after: pageInfo.endCursor,
        },
      })
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
        <Text style={styles.noTransactionText}>
          {LL.TransactionScreen.noTransaction()}
        </Text>
      </View>
    )
  } else if (loading && transactions.length === 0) {
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
            <TransactionItem
              tx={item}
              key={`txn-${item.id}`}
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
          sections={transactions}
          keyExtractor={(item) => item.id}
          onEndReached={fetchNextTransactionsPage}
          onEndReachedThreshold={0.5}
          onRefresh={refetch}
          refreshing={loading}
        />
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
}))
