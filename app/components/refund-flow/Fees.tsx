import React from "react"
import { ViewStyle } from "react-native"
import { Colors, Text, useTheme } from "@rneui/themed"
import styled from "styled-components/native"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

type Props = {
  wrapperStyle?: ViewStyle
  selectedFeeType?: "fast" | "medium" | "slow"
  onSelectFee: (type: "fast" | "medium" | "slow") => void
}

const Fees: React.FC<Props> = ({ wrapperStyle, selectedFeeType, onSelectFee }) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  return (
    <Wrapper style={wrapperStyle}>
      <Title>{LL.RefundFlow.recommendedFees()}</Title>
      <ButtonsWrapper>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "fast"}
          onPress={() => onSelectFee("fast")}
        >
          <FeeText colors={colors} selected={selectedFeeType === "fast"}>
            {LL.RefundFlow.fast()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "medium"}
          onPress={() => onSelectFee("medium")}
        >
          <FeeText colors={colors} selected={selectedFeeType === "medium"}>
            {LL.RefundFlow.medium()}
          </FeeText>
        </FeeSelect>
        <FeeSelect
          colors={colors}
          activeOpacity={0.5}
          selected={selectedFeeType === "slow"}
          onPress={() => onSelectFee("slow")}
        >
          <FeeText colors={colors} selected={selectedFeeType === "slow"}>
            {LL.RefundFlow.slow()}
          </FeeText>
        </FeeSelect>
      </ButtonsWrapper>
    </Wrapper>
  )
}

export default Fees

const Wrapper = styled.View`
  margin-top: 10px;
  margin-bottom: 15px;
`

const ButtonsWrapper = styled.View`
  flex-direction: row;
  justify-content: space-between;
`

const Title = styled(Text)`
  font-weight: bold;
  margin-bottom: 10px;
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
