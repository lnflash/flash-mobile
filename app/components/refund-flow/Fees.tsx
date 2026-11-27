import React from "react"
import { ViewStyle } from "react-native"
import { Colors, Text, useTheme } from "@rneui/themed"
import styled from "styled-components/native"

// hooks
import { useI18nContext } from "@app/i18n/i18n-react"

type FeeType = "fast" | "medium" | "slow"

type Props = {
  wrapperStyle?: ViewStyle
  selectedFeeType?: FeeType
  onSelectFee: (type: FeeType) => void
  // Optional: a line under a speed's name, such as its fee.
  feeLabels?: Partial<Record<FeeType, string>>
  // Optional: speeds shown dimmed that cannot be picked.
  disabledFeeTypes?: readonly FeeType[]
}

const FEE_TYPES: readonly FeeType[] = ["fast", "medium", "slow"]

const disabledProps = {
  disabled: true,
  accessibilityState: { disabled: true },
  style: { opacity: 0.4 },
}

const Fees: React.FC<Props> = ({
  wrapperStyle,
  selectedFeeType,
  onSelectFee,
  feeLabels,
  disabledFeeTypes,
}) => {
  const { LL } = useI18nContext()
  const { colors } = useTheme().theme

  const names: Record<FeeType, string> = {
    fast: LL.RefundFlow.fast(),
    medium: LL.RefundFlow.medium(),
    slow: LL.RefundFlow.slow(),
  }

  return (
    <Wrapper style={wrapperStyle}>
      <Title>{LL.RefundFlow.recommendedFees()}</Title>
      <ButtonsWrapper>
        {FEE_TYPES.map((feeType) => {
          const selected = selectedFeeType === feeType
          const disabled = disabledFeeTypes?.includes(feeType) ?? false
          const label = feeLabels?.[feeType]
          return (
            <FeeSelect
              key={feeType}
              colors={colors}
              activeOpacity={0.5}
              selected={selected}
              onPress={() => onSelectFee(feeType)}
              // Spread only when used, so the picker without these props
              // renders exactly as it did before they existed.
              {...(disabled ? disabledProps : {})}
            >
              <FeeText colors={colors} selected={selected}>
                {names[feeType]}
              </FeeText>
              {label ? (
                <FeeLabel
                  colors={colors}
                  selected={selected}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {label}
                </FeeLabel>
              ) : null}
            </FeeSelect>
          )
        })}
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

const FeeLabel = styled.Text<{ colors: Colors; selected: boolean }>`
  font-size: 12px;
  padding-horizontal: 4px;
  color: ${({ colors, selected }) => (selected ? colors.white : colors.black)};
`
