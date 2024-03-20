import * as React from "react"
import { ActivityIndicator, SectionList, Text, View } from "react-native"
import { usePriceConversion } from "@app/hooks"
import { useI18nContext } from "@app/i18n/i18n-react"
import { makeStyles, useTheme } from "@rneui/themed"

// components
import { Screen } from "@app/components/screen"
import { BreezTransactionItem } from "@app/components/transaction-item/breez-transaction-item"

// graphql
import {
  WalletCurrency,
  useHomeAuthedQuery,
  useHomeUnauthedQuery,
  useRealtimePriceQuery,
} from "@app/graphql/generated"
import { groupTransactionsByDate } from "@app/graphql/transactions"

// Breez SDK
import { listPaymentsBreezSDK } from "@app/utils/breez-sdk"
import { Payment } from "@breeztech/react-native-breez-sdk"
import { formatPaymentsBreezSDK } from "@app/hooks/useBreezPayments"
import useBreezBalance from "@app/hooks/useBreezBalance"

// types
import { toBtcMoneyAmount } from "@app/types/amounts"
import { SectionTransactions } from "./index.types"
import { BalanceHeader } from "@app/components/balance-header"
import { useIsAuthed } from "@app/graphql/is-authed-context"

export const BTCTransactionHistory: React.FC = () => {
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()
  const isAuthed = useIsAuthed()
  const { LL } = useI18nContext()
  const { convertMoneyAmount } = usePriceConversion()
  const [breezLoading, setBreezLoading] = React.useState(false)
  const [txsList, setTxsList] = React.useState<SectionTransactions[]>([])

  // Adding in Balance Header
  const { loading: loadingAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
  })
  const { loading: loadingPrice } = useRealtimePriceQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    nextFetchPolicy: "cache-and-network", // this enables offline mode use-case
  })
  const { loading: loadingUnauthed } = useHomeUnauthedQuery()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [breezBalance, refreshBreezBalance] = useBreezBalance()
  const loading = (loadingAuthed || loadingPrice || loadingUnauthed) && isAuthed
  const [isContentVisible, setIsContentVisible] = React.useState(false)

  React.useEffect(() => {
    fetchPaymentsBreez()
  }, [])

  const fetchPaymentsBreez = async () => {
    setBreezLoading(true)

    const payments = await listPaymentsBreezSDK()
    const formattedBreezTxs = await formatBreezTransactions(payments)
    const transactionSections = groupTransactionsByDate({
      txs: formattedBreezTxs ?? [],
      common: LL.common,
    })

    setTxsList(transactionSections)
    setBreezLoading(false)
  }

  const formatBreezTransactions = async (txs: Payment[]) => {
    if (!convertMoneyAmount || !txs) {
      return []
    }
    const formattedTxs = txs?.map((edge) =>
      formatPaymentsBreezSDK(
        edge.id,
        txs,
        convertMoneyAmount(toBtcMoneyAmount(edge.amountMsat / 1000), WalletCurrency.Usd)
          .amount,
      ),
    )

    return formattedTxs?.filter(Boolean) ?? []
  }

  if (breezLoading) {
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
          breezBalance={breezBalance}
          walletType="btc"
        />
      </View>
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
        sections={txsList}
        keyExtractor={(item) => item.id}
        onEndReachedThreshold={0.5}
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
