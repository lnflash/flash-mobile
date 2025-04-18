import React from "react"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { TouchableOpacity, View } from "react-native"

// assets
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import ArrowDown from "@app/assets/icons/arrow-down.svg"
import Swap from "@app/assets/icons/swap.svg"
import QR from "@app/assets/icons/qr-code-new.svg"
import Setting from "@app/assets/icons/setting.svg"
import CardRemove from "@app/assets/icons/card-remove.svg"
import Dollar from "@app/assets/icons/dollar-new.svg"

const icons = {
  up: ArrowUp,
  down: ArrowDown,
  swap: Swap,
  qr: QR,
  setting: Setting,
  cardRemove: CardRemove,
  dollar: Dollar,
}

type IconNamesType = keyof typeof icons

type Props = {
  type?: "solid" | "outline" | "clear"
  icon: IconNamesType
  label: string
  onPress: () => void
}

const IconBtn: React.FC<Props> = ({ type = "solid", icon, label, onPress }) => {
  const { colors } = useTheme().theme
  const styles = useStyles()
  const Icon = icons[icon]

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.base, styles[type]]}
        onPress={onPress}
        activeOpacity={0.5}
      >
        <Icon color={colors.icon01} width={30} height={30} />
      </TouchableOpacity>
      <Text type="bm" bold style={styles.label}>
        {label}
      </Text>
    </View>
  )
}

export default IconBtn

const useStyles = makeStyles(({ colors }) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    marginHorizontal: 8,
  },
  base: {
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    marginBottom: 5,
  },
  solid: {
    backgroundColor: colors.button01,
  },
  outline: {
    borderWidth: 1,
    borderColor: colors.border02,
  },
  clear: {
    backgroundColor: colors.button02,
  },
  label: {
    textAlign: "center",
  },
}))
