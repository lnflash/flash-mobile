import React, { useEffect, useState } from "react"
import { Colors, Text, useTheme } from "@rneui/themed"
import styled from "styled-components/native"
import {
  recommendedFees,
  RecommendedFees,
} from "@breeztech/react-native-breez-sdk-liquid"
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = {
  selectedFee?: number
  setFee: (val?: number) => void
}

const Fees: React.FC<Props> = ({ selectedFee, setFee }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme
  const [fees, setFees] = useState<RecommendedFees>({
    economyFee: 6,
    fastestFee: 26,
    halfHourFee: 25,
    hourFee: 23,
    minimumFee: 3,
  })

  useEffect(() => {
    fetchFees()
  }, [])

  const fetchFees = async () => {
    const fees = await recommendedFees()
    setFees(fees)
  }

  return (
    <Wrapper>
      <Title>{LL.RefundFlow.recommendedFees()}</Title>
      <ButtonsWrapper>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFee === fees?.fastestFee}
          onPress={() => setFee(fees?.fastestFee)}
        >
          <FeeText colors={colors} selected={selectedFee === fees?.fastestFee}>
            {LL.RefundFlow.fast()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFee === fees?.halfHourFee}
          onPress={() => setFee(fees?.halfHourFee)}
        >
          <FeeText colors={colors} selected={selectedFee === fees?.halfHourFee}>
            {LL.RefundFlow.halfHour()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFee === fees?.hourFee}
          onPress={() => setFee(fees?.hourFee)}
        >
          <FeeText colors={colors} selected={selectedFee === fees?.hourFee}>
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
