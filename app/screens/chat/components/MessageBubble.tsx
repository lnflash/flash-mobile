import React, { useRef, useState } from "react"
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  GestureResponderEvent,
  Modal,
  ScrollView,
} from "react-native"
import { Swipeable } from "react-native-gesture-handler"
import Icon from "react-native-vector-icons/Ionicons"
import { nip19 } from "nostr-tools"
import { Rumor } from "@app/utils/nostr"
import { ReactionPicker } from "./ReactionPicker"
import type { ReactionEntry } from "../chatContext"
import { makeStyles, useTheme } from "@rneui/themed"
import { GaloyIcon } from "@app/components/atomic/galoy-icon"
import type { DeliveryInfo } from "@app/screens/chat/messages"

type Props = {
  rumor: Rumor
  isMe: boolean
  profileMap: Map<string, any>
  reactions: ReactionEntry[]
  parentRumor: Rumor | null
  onReply: (rumor: Rumor) => void
  onReact: (emoji: string) => void
  isGroupChat?: boolean
  onAdminPress?: () => void
  deliveryInfo?: DeliveryInfo
}

const formatTime = (created_at: number) =>
  new Date(created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

const MAX_AVATARS = 3

function groupReactions(
  reactions: ReactionEntry[],
): { emoji: string; count: number; reactors: string[]; pending: boolean }[] {
  const map = new Map<string, { reactors: string[]; allPending: boolean }>()
  for (const r of reactions) {
    const entry = map.get(r.emoji) || { reactors: [], allPending: true }
    if (!entry.reactors.includes(r.reactor)) entry.reactors.push(r.reactor)
    if (!r.pending) entry.allPending = false
    map.set(r.emoji, entry)
  }
  return Array.from(map.entries()).map(([emoji, { reactors, allPending }]) => ({
    emoji,
    count: reactors.length,
    reactors,
    pending: allPending,
  }))
}

export const MessageBubble: React.FC<Props> = ({
  rumor,
  isMe,
  profileMap,
  reactions,
  parentRumor,
  onReply,
  onReact,
  isGroupChat = false,
  onAdminPress,
  deliveryInfo,
}) => {
  const { theme: { colors } } = useTheme()
  const styles = useStyles()
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerPosition, setPickerPosition] = useState({ x: 0, y: 0 })
  const [deliveryModalVisible, setDeliveryModalVisible] = useState(false)
  const swipeableRef = useRef<Swipeable>(null)

  const senderProfile = profileMap.get(rumor.pubkey)
  const senderName =
    senderProfile?.name ||
    senderProfile?.username ||
    senderProfile?.nip05 ||
    nip19.npubEncode(rumor.pubkey).slice(0, 10)

  const replyTag = rumor.tags.find((t) => t[0] === "e" && t[3] === "reply")
  const groupedReactions = groupReactions(reactions)

  const handleLongPress = (e: GestureResponderEvent) => {
    if (onAdminPress) {
      onAdminPress()
    } else {
      setPickerPosition({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
      setPickerVisible(true)
    }
  }

  const renderRightActions = () => (
    <View style={styles.swipeAction}>
      <Icon name="return-down-back-outline" size={22} color={colors.grey3} />
    </View>
  )

  const renderLeftActions = () => (
    <View style={styles.swipeAction}>
      <Icon name="return-down-forward-outline" size={22} color={colors.grey3} />
    </View>
  )

  return (
    <>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={isMe ? renderRightActions : undefined}
        renderLeftActions={!isMe ? renderLeftActions : undefined}
        onSwipeableOpen={() => {
          onReply(rumor)
          swipeableRef.current?.close()
        }}
        friction={2}
        rightThreshold={40}
        leftThreshold={40}
      >
        <View style={[styles.row, isMe ? styles.rowSent : styles.rowReceived]}>
          {/* Avatar for received messages in group chats */}
          {!isMe && isGroupChat && (
            <Image
              source={{
                uri:
                  senderProfile?.picture ||
                  "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
              }}
              style={styles.avatar}
            />
          )}

          <View style={[styles.bubbleWrapper, deliveryInfo?.pending && styles.bubblePending]}>
            {/* Sender name in group chats */}
            {!isMe && isGroupChat && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}

            {/* Quoted reply preview */}
            {replyTag && parentRumor && (
              <View style={styles.replyPreview}>
                <Text style={styles.replyPreviewAuthor}>
                  {profileMap.get(parentRumor.pubkey)?.name ||
                    nip19.npubEncode(parentRumor.pubkey).slice(0, 10)}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {parentRumor.content}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onLongPress={handleLongPress}
              activeOpacity={0.85}
              delayLongPress={400}
            >
              <View
                style={[
                  styles.bubble,
                  isMe
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.grey5 },
                ]}
              >
                <View style={styles.bubbleRow}>
                  {(rumor as any).metadata?.errors && (
                    <GaloyIcon name="warning" size={16} color="yellow" style={styles.errorIcon} />
                  )}
                  <Text style={[styles.messageText, isMe && styles.messageTextSent]}>
                    {rumor.content}
                  </Text>
                </View>
                <View style={styles.timestampRow}>
                  <Text style={[styles.timestamp, isMe && styles.timestampSent]}>
                    {formatTime(rumor.created_at)}
                  </Text>
                  {isMe && deliveryInfo && (
                    <TouchableOpacity
                      onPress={() => setDeliveryModalVisible(true)}
                      hitSlop={8}
                      style={styles.deliveryIcon}
                    >
                      {deliveryInfo.pending ? (
                        <Icon name="time-outline" size={11} color="rgba(255,255,255,0.6)" />
                      ) : deliveryInfo.results.some((r) => r.status === "accepted") ? (
                        <Icon name="checkmark-done-outline" size={11} color="rgba(255,255,255,0.7)" />
                      ) : (
                        <Icon name="alert-circle-outline" size={11} color="rgba(255,200,0,0.9)" />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>

            {/* Reaction pills */}
            {groupedReactions.length > 0 && (
              <View style={[styles.reactionsRow, isMe ? styles.reactionsRight : styles.reactionsLeft]}>
                {groupedReactions.map(({ emoji, count, reactors, pending }) => (
                  <View key={emoji} style={[styles.reactionPill, pending && styles.reactionPillPending]}>
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {/* Reactor avatars (up to MAX_AVATARS) */}
                    <View style={styles.reactorAvatars}>
                      {reactors.slice(0, MAX_AVATARS).map((pubkey, i) => (
                        <Image
                          key={pubkey}
                          source={{
                            uri:
                              profileMap.get(pubkey)?.picture ||
                              "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
                          }}
                          style={[styles.reactorAvatar, { marginLeft: i === 0 ? 4 : -6 }]}
                        />
                      ))}
                    </View>
                    {count > MAX_AVATARS && (
                      <Text style={styles.reactionCount}>+{count - MAX_AVATARS}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Swipeable>

      <ReactionPicker
        visible={pickerVisible}
        onSelect={onReact}
        onClose={() => setPickerVisible(false)}
        position={pickerPosition}
      />

      {isMe && deliveryInfo && (
        <Modal
          visible={deliveryModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeliveryModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setDeliveryModalVisible(false)}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Delivery Status</Text>
              {deliveryInfo.pending ? (
                <Text style={styles.modalPending}>Sending…</Text>
              ) : deliveryInfo.results.length === 0 ? (
                <Text style={styles.modalPending}>No relay info available</Text>
              ) : (
                <ScrollView>
                  {deliveryInfo.results.map((r) => (
                    <View key={r.url} style={styles.relayRow}>
                      <Icon
                        name={
                          r.status === "accepted"
                            ? "checkmark-circle-outline"
                            : r.status === "timeout"
                            ? "timer-outline"
                            : "close-circle-outline"
                        }
                        size={16}
                        color={r.status === "accepted" ? "#4caf50" : r.status === "timeout" ? "#ff9800" : "#f44336"}
                        style={{ marginRight: 8 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.relayUrl} numberOfLines={1}>
                          {r.url.replace("wss://", "")}
                        </Text>
                        {r.error && r.status !== "accepted" && (
                          <Text style={styles.relayError} numberOfLines={2}>
                            {r.error}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  rowSent: {
    justifyContent: "flex-end",
  },
  rowReceived: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    alignSelf: "flex-end",
    marginBottom: 4,
  },
  bubbleWrapper: {
    maxWidth: "75%",
  },
  bubblePending: {
    opacity: 0.5,
  },
  senderName: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.grey2,
    marginBottom: 2,
    marginLeft: 4,
  },
  replyPreview: {
    backgroundColor: colors.grey4,
    borderLeftWidth: 3,
    borderLeftColor: colors.grey2,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  replyPreviewAuthor: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary3,
  },
  replyPreviewText: {
    fontSize: 12,
    color: colors.grey1,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  messageText: {
    fontSize: 15,
    color: colors.primary3,
    flexShrink: 1,
  },
  messageTextSent: {
    color: "#FFFFFF",
  },
  timestamp: {
    fontSize: 10,
    color: colors.grey2,
    alignSelf: "flex-end",
  },
  timestampSent: {
    color: "rgba(255,255,255,0.7)",
  },
  errorIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  reactionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 3,
    gap: 4,
  },
  reactionsRight: {
    justifyContent: "flex-end",
  },
  reactionsLeft: {
    justifyContent: "flex-start",
  },
  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.grey4,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionPillPending: {
    opacity: 0.45,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactorAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  reactorAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.grey5,
  },
  reactionCount: {
    fontSize: 11,
    color: colors.grey1,
    marginLeft: 4,
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 60,
    paddingHorizontal: 12,
  },
  timestampRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  deliveryIcon: {
    marginLeft: 3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    width: "100%",
    maxHeight: 320,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.black,
    marginBottom: 12,
  },
  modalPending: {
    fontSize: 13,
    color: colors.grey2,
    textAlign: "center",
    paddingVertical: 8,
  },
  relayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
  },
  relayUrl: {
    fontSize: 13,
    color: colors.black,
    fontWeight: "500",
  },
  relayError: {
    fontSize: 11,
    color: colors.grey2,
    marginTop: 2,
  },
}))
