import React, { useCallback, useState } from "react"
import { ActivityIndicator, FlatList } from "react-native"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"
import { StackScreenProps } from "@react-navigation/stack"
import { Colors } from "@rneui/base"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useFocusEffect } from "@react-navigation/native"
import { useDisplayCurrency, usePriceConversion } from "@app/hooks"

// utils
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { DisplayCurrency, toBtcMoneyAmount } from "@app/types/amounts"
import { DepositInfo } from "@breeztech/breez-sdk-spark-react-native"
import { listUnclaimedDeposits } from "@app/utils/breez-sdk"

type Props = StackScreenProps<RootStackParamList, "UnclaimedDepositsList">

type RenderItemProps = {
  item: DepositInfo
  index: number
}

const UnclaimedDepositsList: React.FC<Props> = ({ navigation }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { convertMoneyAmount } = usePriceConversion()
  const { formatDisplayAndWalletAmount } = useDisplayCurrency()

  const [loading, setLoading] = useState<boolean>(false)
  const [deposits, setDeposits] = useState<DepositInfo[]>([])

  if (!convertMoneyAmount) return null

  useFocusEffect(
    useCallback(() => {
      fetchUnclaimedDeposits()
    }, []),
  )

  const fetchUnclaimedDeposits = async () => {
    setLoading(true)
    try {
      const allDeposits = (await listUnclaimedDeposits()) || []
      const filtered = allDeposits.filter((d: DepositInfo) => !d.refundTxId)
      setDeposits(filtered)
    } catch (error) {
      console.error("Failed to fetch unclaimed deposits:", error)
      setDeposits([])
    } finally {
      setLoading(false)
    }
  }

  const renderItem = ({ item }: RenderItemProps) => {
    const formattedAmount = formatDisplayAndWalletAmount({
      displayAmount: convertMoneyAmount(
        toBtcMoneyAmount(Number(item.amountSats)),
        DisplayCurrency,
      ),
      walletAmount: toBtcMoneyAmount(Number(item.amountSats)),
    })

    const statusText =
      item.claimError?.tag === "MaxDepositClaimFeeExceeded"
        ? LL.RefundFlow.feeExceeded()
        : LL.RefundFlow.claimFailed()

    return (
      <Item colors={colors}>
        <ColumnWrapper>
          <Amount>{formattedAmount}</Amount>
          <StatusText color={colors.error}>{statusText}</StatusText>
        </ColumnWrapper>
        <BtnWrapper
          onPress={() =>
            navigation.navigate("UnclaimedDepositDetails", { deposit: item })
          }
        >
          <BtnText color={colors.white}>{LL.common.details()}</BtnText>
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
  if (loading) {
    return (
      <LoadingWrapper>
        <ActivityIndicator color={"#60aa55"} size={"large"} />
      </LoadingWrapper>
    )
  } else {
    return (
      <FlatList
        data={deposits}
        renderItem={renderItem}
        ListEmptyComponent={renderListEmptyComp()}
        contentContainerStyle={{ flex: 1 }}
      />
    )
  }
}
export default UnclaimedDepositsList

const LoadingWrapper = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`

const Item = styled.View<{ colors: Colors }>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ colors }) => colors.grey4};
  padding-horizontal: 20px;
  padding-vertical: 10px;
`
const ColumnWrapper = styled.View``

const Amount = styled(Text)`
  font-size: 15px;
  margin-bottom: 5px;
`
const StatusText = styled(Text)`
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
`

const EmptyWrapper = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`

const EmptyText = styled(Text)`
  font-size: 20px;
`
