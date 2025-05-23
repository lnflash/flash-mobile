import React, { useEffect, useState } from "react"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
import { TransactionFragment, useHideBalanceQuery } from "@app/graphql/generated"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

// components
import HideableArea from "../hideable-area/hideable-area"

// hooks
import { useNavigation } from "@react-navigation/native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// assets
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import ArrowDown from "@app/assets/icons/arrow-down.svg"

// utils
import { outputRelativeDate } from "../transaction-date"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

type Props = {
  tx: TransactionFragment
}

const label = {
  RECEIVE: "Received",
  SEND: "Sent",
}

export const TxItem: React.FC<Props> = ({ tx }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  const { colors } = useTheme().theme
  const { locale } = useI18nContext()
  const { formatMoneyAmount, moneyAmountToDisplayCurrencyString } = useDisplayCurrency()
  const { convertMoneyAmount } = usePriceConversion()

  const [primary, setPrimary] = useState<string>()
  const [secondary, setSecondary] = useState<string>()

  const { data: { hideBalance = false } = {} } = useHideBalanceQuery()

  useEffect(() => {
    formatAmount()
  }, [tx])

  const formatAmount = () => {
    if (tx.settlementCurrency === "BTC") {
      const moneyAmount = toBtcMoneyAmount(tx.settlementAmount ?? NaN)
      const primaryAmount = moneyAmountToDisplayCurrencyString({
        moneyAmount,
        isApproximate: true,
      })
      setPrimary(primaryAmount)

      const secondaryAmount = formatMoneyAmount({
        moneyAmount,
      })
      setSecondary(secondaryAmount)
    } else {
      const amount = tx.settlementAmount * 100
      const moneyAmount = toUsdMoneyAmount(amount ?? NaN)

      const primaryAmount = moneyAmountToDisplayCurrencyString({
        moneyAmount: moneyAmount,
      })
      setPrimary(primaryAmount)

      if (convertMoneyAmount) {
        const secondaryAmount = formatMoneyAmount({
          moneyAmount: convertMoneyAmount(moneyAmount, "BTC"),
        })
        setSecondary(secondaryAmount)
      }
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
        <RowWrapper>
          <Text type="bl">{`${label[tx.direction]} ${tx.settlementCurrency}`}</Text>
          {tx.status === "PENDING" && (
            <Text type="caption" color={colors._orange}>
              {`  (Pending)`}
            </Text>
          )}
        </RowWrapper>
        <Text type="caption" color={colors.text02}>
          {outputRelativeDate(tx.createdAt, locale)}
        </Text>
      </ColumnWrapper>
      <HideableArea isContentVisible={hideBalance}>
        <ColumnWrapper style={{ alignItems: "flex-end" }}>
          <Text
            type="bl"
            color={tx.direction === "RECEIVE" ? colors.accent02 : colors.black}
          >
            {primary}
          </Text>
          <Text type="caption" color={colors.text02}>
            {secondary}
          </Text>
        </ColumnWrapper>
      </HideableArea>
    </Wrapper>
  )
}

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
