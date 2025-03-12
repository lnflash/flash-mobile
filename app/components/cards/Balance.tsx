import React from "react"
import styled from "styled-components/native"
import { Text, useTheme } from "@rneui/themed"

// assets
import Cash from "@app/assets/icons/cash.svg"
import Bitcoin from "@app/assets/icons/bitcoin.svg"
import Flashcard from "@app/assets/icons/flashcard.svg"

const icons = {
  cash: Cash,
  bitcoin: Bitcoin,
  flashcard: Flashcard,
}

type IconNamesType = keyof typeof icons

type Props = {
  icon: IconNamesType
  title: string
  amount?: string
  currency: string
  onPress: () => void
}

const Balance: React.FC<Props> = ({ icon, title, amount, currency, onPress }) => {
  const { colors } = useTheme().theme

  const Icon = icons[icon]

  return (
    <Wrapper onPress={onPress} activeOpacity={0.5} color={colors.layer}>
      <Icon />
      <ColumnWrapper>
        <Text type="p4" color={colors.text02}>
          {title}
        </Text>
        <Text type="h02" bold>
          {amount}{" "}
          <Text type="h02" color={colors.text02}>
            {currency}
          </Text>
        </Text>
      </ColumnWrapper>
    </Wrapper>
  )
}

export default Balance

const Wrapper = styled.TouchableOpacity<{ color: string }>`
  flex-direction: row;
  align-items: center;
  padding: 16px;
  background-color: ${({ color }) => color};
  border-radius: 20px;
  margin-vertical: 5px;
`

const ColumnWrapper = styled.View`
  margin-left: 24px;
`
