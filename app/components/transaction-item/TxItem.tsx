import React from "react"
import moment from "moment"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
import { TransactionFragment, useHideBalanceQuery } from "@app/graphql/generated"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import HideableArea from "../hideable-area/hideable-area"

// hooks
import { useNavigation } from "@react-navigation/native"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// assets
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import ArrowDown from "@app/assets/icons/arrow-down.svg"

// utils
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

type Props = {
  tx: TransactionFragment
}

const label = {
  RECEIVE: "Received",
  SEND: "Sent",
}

export const TxItem: React.FC<Props> = React.memo(({ tx }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { colors } = useTheme().theme

  const { formatMoneyAmount, moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  let primaryAmount = null
  let secondaryAmount = null
  if (tx.settlementCurrency === "BTC") {
    const moneyAmount = toBtcMoneyAmount(tx.settlementAmount ?? NaN)
    primaryAmount = moneyAmountToDisplayCurrencyString({
      moneyAmount,
      isApproximate: true,
    })

    secondaryAmount = formatMoneyAmount({
      moneyAmount,
    })
  } else {
    const amount = tx.settlementAmount * 100
    const moneyAmount = toUsdMoneyAmount(amount ?? NaN)

    primaryAmount = moneyAmountToDisplayCurrencyString({
      moneyAmount: moneyAmount,
    })

    if (convertMoneyAmount) {
      secondaryAmount = formatMoneyAmount({
        moneyAmount: convertMoneyAmount(moneyAmount, "BTC"),
      })
    }
  }

  const onPress = () => navigation.navigate("transactionDetail", { tx })

  return (
    <Wrapper onPress={onPress} activeOpacity={0.5}>
      <IconWrapper borderColor={colors.border01}>
        {tx.direction === "RECEIVE" ? (
          <ArrowDown color={colors.accent02} />
        ) : (
          <ArrowUp color={colors.black} />
        )}
      </IconWrapper>
      <ColumnWrapper>
        <Text type="bl">{`${label[tx.direction]} ${tx.settlementCurrency}`}</Text>
        <Text type="caption" color={colors.text02}>
          {moment(moment.unix(tx.createdAt)).fromNow()}
        </Text>
      </ColumnWrapper>
      <HideableArea isContentVisible={hideBalance}>
        <ColumnWrapper style={{ alignItems: "flex-end" }}>
          <Text
            type="bl"
            color={tx.direction === "RECEIVE" ? colors.accent02 : colors.black}
          >
            {primaryAmount}
          </Text>
          <Text type="caption" color={colors.text02}>
            {secondaryAmount}
          </Text>
        </ColumnWrapper>
      </HideableArea>
    </Wrapper>
  )
})

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
