import React, { useEffect } from "react"
import { Linking, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import Icon from "react-native-vector-icons/Ionicons"

// components
import { IconTransaction } from "../../components/icon-transactions"
import { TransactionDate } from "@app/components/transaction-date"
import { WalletSummary } from "@app/components/wallet-summary"
import { GaloyInfo } from "@app/components/atomic/galoy-info"
import { Screen } from "../../components/screen"

// hooks
import { useDisplayCurrency } from "@app/hooks/use-display-currency"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppConfig } from "@app/hooks"

// utils | types
import { toWalletAmount } from "@app/types/amounts"
import { SettlementVia } from "@app/graphql/generated"
import { getDescriptionDisplay } from "@app/graphql/transactions"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

type RowProps = {
  entry: string
  value?: string | React.JSX.Element
  __typename?: "SettlementViaIntraLedger" | "SettlementViaLn" | "SettlementViaOnChain"
  content?: React.JSX.Element
}

const Row = ({ entry, value, __typename, content }: RowProps) => {
  const styles = useStyles()
  const { colors } = useTheme().theme
  return (
    <View style={styles.description}>
      <Text style={styles.entry}>
        {entry}
        {__typename === "SettlementViaOnChain" && (
          <Icon name="open-outline" size={18} color={colors.grey0} />
        )}
      </Text>
      {content || (
        <View style={styles.valueContainer}>
          <Text selectable style={styles.value}>
            {value}
          </Text>
        </View>
      )}
    </View>
  )
}

const typeDisplay = (instance: SettlementVia) => {
  switch (instance.__typename) {
    case "SettlementViaOnChain":
      return "OnChain"
    case "SettlementViaLn":
      return "Lightning"
    case "SettlementViaIntraLedger":
      return "IntraLedger"
  }
}

type Props = StackScreenProps<RootStackParamList, "transactionDetail">

export const TransactionDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tx } = route.params

  const styles = useStyles()
  const { colors } = useTheme().theme
  const { galoyInstance } = useAppConfig().appConfig
  const { LL } = useI18nContext()

  const { formatMoneyAmount, formatCurrency } = useDisplayCurrency()

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <Icon name={"close"} size={40} color={colors.black} />
        </TouchableOpacity>
      ),
    })
  }, [navigation])

  if (!tx || Object.keys(tx).length === 0)
    return <Text>{"No transaction found with this ID (should not happen)"}</Text>

  const {
    id,
    settlementCurrency,
    settlementAmount,
    settlementDisplayFee,
    settlementDisplayAmount,
    settlementDisplayCurrency,
    settlementFee,
    settlementVia,
    initiationVia,
  } = tx

  const viewInExplorer = (hash: string): Promise<Linking> =>
    Linking.openURL(galoyInstance.blockExplorer + hash)

  const isReceive = tx.direction === "RECEIVE"

  const spendOrReceiveText = isReceive
    ? LL.TransactionDetailScreen.received()
    : LL.TransactionDetailScreen.spent()

  const displayAmount = formatCurrency({
    amountInMajorUnits: settlementDisplayAmount,
    currency: settlementDisplayCurrency,
  })

  const formattedPrimaryFeeAmount = formatCurrency({
    amountInMajorUnits: settlementDisplayFee,
    currency: settlementDisplayCurrency,
  })

  const formattedSettlementFee = formatMoneyAmount({
    moneyAmount: toWalletAmount({
      amount: settlementFee,
      currency: settlementCurrency,
    }),
  })

  const onChainTxBroadcasted =
    settlementVia?.__typename === "SettlementViaOnChain" &&
    settlementVia?.transactionHash !== null

  const onChainTxNotBroadcasted =
    settlementVia?.__typename === "SettlementViaOnChain" &&
    settlementVia?.transactionHash === null

  const formattedSecondaryFeeAmount =
    settlementDisplayCurrency === settlementCurrency ? undefined : formattedSettlementFee

  const formattedFeeText =
    formattedPrimaryFeeAmount +
    (formattedSecondaryFeeAmount ? ` (${formattedSecondaryFeeAmount})` : ``)

  const description = getDescriptionDisplay({
    LL,
    tx,
    bankName: galoyInstance.name,
    showMemo: true,
  })

  return (
    <Screen unsafe preset="scroll">
      <View style={styles.amountView}>
        <IconTransaction
          isReceive={isReceive}
          walletCurrency={settlementCurrency}
          pending={false}
          onChain={false}
        />
        <Text type="h2">{spendOrReceiveText}</Text>
        <Text type="h1">{displayAmount}</Text>
      </View>

      <View style={styles.transactionDetailView}>
        {onChainTxNotBroadcasted && (
          <View style={styles.txNotBroadcast}>
            <GaloyInfo>{LL.TransactionDetailScreen.txNotBroadcast()}</GaloyInfo>
          </View>
        )}
        <Row
          entry={
            isReceive
              ? LL.TransactionDetailScreen.receivingAccount()
              : LL.TransactionDetailScreen.sendingAccount()
          }
          content={
            <WalletSummary
              amountType={tx.direction}
              settlementAmount={toWalletAmount({
                amount: Math.abs(settlementAmount),
                currency: settlementCurrency,
              })}
              txDisplayAmount={settlementDisplayAmount}
              txDisplayCurrency={settlementDisplayCurrency}
            />
          }
        />
        <Row entry={LL.common.date()} value={<TransactionDate {...tx} />} />
        {(!isReceive || settlementCurrency === "BTC") && (
          <Row entry={LL.common.fees()} value={formattedFeeText} />
        )}
        <Row entry={LL.common.description()} value={description} />
        {settlementVia?.__typename === "SettlementViaIntraLedger" && (
          <Row
            entry={LL.TransactionDetailScreen.paid()}
            value={settlementVia?.counterPartyUsername || galoyInstance.name}
          />
        )}
        <Row entry={LL.common.type()} value={typeDisplay(settlementVia)} />
        {settlementVia?.__typename === "SettlementViaLn" &&
          initiationVia.__typename === "InitiationViaLn" &&
          initiationVia.paymentHash && (
            <Row entry="Hash" value={initiationVia.paymentHash} />
          )}
        {onChainTxBroadcasted && settlementVia?.transactionHash && (
          <TouchableWithoutFeedback
            onPress={() => viewInExplorer(settlementVia?.transactionHash || "")}
          >
            <View>
              <Row
                entry="Hash"
                value={settlementVia?.transactionHash}
                __typename={settlementVia?.__typename}
              />
            </View>
          </TouchableWithoutFeedback>
        )}
        {id && <Row entry="id" value={id} />}
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  close: {
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: 15,
  },
  amountView: {
    alignItems: "center",
  },
  description: {
    marginBottom: 10,
  },
  entry: {
    marginBottom: 5,
  },
  transactionDetailView: {
    marginHorizontal: 20,
    marginVertical: 15,
  },
  valueContainer: {
    flexDirection: "row",
    height: 50,
    backgroundColor: colors.grey5,
    alignItems: "center",
    borderRadius: 8,
  },
  value: {
    marginLeft: 10,
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  txNotBroadcast: {
    marginBottom: 15,
  },
}))
