import React, { useEffect, useState } from "react"
import { FlatList } from "react-native"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { listRefundables, RefundableSwap } from "@breeztech/react-native-breez-sdk-liquid"
import moment from "moment"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"

const data = [
  {
    amountSat: 592027,
    swapAddress: "bc1p87kqsyy9crn2zkkm9v3knt2djdlypv6gkwraz0j34r8n3pm7py8ql9a7df",
    timestamp: 1731342507,
  },
  {
    amountSat: 534920000,
    swapAddress: "bc1p87kqsyy9crn2zkkm9v3knt2djdlypv6gkwraz0j34r8n3pm7py8ql9a7df",
    timestamp: 1732526995527,
  },
]

type Props = StackScreenProps<RootStackParamList, "RefundTransactionList">

type RenderItemProps = {
  item: { amountSat: number; swapAddress: string; timestamp: number }
  index: number
}

const RefundTransactionsList: React.FC<Props> = ({ navigation, route }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const [refundables, setRefundables] = useState<RefundableSwap[]>(
    route?.params?.refundables || data,
  )

  if (!convertMoneyAmount) return null

  useEffect(() => {
    fetchRefundables()
  }, [])

  const fetchRefundables = async () => {
    const refundables = await listRefundables()
    setRefundables(refundables)
  }

  const renderItem = ({ item, index }: RenderItemProps) => {
    const pressHandler = () => {
      navigation.navigate("RefundDestination", {
        swapAddress: item.swapAddress,
        amount: item.amountSat,
      })
    }

    const formattedAmount = formatDisplayAndWalletAmount({
      displayAmount: convertMoneyAmount(
        toBtcMoneyAmount(item.amountSat),
        DisplayCurrency,
      ),
      walletAmount: toBtcMoneyAmount(item.amountSat),
    })

    return (
      <Item>
        <ColumnWrapper>
          <Amount>{formattedAmount}</Amount>
          <Time color={colors.grey1}>{moment(item.timestamp).fromNow()}</Time>
        </ColumnWrapper>
        <BtnWrapper onPress={pressHandler}>
          <BtnText>{LL.RefundFlow.refund()}</BtnText>
        </BtnWrapper>
      </Item>
    )
  }

  const renderListEmptyComp = () => {
    return (
      <EmptyWrapper>
        <EmptyText>{LL.RefundFlow.noRefundables()}</EmptyText>
      </EmptyWrapper>
    )
  }

  return (
    <FlatList
      data={refundables}
      renderItem={renderItem}
      ListEmptyComponent={renderListEmptyComp()}
      contentContainerStyle={{ flex: 1 }}
    />
  )
}
export default RefundTransactionsList

const Item = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  background-color: #fff;
  margin-top: 2px;
  padding-horizontal: 20px;
  padding-vertical: 10px;
`
const ColumnWrapper = styled.View``

const Amount = styled(Text)`
  font-size: 15px;
  margin-bottom: 5px;
`
const Time = styled(Text)`
  font-size: 15px;
`
const BtnWrapper = styled.TouchableOpacity`
  background-color: #60aa55;
  border-radius: 10px;
  padding-vertical: 5px;
  padding-horizontal: 15px;
`

const BtnText = styled(Text)`
  font-size: 16px;
  color: #fff;
`

const EmptyWrapper = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`

const EmptyText = styled(Text)`
  font-size: 20px;
`
