import React, { useEffect, useState } from "react"
import moment from "moment"
import { Text } from "@rneui/themed"
import { FlatList } from "react-native"
import styled from "styled-components/native"
import { StackScreenProps } from "@react-navigation/stack"
import { listRefundables, RefundableSwap } from "@breeztech/react-native-breez-sdk-liquid"

// utils
import { satsToBTC } from "../receive-bitcoin-screen/payment/helpers"
import { RootStackParamList } from "@app/navigation/stack-param-lists"

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

const RefundTransactionsList: React.FC<Props> = ({ navigation }) => {
  const [refundables, setRefundables] = useState<RefundableSwap[]>(data)

  useEffect(() => {
    fetchRefundables()
  }, [])

  const fetchRefundables = async () => {
    const refundables = await listRefundables()
    setRefundables(refundables)
  }

  const renderItem = ({ item, index }: RenderItemProps) => {
    const pressHandler = () => {
      navigation.navigate("RefundDestination", { swapAddress: item.swapAddress })
    }

    return (
      <Item onPress={pressHandler}>
        <RowWrapper>
          <SwapAddress>{`${item.swapAddress.substring(
            0,
            10,
          )}...${item.swapAddress.substring(item.swapAddress.length - 10)}`}</SwapAddress>
          <Amount>{satsToBTC(item.amountSat)}</Amount>
        </RowWrapper>
        <Time>{moment(item.timestamp).fromNow()}</Time>
      </Item>
    )
  }

  return <FlatList data={refundables} renderItem={renderItem} style={{ flex: 1 }} />
}
export default RefundTransactionsList

const Item = styled.TouchableOpacity`
  background-color: #fff;
  margin-top: 2px;
  padding-horizontal: 20px;
  padding-vertical: 10px;
`

const RowWrapper = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
`

const SwapAddress = styled(Text)`
  font-size: 17;
`

const Amount = styled(Text)`
  font-size: 15;
`

const Time = styled(Text)`
  font-size: 15;
`
