import React from "react"
import moment from "moment"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
import { useHideBalanceQuery, WalletCurrency } from "@app/graphql/generated"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { PaymentType, PaymentStatus } from "@breeztech/breez-sdk-spark-react-native"

// components
import HideableArea from "../hideable-area/hideable-area"

// hooks
import { useNavigation } from "@react-navigation/native"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// assets
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import ArrowDown from "@app/assets/icons/arrow-down.svg"
import Icon from "react-native-vector-icons/Ionicons"

// utils
import { toBtcMoneyAmount, toWalletAmount } from "@app/types/amounts"

// types
import {
  UnifiedTransaction,
  isBreezTransaction,
  isIbexTransaction,
  getTransactionTimestamp,
  getTransactionMemo,
} from "@app/types/transactions"

type Props = {
  tx: UnifiedTransaction
}

const label = {
  RECEIVE: "Received",
  SEND: "Sent",
}

const TxItemComponent: React.FC<Props> = ({ tx }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { colors } = useTheme().theme

  const { formatMoneyAmount, moneyAmountToDisplayCurrencyString, formatCurrency } =
    useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  // Extract common fields based on transaction source
  const isReceive = isBreezTransaction(tx)
    ? tx.payment.paymentType === PaymentType.Receive
    : tx.transaction.direction === "RECEIVE"

  const direction = isReceive ? "RECEIVE" : "SEND"

  const isPending = isBreezTransaction(tx)
    ? tx.payment.status === PaymentStatus.Pending
    : tx.transaction.status === "PENDING"

  const memo = getTransactionMemo(tx)

  const timestamp = getTransactionTimestamp(tx)

  // Calculate display amounts
  let primaryAmount = null
  let secondaryAmount = null
  let feeAmount = null

  if (isBreezTransaction(tx)) {
    // Breez transaction - always BTC
    const moneyAmount = toBtcMoneyAmount(Number(tx.payment.amount))
    primaryAmount = moneyAmountToDisplayCurrencyString({
      moneyAmount,
      isApproximate: true,
    })
    secondaryAmount = formatMoneyAmount({ moneyAmount })
  } else {
    const moneyAmount = toWalletAmount({
      amount: Math.abs(tx.transaction.settlementAmount),
      currency: tx.transaction.settlementCurrency,
    })
    primaryAmount = formatCurrency({
      amountInMajorUnits: tx.transaction.settlementDisplayAmount,
      currency: tx.transaction.settlementDisplayCurrency,
    })

    if (tx.transaction.settlementCurrency === WalletCurrency.Usd && convertMoneyAmount) {
      secondaryAmount = formatMoneyAmount({
        moneyAmount: convertMoneyAmount(moneyAmount, "BTC"),
      })
    } else {
      secondaryAmount = formatMoneyAmount({ moneyAmount })
    }

    if (!isReceive && tx.transaction.settlementFee > 0) {
      feeAmount = formatMoneyAmount({
        moneyAmount: toWalletAmount({
          amount: tx.transaction.settlementFee,
          currency: tx.transaction.settlementCurrency,
        }),
      })
    }
  }

  const currencyLabel = isBreezTransaction(tx) ? "BTC" : tx.transaction.settlementCurrency

  const onPress = () => {
    if (isIbexTransaction(tx)) {
      navigation.navigate("transactionDetail", { tx: tx.transaction })
    } else {
      navigation.navigate("breezTransactionDetail", { payment: tx.payment })
    }
  }

  return (
    <Wrapper onPress={onPress} activeOpacity={0.5}>
      <IconWrapper borderColor={colors.border01}>
        {isReceive ? (
          <ArrowDown color={colors.accent02} />
        ) : (
          <ArrowUp color={colors.black} />
        )}
      </IconWrapper>
      <ColumnWrapper>
        <RowWrapper>
          <Text type="bl">{`${label[direction]} ${currencyLabel}`}</Text>
          {isPending && (
            <Text type="caption" color={colors._orange}>
              {`  (Pending)`}
            </Text>
          )}
        </RowWrapper>
        {memo && (
          <MetadataRowWrapper>
            <Icon name="document-text" size={14} color={colors.primary} />
            <Text type="caption" color={colors.primary} numberOfLines={1}>
              {memo}
            </Text>
          </MetadataRowWrapper>
        )}
        {feeAmount && (
          <MetadataRowWrapper>
            <Text type="caption" color={colors.text02}>
              {`Fee ${feeAmount}`}
            </Text>
          </MetadataRowWrapper>
        )}
        <Text type="caption" color={colors.text02}>
          {moment(moment.unix(timestamp)).fromNow()}
        </Text>
      </ColumnWrapper>
      <HideableArea isContentVisible={hideBalance}>
        <AmountColumnWrapper>
          <Text type="bl" color={isReceive ? colors.accent02 : colors.black}>
            {primaryAmount}
          </Text>
          <Text type="caption" color={colors.text02}>
            {secondaryAmount}
          </Text>
        </AmountColumnWrapper>
      </HideableArea>
    </Wrapper>
  )
}

export const TxItem = React.memo(TxItemComponent)

const Wrapper = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding-vertical: 12px;
`

const IconWrapper = styled.View<{ borderColor: string }>`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 100px;
  border: 2px solid ${({ borderColor }) => borderColor};
  margin-right: 8px;
`

const ColumnWrapper = styled.View`
  flex: 1;
`

const RowWrapper = styled.View`
  flex-direction: row;
  align-items: center;
`

const MetadataRowWrapper = styled(RowWrapper)`
  margin-vertical: 2px;
`

const AmountColumnWrapper = styled(ColumnWrapper)`
  align-items: flex-end;
`
