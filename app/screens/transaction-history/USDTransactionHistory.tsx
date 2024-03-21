import * as React from "react"
import crashlytics from "@react-native-firebase/crashlytics"
import { ActivityIndicator, SectionList, Text, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, useTheme } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { TransactionItem } from "../../components/transaction-item"

// graphql
import { useTransactionListForDefaultAccountQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { groupTransactionsByDate } from "@app/graphql/transactions"

// utils
import { toastShow } from "../../utils/toast"
import { BalanceHeader } from "@app/components/balance-header"

export const USDTransactionHistory: React.FC = () => {
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const { LL } = useI18nContext()

  const [isContentVisible, setIsContentVisible] = React.useState(false)

  const { data, error, fetchMore, refetch, loading } =
    useTransactionListForDefaultAccountQuery({ skip: !useIsAuthed() })

  const transactionSections = groupTransactionsByDate({
    txs: data?.me?.defaultAccount?.transactions?.edges?.map((el) => el.node) ?? [],
    common: LL.common,
  })

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
    console.error(error)
    crashlytics().recordError(error)
    toastShow({
      message: (translations) => translations.common.transactionsError(),
      currentTranslation: LL,
    })
    return <></>
  } else if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size={"large"} />
      </View>
    )
  }
  return (
    <Screen>
      <View style={[styles.header, styles.container]}>
        <BalanceHeader
          isContentVisible={isContentVisible}
          setIsContentVisible={setIsContentVisible}
          loading={loading}
          breezBalance={0}
          walletType="usd"
        />
      </View>
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
        sections={transactionSections}
        keyExtractor={(item) => item.id}
        onEndReached={fetchNextTransactionsPage}
        onEndReachedThreshold={0.5}
        onRefresh={refetch}
        refreshing={loading}
      />
    </Screen>
  )
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 120,
  },
  error: {
    alignSelf: "center",
    color: colors.error,
  },
  container: {
    marginHorizontal: 20,
  },
}))
