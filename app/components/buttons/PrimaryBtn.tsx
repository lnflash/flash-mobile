import React from "react"
import { TextStyle, TouchableOpacity, ViewStyle } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

type Props = {
  type?: "solid" | "outline" | "clear"
  label: string
  disabled?: boolean
  btnStyle?: ViewStyle
  txtStyle?: TextStyle
  onPress: () => void
}

const PrimaryBtn: React.FC<Props> = ({
  type = "solid",
  label,
  disabled = false,
  btnStyle = {},
  txtStyle = {},
  onPress,
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  return (
    <TouchableOpacity
      style={[styles.base, styles[type], btnStyle]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.5}
    >
      <Text
        type={"bl"}
        bold
        color={type === "solid" ? colors.textInverse : colors.text01}
        style={txtStyle}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default PrimaryBtn

const useStyles = makeStyles(({ colors }) => ({
  base: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
  },

  solid: {
    backgroundColor: colors.button01,
  },
  outline: {
    height: 55,
    borderColor: colors.button01,
    borderWidth: 1,
  },
  clear: {
    backgroundColor: colors.button02,
  },
}))
