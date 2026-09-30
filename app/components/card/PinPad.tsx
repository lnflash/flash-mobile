import React from "react"
import { TouchableOpacity, View } from "react-native"
import { makeStyles, Text } from "@rneui/themed"

import { useI18nContext } from "@app/i18n/i18n-react"

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
  const { LL } = useI18nContext()

  // A plain testID: `testProps` would label each key with its id, and a
  // screen reader would say "pin-1". A digit is read as itself.
  const key = ({ id, label, spoken, onPress }: KeySpec) => (
    <TouchableOpacity
      key={id}
      style={styles.key}
      onPress={onPress}
      testID={`pin-${id}`}
      accessibilityRole="button"
      accessibilityLabel={spoken}
    >
      <Text type="h02">{label}</Text>
    </TouchableOpacity>
  )
  const digit = (d: string) =>
    key({ id: d, label: d, spoken: d, onPress: () => onDigit(d) })

  return (
    <View style={styles.pad}>
      <View style={styles.row}>{["1", "2", "3"].map(digit)}</View>
      <View style={styles.row}>{["4", "5", "6"].map(digit)}</View>
      <View style={styles.row}>{["7", "8", "9"].map(digit)}</View>
      <View style={styles.row}>
        {key({
          id: "clear",
          label: "C",
          spoken: LL.FlashcardV2.pinPadClear(),
          onPress: onClear,
        })}
        {digit("0")}
        {key({
          id: "backspace",
          label: "⌫",
          spoken: LL.FlashcardV2.pinPadDelete(),
          onPress: onBackspace,
        })}
      </View>
    </View>
  )
}

type KeySpec = {
  /** `pin-<id>` is the key's testID. */
  id: string
  /** What the key shows. */
  label: string
  /** What a screen reader says for it. */
  spoken: string
  onPress: () => void
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
