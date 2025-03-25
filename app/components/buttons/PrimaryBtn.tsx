import React from "react"
import { ActivityIndicator, TextStyle, TouchableOpacity, ViewStyle } from "react-native"
import { makeStyles, Text, useTheme } from "@rneui/themed"

type Props = {
  type?: "solid" | "outline" | "clear"
  label: string
  loading?: boolean
  disabled?: boolean
  btnStyle?: ViewStyle
  txtStyle?: TextStyle
  onPress?: () => void
}

const PrimaryBtn: React.FC<Props> = ({
  type = "solid",
  label,
  loading = false,
  disabled = false,
  btnStyle = {},
  txtStyle = {},
  onPress = () => {},
}) => {
  const styles = useStyles()
  const { colors } = useTheme().theme

  const disabledStyle = disabled ? styles.disabled : {}

  return (
    <TouchableOpacity
      style={[styles.base, styles[type], btnStyle, disabledStyle]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.5}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Text
          type={"bl"}
          bold
          color={type === "solid" ? colors.textInverse : colors.text01}
          style={[txtStyle]}
        >
          {label}
        </Text>
      )}
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
  disabled: {
    opacity: 0.5,
  },
}))
