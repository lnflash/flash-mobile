import { makeStyles, Text, useTheme } from "@rneui/themed"
import React from "react"
import { View, ViewStyle } from "react-native"
import { GaloyIcon } from "../galoy-icon"

type GaloyErrorBoxProps = {
  errorMessage: string
  noIcon?: boolean
  isWarning?: boolean
  style?: ViewStyle
}

export const GaloyErrorBox: React.FC<GaloyErrorBoxProps> = ({
  errorMessage,
  noIcon,
  isWarning,
  style,
}) => {
  const { colors, mode } = useTheme().theme
  const styles = useStyles()

  const color =
    mode === "light" ? (isWarning ? colors.warning : colors.error) : colors.black

  return (
    <View style={[styles.container, style]}>
      {!noIcon && <GaloyIcon name="warning" size={14} color={color} />}
      <Text style={styles.textContainer} type={"p3"} color={color}>
        {errorMessage}
      </Text>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.error9,
  },
  textContainer: {
    overflow: "hidden",
    marginLeft: 4,
    flex: 1,
  },
}))
