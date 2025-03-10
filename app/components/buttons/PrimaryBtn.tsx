import React from "react"
import { ViewStyle } from "react-native"
import styled from "styled-components/native"

type Props = {
  type?: "solid" | "outline" | "clear"
  label: string
  btnStyle?: ViewStyle
  onPress: () => void
}

const PrimaryBtn: React.FC<Props> = ({ type = "solid", label, onPress, btnStyle }) => {
  return (
    <Wrapper type={type} style={btnStyle} onPress={onPress}>
      <Label type={type}>{label}</Label>
    </Wrapper>
  )
}

export default PrimaryBtn

const Wrapper = styled.TouchableOpacity<{ type: "solid" | "outline" | "clear" }>`
  height: 56px;
  align-items: center;
  justify-content: center;
  border-radius: 100px;
  border-color: #002118;
  border-width: ${({ type }) => (type === "outline" ? 1 : 0)}px;
  background-color: ${({ type }) =>
    type === "solid" ? "#002118" : type === "clear" ? "#E3E3E3" : "transparent"};
`

const Label = styled.Text<{ type: "solid" | "outline" | "clear" }>`
  font-size: 16px;
  font-weight: 600;
  font-family: "Sora-Bold";
  color: ${({ type }) => (type === "solid" ? "#fff" : "#212121")};
`
