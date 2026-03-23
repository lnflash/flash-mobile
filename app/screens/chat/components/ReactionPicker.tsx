import React, { useState } from "react"
import { Dimensions, Modal, View, TouchableOpacity, Text, TouchableWithoutFeedback } from "react-native"
import { makeStyles } from "@rneui/themed"

const EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥", "➕", "💯"]
const MARGIN = 10

type Props = {
  visible: boolean
  onSelect: (emoji: string) => void
  onClose: () => void
  position: { x: number; y: number }
}

export const ReactionPicker: React.FC<Props> = ({ visible, onSelect, onClose, position }) => {
  const styles = useStyles()
  const screenWidth = Dimensions.get("window").width
  const [pickerWidth, setPickerWidth] = useState(0)

  const left = Math.min(
    Math.max(position.x - pickerWidth / 2, MARGIN),
    screenWidth - pickerWidth - MARGIN,
  )

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <View
            onLayout={(e) => setPickerWidth(e.nativeEvent.layout.width)}
            style={[
              styles.picker,
              {
                top: Math.max(position.y - 60, MARGIN),
                left,
                opacity: pickerWidth > 0 ? 1 : 0,
              },
            ]}
          >
            {EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiButton}
                onPress={() => {
                  onSelect(emoji)
                  onClose()
                }}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  overlay: {
    flex: 1,
  },
  picker: {
    position: "absolute",
    flexDirection: "row",
    backgroundColor: colors.grey5,
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  emojiButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  emoji: {
    fontSize: 24,
  },
}))
