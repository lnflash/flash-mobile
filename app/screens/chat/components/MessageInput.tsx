import React, { useState } from "react"
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
} from "react-native"
import Icon from "react-native-vector-icons/Ionicons"
import ReactNativeHapticFeedback from "react-native-haptic-feedback"
import { nip19 } from "nostr-tools"
import { Rumor } from "@app/utils/nostr"
import { makeStyles, useTheme } from "@rneui/themed"

type Props = {
  onSend: (text: string, replyToId?: string) => void
  replyTo: Rumor | null
  onCancelReply: () => void
  profileMap: Map<string, any>
}

const MIN_HEIGHT = 40
const MAX_HEIGHT = 120

export const MessageInput: React.FC<Props> = ({
  onSend,
  replyTo,
  onCancelReply,
  profileMap,
}) => {
  const [text, setText] = useState("")
  const [inputHeight, setInputHeight] = useState(MIN_HEIGHT)
  const { theme: { colors } } = useTheme()
  const styles = useStyles()

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    ReactNativeHapticFeedback.trigger("impactMedium", { enableVibrateFallback: true })
    onSend(trimmed, replyTo?.id)
    setText("")
    setInputHeight(MIN_HEIGHT)
    onCancelReply()
  }

  const replyAuthorProfile = replyTo ? profileMap.get(replyTo.pubkey) : null
  const replyAuthorName = replyTo
    ? replyAuthorProfile?.name ||
      replyAuthorProfile?.username ||
      nip19.npubEncode(replyTo.pubkey).slice(0, 10)
    : null

  return (
    <View style={styles.container}>
      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyContent}>
            <Text style={styles.replyLabel}>Replying to {replyAuthorName}</Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} style={styles.replyClose}>
            <Icon name="close" size={18} color={colors.grey3} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.textInput, { height: inputHeight }]}
          value={text}
          onChangeText={setText}
          onContentSizeChange={(e) => {
            const h = e.nativeEvent.contentSize.height
            setInputHeight(Math.min(Math.max(h, MIN_HEIGHT), MAX_HEIGHT))
          }}
          placeholder="Message"
          placeholderTextColor={colors.grey3}
          multiline
          scrollEnabled={inputHeight >= MAX_HEIGHT}
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: text.trim() ? colors.primary : colors.grey3 }]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Icon name="send" size={18} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    borderTopWidth: 0.5,
    borderTopColor: colors.grey4,
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey4,
    borderLeftWidth: 3,
    borderLeftColor: colors.grey2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replyContent: {
    flex: 1,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary3,
  },
  replyText: {
    fontSize: 12,
    color: colors.grey1,
  },
  replyClose: {
    padding: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.grey5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: colors.primary3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.grey4,
    marginRight: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
}))
