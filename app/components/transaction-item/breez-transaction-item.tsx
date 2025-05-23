import { View } from "react-native"

// eslint-disable-next-line camelcase
// import { useFragment_experimental } from "@apollo/client"
import {
  TransactionFragment,
  // TransactionFragmentDoc,
  WalletCurrency,
  useHideBalanceQuery,
} from "@app/graphql/generated"
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { testProps } from "@app/utils/testProps"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"

import { useAppConfig } from "@app/hooks"
import { toWalletAmount } from "@app/types/amounts"
import { Text, makeStyles, ListItem, Icon } from "@rneui/themed"
import HideableArea from "../hideable-area/hideable-area"
import { IconTransaction } from "../icon-transactions"
import { TransactionDate } from "../transaction-date"
import { useI18nContext } from "@app/i18n/i18n-react"

// This should extend the Transaction directly from the cache
export const useDescriptionDisplay = ({
  tx,
  bankName,
  showMemo,
}: {
  tx: TransactionFragment | undefined
  bankName: string
  showMemo?: boolean
}) => {
  const { LL } = useI18nContext()

  if (!tx) {
    return ""
  }

  const { memo, direction, settlementVia } = tx
  if (memo && (!memo.includes("Pay to Flash Wallet User") || showMemo)) {
    return memo
  }

  const isReceive = direction === "RECEIVE"

  switch (settlementVia?.__typename) {
    case "SettlementViaOnChain":
      return "OnChain Payment"
    case "SettlementViaLn":
      if (isReceive) {
        return `Received`
      }
      return "Sent"

    case "SettlementViaIntraLedger":
      return isReceive
        ? `${LL.common.from()} ${
            settlementVia?.counterPartyUsername || bankName + " User"
          }`
        : `${LL.common.to()} ${settlementVia?.counterPartyUsername || bankName + " User"}`
  }
}

// Shared style helper - duplicate in both files since they're independent
const getAmountStyle = (
  styles: ReturnType<typeof useStyles>,
  isReceive: boolean,
  isPending: boolean,
) => {
  if (isPending) {
    return styles.pending
  }
  return isReceive ? styles.receive : styles.send
}

type Props = {
  tx: TransactionFragment | undefined
  subtitle?: boolean
  isFirst?: boolean
  isLast?: boolean
  isOnHomeScreen?: boolean
}

export const BreezTransactionItem: React.FC<Props> = ({
  tx,
  subtitle = false,
  isFirst = false,
  isLast = false,
  isOnHomeScreen = false,
}) => {
  const styles = useStyles({
    isFirst,
    isLast,
    isOnHomeScreen,
  })

  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const {
    appConfig: { galoyInstance },
  } = useAppConfig()
  const { formatMoneyAmount, formatCurrency, moneyAmountToDisplayCurrencyString } =
    useDisplayCurrency()
  const { data: { hideBalance } = {} } = useHideBalanceQuery()
  const isBalanceVisible = hideBalance ?? false

  const description = useDescriptionDisplay({
    tx,
    bankName: galoyInstance.name,
  })

  if (!tx || Object.keys(tx).length === 0) {
    return null
  }

  const isReceive = tx.direction === "RECEIVE"
  const isPending = tx.status === "PENDING"

  const walletCurrency = tx.settlementCurrency as WalletCurrency

  // set amount in sats for breez wallet as secondarqy amount
  const formattedSettlementSecondaryAmount = formatMoneyAmount({
    moneyAmount: toWalletAmount({
      amount: tx.settlementAmount,
      currency: tx.settlementCurrency,
    }),
  })

  const formattedDisplayAmount = formatCurrency({
    amountInMajorUnits: tx.settlementDisplayAmount,
    currency: tx.settlementDisplayCurrency,
  })

  const convertedAmount = moneyAmountToDisplayCurrencyString({
    moneyAmount: toWalletAmount({
      amount: tx.settlementAmount,
      currency: tx.settlementCurrency,
    }),
    isApproximate: false,
  })

  return (
    <ListItem
      {...testProps("breez-transaction-item")}
      containerStyle={styles.container}
      onPress={() =>
        navigation.navigate("breezTransactionDetail", {
          tx,
        })
      }
    >
      <IconTransaction
        onChain={tx.settlementVia?.__typename === "SettlementViaOnChain"}
        isReceive={isReceive}
        pending={isPending}
        walletCurrency={walletCurrency}
      />
      <ListItem.Content {...testProps("list-item-content")}>
        <ListItem.Title
          numberOfLines={1}
          ellipsizeMode="tail"
          {...testProps("tx-description")}
        >
          {description}
        </ListItem.Title>
        <ListItem.Subtitle>
          {subtitle ? <TransactionDate diffDate={true} {...tx} /> : undefined}
        </ListItem.Subtitle>
      </ListItem.Content>

      <HideableArea
        isContentVisible={isBalanceVisible}
        hiddenContent={<Icon style={styles.hiddenBalanceContainer} name="eye" />}
      >
        <View>
          <Text
            style={[getAmountStyle(styles, isReceive, isPending), styles.primaryAmount]}
          >
            {convertedAmount}
          </Text>

          <Text
            style={[getAmountStyle(styles, isReceive, isPending), styles.secondaryAmount]}
          >
            {formattedSettlementSecondaryAmount}
          </Text>
        </View>
      </HideableArea>
    </ListItem>
  )
}

type UseStyleProps = {
  isFirst?: boolean
  isLast?: boolean
  isOnHomeScreen?: boolean
}

// Update styles
const useStyles = makeStyles(({ colors }, props: UseStyleProps) => ({
  container: {
    height: 60,
    paddingVertical: 9,
    borderColor: colors.grey4,
    overflow: "hidden",
    backgroundColor: colors.grey5,
    borderTopWidth: (props.isFirst && props.isOnHomeScreen) || !props.isFirst ? 1 : 0,
    borderBottomLeftRadius: props.isLast && props.isOnHomeScreen ? 12 : 0,
    borderBottomRightRadius: props.isLast && props.isOnHomeScreen ? 12 : 0,
  },
  hiddenBalanceContainer: {
    fontSize: 16,
    color: colors.grey0,
  },
  pending: {
    color: colors.grey1,
    textAlign: "right",
    flexWrap: "wrap",
  },
  receive: {
    color: colors.green,
    textAlign: "right",
    flexWrap: "wrap",
  },
  send: {
    color: colors.grey0,
    textAlign: "right",
    flexWrap: "wrap",
  },
  secondaryAmount: {
    fontSize: 12,
    marginTop: 2,
  },
  primaryAmount: {
    fontSize: 18,
  },
}))
