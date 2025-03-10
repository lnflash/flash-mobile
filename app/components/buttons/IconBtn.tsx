import React from "react"
import { Text } from "@rneui/themed"
import styled from "styled-components/native"

// assets
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import ArrowDown from "@app/assets/icons/arrow-down.svg"
import Swap from "@app/assets/icons/swap.svg"

const icons = {
  up: ArrowUp,
  down: ArrowDown,
  swap: Swap,
}

type IconNamesType = keyof typeof icons

type Props = {
  type?: "solid" | "outline" | "clear"
  icon: IconNamesType
  label: string
  onPress: () => void
}

const IconBtn: React.FC<Props> = ({ type = "solid", icon, label, onPress }) => {
  const Icon = icons[icon]

  return (
    <Wrapper>
      <Btn type={type} onPress={onPress}>
        <Icon color={"#000000"} />
      </Btn>
      <Text type="bm" bold>
        {label}
      </Text>
    </Wrapper>
  )
}

export default IconBtn

const Wrapper = styled.View`
  align-items: center;
  justify-content: center;
  padding-horizontal: 8px;
  margin-horizontal: 8px;
`

const Btn = styled.TouchableOpacity<{ type: "solid" | "outline" | "clear" }>`
  height: 64px;
  width: 64px;
  align-items: center;
  justify-content: center;
  border-color: #002118;
  border-radius: 100px;
  border-width: ${({ type }) => (type === "outline" ? 1 : 0)};
  background-color: ${({ type }) =>
    type === "solid" ? "#002118" : type === "clear" ? "#E3E3E3" : "transparent"};
  margin-bottom: 5px;
`
