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

// types
import { DepositInfo } from "@breeztech/breez-sdk-spark-react-native"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { BreezTransaction, getTransactionId } from "@app/types/transactions"

// utils
import { listPaymentsBreezSDK, listUnclaimedDeposits } from "@app/utils/breez-sdk"
import { groupByDate, formatBreezPayments } from "@app/utils/transactions"

type NavigationProp = StackNavigationProp<RootStackParamList, "BTCTransactionHistory">

export const BTCTransactionHistory = () => {
  const navigation = useNavigation<NavigationProp>()
  const styles = useStyles()
  const { colors } = useTheme().theme
  const { LL, locale } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()

  const [deposits, setDeposits] = useState<DepositInfo[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [breezLoading, setBreezLoading] = useState(false)
  const [txsList, setTxsList] = useState<BreezTransaction[]>([])

  useEffect(() => {
    fetchPaymentsBreez(0)
    fetchUnclaimedDeposits()
  }, [])

  const fetchUnclaimedDeposits = async () => {
    const unclaimedDeposits = (await listUnclaimedDeposits()) || []
    setDeposits(unclaimedDeposits)
  }

  const fetchPaymentsBreez = async (offset: number) => {
    if (!convertMoneyAmount) return

    setBreezLoading(true)

    const payments = await listPaymentsBreezSDK(offset, 15)

    const formattedBreezTxs = formatBreezPayments({ payments, convertMoneyAmount })

    if (offset === 0) {
      setTxsList(formattedBreezTxs)
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

  const transactionSections = groupByDate({
    items: txsList ?? [],
    getTimestamp: (tx) => Number(tx.payment.timestamp),
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
          renderItem={({ item }) => <TxItem key={getTransactionId(item)} tx={item} />}
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
          keyExtractor={(item, index) => getTransactionId(item) + index}
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
        {deposits.length > 0 && (
          <View style={styles.floatingButtonWrapper}>
            <View style={styles.floatingButton}>
              <PrimaryBtn
                label={`${deposits.length} Unclaimed Deposit${
                  deposits.length === 1 ? "" : "s"
                }`}
                onPress={() => navigation.navigate("UnclaimedDepositsList")}
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
