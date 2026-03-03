import React, { useEffect, useRef, useState } from "react"
import { View, Image, TouchableOpacity, ListRenderItem } from "react-native"
import { makeStyles, useTheme, Text, Button } from "@rneui/themed"
import { Screen } from "../../../components/screen"
import { FlatList } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import Icon from "react-native-vector-icons/Ionicons"
import { nip19 } from "nostr-tools"
import type { StackScreenProps } from "@react-navigation/stack"
import type { RootStackParamList } from "../../../navigation/stack-param-lists"
import { useNostrGroupChat, GroupMessage } from "./GroupChatProvider"
import { useChatContext } from "../chatContext"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { MessageInput } from "../components/MessageInput"

type SupportGroupChatScreenProps = StackScreenProps<RootStackParamList, "Nip29GroupChat">

const DEFAULT_AVATAR =
  "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg"

function readProfilesFromStore(pubkeys: string[]): Map<string, any> {
  const map = new Map<string, any>()
  for (const pubkey of pubkeys) {
    const event = nostrRuntime.getEventStore().getLatest(`0:${pubkey}`)
    if (event) {
      try {
        map.set(pubkey, JSON.parse(event.content))
      } catch {}
    }
  }
  return map
}

const InnerGroupChat: React.FC = () => {
  const styles = useStyles()
  const { theme: { colors, mode } } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { messages, isMember, sendMessage, requestJoin, groupMetadata } = useNostrGroupChat()
  const { userPublicKey } = useChatContext()

  // Profile loading via EventStore (same pattern as messages.tsx)
  const subscribedPubkeys = useRef<Set<string>>(new Set())
  const [profileMap, setProfileMap] = useState<Map<string, any>>(new Map())

  useEffect(() => {
    const unsubStore = nostrRuntime.getEventStore().subscribe(() => {
      const pubkeys = Array.from(subscribedPubkeys.current)
      setProfileMap(readProfilesFromStore(pubkeys))
    })
    return unsubStore
  }, [])

  // Subscribe to profiles for any new authors we haven't seen yet
  useEffect(() => {
    const newPubkeys = messages
      .filter((m) => !m.isSystem && !subscribedPubkeys.current.has(m.authorId))
      .map((m) => m.authorId)
      .filter((id, i, arr) => arr.indexOf(id) === i) // unique

    if (newPubkeys.length === 0) return

    newPubkeys.forEach((pk) => subscribedPubkeys.current.add(pk))

    nostrRuntime.ensureSubscription(
      `groupProfiles:${[...subscribedPubkeys.current].sort().join(",")}`,
      { kinds: [0], authors: [...subscribedPubkeys.current] },
    )

    // Seed immediately from whatever's already in the store
    setProfileMap(readProfilesFromStore([...subscribedPubkeys.current]))
  }, [messages])

  const chatBg = mode === "dark" ? "#0e1a16" : "#eef5f2"

  const renderItem: ListRenderItem<GroupMessage> = ({ item: msg }) => {
    if (msg.isSystem) {
      return (
        <View style={styles.systemRow}>
          <View style={styles.systemPill}>
            <Text style={styles.systemText}>{msg.text}</Text>
          </View>
        </View>
      )
    }

    const isMe = msg.authorId === userPublicKey
    const profile = profileMap.get(msg.authorId)
    const senderName =
      profile?.name ||
      profile?.username ||
      nip19.npubEncode(msg.authorId).slice(0, 10)
    const time = new Date(msg.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })

    return (
      <View style={[styles.row, isMe ? styles.rowSent : styles.rowReceived]}>
        {!isMe && (
          <Image
            source={{ uri: profile?.picture || DEFAULT_AVATAR }}
            style={styles.avatar}
          />
        )}
        <View style={styles.bubbleWrapper}>
          {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
          <View
            style={[
              styles.bubble,
              isMe ? { backgroundColor: colors.primary } : { backgroundColor: colors.grey5 },
            ]}
          >
            <Text style={[styles.messageText, isMe && styles.messageTextSent]}>
              {msg.text}
            </Text>
            <Text style={[styles.timestamp, isMe && styles.timestampSent]}>{time}</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <Screen>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={navigation.goBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-back-outline" size={24} color={colors.primary3} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} activeOpacity={0.7}>
          <Image
            source={
              groupMetadata.picture
                ? { uri: groupMetadata.picture }
                : require("../../../assets/images/Flash-Mascot.png")
            }
            style={[styles.headerAvatar, { borderColor: colors.primary }]}
          />
          <View style={styles.headerNameCol}>
            <Text style={styles.headerName} numberOfLines={1}>
              {groupMetadata.name || "Support Group"}
            </Text>
            {groupMetadata.about && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {groupMetadata.about}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Message list */}
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ backgroundColor: chatBg }}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.grey2 }}>No messages yet</Text>
          </View>
        }
      />

      {/* Input or Join button */}
      <View style={{ paddingBottom: insets.bottom }}>
        {isMember ? (
          <MessageInput
            replyTo={null}
            profileMap={profileMap}
            onCancelReply={() => {}}
            onSend={(text) => sendMessage(text)}
          />
        ) : (
          <View style={styles.joinContainer}>
            <Button title="Request to Join" onPress={requestJoin} />
          </View>
        )}
      </View>
    </Screen>
  )
}

export const SupportGroupChatScreen: React.FC<SupportGroupChatScreenProps> = () => {
  return <InnerGroupChat />
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.grey4,
    backgroundColor: colors.grey5,
  },
  backBtn: {
    padding: 4,
    marginRight: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    marginRight: 10,
  },
  headerNameCol: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.grey2,
    marginTop: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  systemRow: {
    alignItems: "center",
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  systemPill: {
    backgroundColor: colors.grey4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  systemText: {
    fontSize: 12,
    color: colors.grey1,
    textAlign: "center",
  },
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
  senderName: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.grey2,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    marginTop: 2,
  },
  timestampSent: {
    color: "rgba(255,255,255,0.7)",
  },
  joinContainer: {
    padding: 16,
    alignItems: "center",
    backgroundColor: colors.grey5,
    borderTopWidth: 0.5,
    borderTopColor: colors.grey4,
  },
}))
