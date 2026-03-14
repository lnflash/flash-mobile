import React, { useMemo } from "react"
import { getCrashlytics } from "@react-native-firebase/crashlytics"
import { SectionList, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { Text, makeStyles } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { TxItem } from "../../components/transaction-item"
import { Loading } from "@app/contexts/ActivityIndicatorContext"

// graphql
import { useTransactionListForDefaultAccountQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"

// types
import { getTransactionId, getTransactionTimestamp } from "@app/types/transactions"

// utils
import { toastShow } from "../../utils/toast"
import { groupByDate } from "@app/utils/transactions"

export const USDTransactionHistory: React.FC = () => {
  const styles = useStyles()
  const { LL, locale } = useI18nContext()

  const { data, error, fetchMore, refetch, loading } =
    useTransactionListForDefaultAccountQuery({
      fetchPolicy: "cache-and-network",
      skip: !useIsAuthed(),
    })

  const transactions = data?.me?.defaultAccount?.transactions

  const sections = useMemo(
    () =>
      groupByDate({
        items:
          transactions?.edges?.map((edge) => ({
            source: "ibex" as const,
            transaction: edge.node,
          })) ?? [],
        getTimestamp: getTransactionTimestamp,
        LL,
        locale,
      }),
    [transactions, LL, locale],
  )

  if (error) {
    console.error(error)
    getCrashlytics().recordError(error)
    toastShow({
      message: (translations) => translations.common.transactionsError(),
    })
    return <></>
  }

  if (!transactions) {
    return <Loading />
  }

  const fetchNextTransactionsPage = () => {
    const pageInfo = transactions?.pageInfo

    if (pageInfo.hasNextPage) {
      fetchMore({
        variables: {
          after: pageInfo.endCursor,
        },
      })
    }
  }

  return (
    <Screen>
      <SectionList
        showsVerticalScrollIndicator={false}
        maxToRenderPerBatch={10}
        initialNumToRender={20}
        renderItem={({ item }) => <TxItem key={getTransactionId(item)} tx={item} />}
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
        sections={sections}
        keyExtractor={(item) => getTransactionId(item)}
        onEndReached={fetchNextTransactionsPage}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={loading}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      />
    </Screen>
  )
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
