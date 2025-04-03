import React from "react"
import { Dimensions, Pressable, StyleProp, View, ViewStyle } from "react-native"
import { useTheme, Text } from "@rneui/themed"

// utils
import { Key as KeyType } from "../amount-input-screen/number-pad-reducer"
import { testProps } from "@app/utils/testProps"

const height = Dimensions.get("screen").height

type CurrencyKeyboardProps = {
  onPress: (pressed: KeyType) => void
}

export const CurrencyKeyboard: React.FC<CurrencyKeyboardProps> = ({ onPress }) => {
  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        <Key numberPadKey={KeyType[1]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[2]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[3]} handleKeyPress={onPress} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Key numberPadKey={KeyType[4]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[5]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[6]} handleKeyPress={onPress} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Key numberPadKey={KeyType[7]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[8]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[9]} handleKeyPress={onPress} />
      </View>
      <View style={{ flexDirection: "row" }}>
        <Key numberPadKey={KeyType.Decimal} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType[0]} handleKeyPress={onPress} />
        <Key numberPadKey={KeyType.Backspace} handleKeyPress={onPress} />
      </View>
    </View>
  )
}

const Key = ({
  handleKeyPress,
  numberPadKey,
}: {
  numberPadKey: KeyType
  handleKeyPress: (key: KeyType) => void
}) => {
  const { mode } = useTheme().theme
  const pressableStyle = ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => {
    const baseStyle: StyleProp<ViewStyle> = {
      flex: 1,
      height: height / 9.5,
      alignItems: "center",
      justifyContent: "center",
    }

    if (pressed) {
      return {
        ...baseStyle,
        backgroundColor: mode === "dark" ? "#002118" : "#DDE3E1",
      }
    }
    return baseStyle
  }

  return (
    <Pressable
      style={pressableStyle}
      onPress={() => handleKeyPress(numberPadKey)}
      {...testProps(`Key ${numberPadKey}`)}
    >
      <Text type="h02" bold>
        {numberPadKey}
      </Text>
    </Pressable>
  )
}
