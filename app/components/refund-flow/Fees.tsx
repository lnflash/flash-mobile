import React, { useEffect, useState } from "react"
import { Colors, Text, useTheme } from "@rneui/themed"
import styled from "styled-components/native"
import {
  recommendedFees,
  RecommendedFees,
} from "@breeztech/react-native-breez-sdk-liquid"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"
import { useActivityIndicator } from "@app/hooks"

type Props = {
  setSelectedFee: (val?: number) => void
}

const Fees: React.FC<Props> = ({ setSelectedFee }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const { toggleActivityIndicator } = useActivityIndicator()

  const [fees, setFees] = useState<RecommendedFees>()
  const [selectedFeeType, setSelectedFeeType] = useState<string>()

  useEffect(() => {
    fetchFees()
  }, [])

  const fetchFees = async () => {
    toggleActivityIndicator(true)
    const fees = await recommendedFees()
    console.log("Recommended fees:", fees)
    setFees(fees)
    toggleActivityIndicator(false)
  }

  const onSelectFee = (type: string, value?: number) => {
    setSelectedFeeType(type)
    setSelectedFee(value)
  }

  return (
    <Wrapper>
      <Title>{LL.RefundFlow.recommendedFees()}</Title>
      <ButtonsWrapper>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "fast"}
          onPress={() => onSelectFee("fast", fees?.fastestFee)}
        >
          <FeeText colors={colors} selected={selectedFeeType === "fast"}>
            {LL.RefundFlow.fast()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "halfHour"}
          onPress={() => onSelectFee("halfHour", fees?.halfHourFee)}
        >
          <FeeText colors={colors} selected={selectedFeeType === "halfHour"}>
            {LL.RefundFlow.halfHour()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "hour"}
          onPress={() => onSelectFee("hour", fees?.hourFee)}
        >
          <FeeText colors={colors} selected={selectedFeeType === "hour"}>
            {LL.RefundFlow.hour()}
          </FeeText>
        </FeeSelect>
      </ButtonsWrapper>
    </Wrapper>
  )
}

export default Fees

const Wrapper = styled.View`
  margin-top: 10px;
`

const ButtonsWrapper = styled.View`
  flex-direction: row;
  justify-content: space-between;
`

const Title = styled(Text)`
  font-weight: bold;
  margin-bottom: 10;
`

const FeeSelect = styled.TouchableOpacity<{ colors: Colors; selected: boolean }>`
  width: 30%;
  background-color: ${({ colors, selected }) => (selected ? "#60aa55" : colors.grey4)};
  border-radius: 10px;
  align-items: center;
  padding-vertical: 5px;
`

const FeeText = styled.Text<{ colors: Colors; selected: boolean }>`
  font-size: 15px;
  color: ${({ colors, selected }) => (selected ? colors.white : colors.black)};
`
