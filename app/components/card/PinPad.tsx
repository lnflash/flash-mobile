import React from "react"
import { TouchableOpacity, View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

import { testProps } from "@app/utils/testProps"

type Props = {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onClear: () => void
}

/**
 * A numeric pad for the card PIN, ported from flash-pos's `PinPad` so the two
 * apps ask for the PIN the same way. Self-contained: the caller renders the
 * masked entry and owns the confirm.
 */
export const PinPad: React.FC<Props> = ({ onDigit, onBackspace, onClear }) => {
  const styles = useStyles()

  const key = (label: string, onPress: () => void, id: string) => (
    <TouchableOpacity
      key={id}
      style={styles.key}
      onPress={onPress}
      {...testProps(`pin-${id}`)}
    >
      <Text type="h02">{label}</Text>
    </TouchableOpacity>
  )
  const digit = (d: string) => key(d, () => onDigit(d), d)

  return (
    <View style={styles.pad}>
      <View style={styles.row}>{["1", "2", "3"].map(digit)}</View>
      <View style={styles.row}>{["4", "5", "6"].map(digit)}</View>
      <View style={styles.row}>{["7", "8", "9"].map(digit)}</View>
      <View style={styles.row}>
        {key("C", onClear, "clear")}
        {digit("0")}
        {key("⌫", onBackspace, "backspace")}
      </View>
    </View>
  )
}

const useStyles = makeStyles(() => ({
  pad: {
    marginHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  key: {
    flex: 1,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
}))
