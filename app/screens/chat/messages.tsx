import "react-native-get-random-values"
import * as React from "react"
import { Image, View, TouchableOpacity } from "react-native"
import { RouteProp, useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Screen } from "../../components/screen"
import type {
  ChatStackParamList,
  RootStackParamList,
} from "../../navigation/stack-param-lists"
import { Text, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { nip19 } from "nostr-tools"
import { Rumor, getGroupId, sendNip17Message, sendReaction } from "@app/utils/nostr"
import { useEffect, useMemo, useState } from "react"
import { useChatContext } from "./chatContext"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { updateLastSeen } from "./utils"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { getSigner } from "@app/nostr/signer"
import { FlatList } from "react-native-gesture-handler"
import { MessageBubble } from "./components/MessageBubble"
import { MessageInput } from "./components/MessageInput"

type MessagesProps = {
  route: RouteProp<ChatStackParamList, "messages">
}

export const Messages: React.FC<MessagesProps> = ({ route }) => {
  const { userPublicKey } = useChatContext()
  return (
    <MessagesScreen
      userPubkey={userPublicKey || ""}
      groupId={route.params.groupId}
    />
  )
}

type MessagesScreenProps = {
  groupId: string
  userPubkey: string
}

function readProfilesFromStore(pubkeys: string[]): Map<string, NostrProfile> {
  const map = new Map<string, NostrProfile>()
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

export const MessagesScreen: React.FC<MessagesScreenProps> = ({ userPubkey, groupId }) => {
  const { theme: { colors, mode } } = useTheme()
  const styles = useStyles()
  const { rumors, setRumors, reactions, addOptimisticReaction } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
  const insets = useSafeAreaInsets()

  const [replyTo, setReplyTo] = useState<Rumor | null>(null)

  const pubkeys = groupId.split(",")
  const isGroupChat = pubkeys.length > 2
  const recipientPubkeys = pubkeys.filter((p) => p !== userPubkey)

  // Seed profiles immediately from EventStore, then subscribe for live updates
  const [profileMap, setProfileMap] = useState<Map<string, NostrProfile>>(() =>
    readProfilesFromStore(pubkeys),
  )

  useEffect(() => {
    // Re-read from EventStore whenever it emits (covers profiles fetched by any screen)
    const unsubStore = nostrRuntime.getEventStore().subscribe(() => {
      setProfileMap(readProfilesFromStore(pubkeys))
    })

    // Ensure relay subscription for profiles not yet in store
    nostrRuntime.ensureSubscription(
      `messagesProfiles:${pubkeys.join(",")}`,
      { kinds: [0], authors: pubkeys },
    )

    return unsubStore
  }, [groupId])

  // Build deduplicated chat rumor list synchronously (no extra render cycle)
  const chatRumors = useMemo(() => {
    const seen = new Set<string>()
    return rumors
      .filter((r) => {
        if (r.kind !== 14) return false
        const participants = r.tags.filter((t) => t[0] === "p").map((t) => t[1])
        return getGroupId([...participants, r.pubkey]) === groupId
      })
      .filter((r) => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .sort((a, b) => a.created_at - b.created_at)
  }, [rumors, groupId])

  useEffect(() => {
    const last = chatRumors[chatRumors.length - 1]
    if (last) updateLastSeen(groupId, last.created_at)
  }, [chatRumors, groupId])

  const getParentRumor = (rumor: Rumor): Rumor | null => {
    const replyTag = rumor.tags.find((t) => t[0] === "e" && t[3] === "reply")
    if (!replyTag) return null
    return rumors.find((r) => r.id === replyTag[1]) || null
  }

  const handleSend = async (text: string, replyToId?: string) => {
    const signer = await getSigner()
    const result = await sendNip17Message(
      pubkeys,
      text,
      new Map(),
      signer,
      (rumor) => {
        setRumors((prev) => {
          if (prev.some((r) => r.id === rumor.id)) return prev
          return [...prev, rumor]
        })
      },
      replyToId,
    )

    if (result.outputs.filter((o) => o.acceptedRelays.length > 0).length === 0) {
      const failed = { ...result.rumor, metadata: { errors: true } } as any
      setRumors((prev) => {
        if (prev.some((r) => r.id === failed.id)) return prev
        return [...prev, failed]
      })
    }
  }

  const handleReaction = (rumor: Rumor, emoji: string) => {
    if (userPubkey) addOptimisticReaction(rumor.id, emoji, userPubkey)
    getSigner().then((signer) => sendReaction(rumor.id, rumor.pubkey, emoji, pubkeys, new Map(), signer))
  }

  const recipientProfile = profileMap.get(recipientPubkeys[0])
  const headerTitle = recipientPubkeys
    .map(
      (p) =>
        profileMap.get(p)?.name ||
        profileMap.get(p)?.username ||
        profileMap.get(p)?.lud16 ||
        nip19.npubEncode(p).slice(0, 9) + "..",
    )
    .join(", ")

  const chatBg = mode === "dark" ? "#0e1a16" : "#eef5f2"

  return (
    <Screen>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={navigation.goBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-back-outline" size={24} color={colors.primary3} />
        </TouchableOpacity>

        {/* Avatar + name */}
        <TouchableOpacity style={styles.headerCenter} activeOpacity={0.7}>
          <Image
            source={{
              uri:
                recipientProfile?.picture ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
            }}
            style={[styles.headerAvatar, { borderColor: colors.primary }]}
          />
          <View style={styles.headerNameCol}>
            <Text style={styles.headerName} numberOfLines={1}>
              {headerTitle}
            </Text>
            {recipientProfile?.nip05 && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {recipientProfile.nip05}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Lightning button */}
        <TouchableOpacity
          style={[styles.lightningBtn, { backgroundColor: colors.primary + "18" }]}
          onPress={() => {
            navigation.navigate("sendBitcoinDestination", {
              username: recipientProfile?.lud16,
            })
          }}
          hitSlop={8}
        >
          <Icon name="flash-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Message list */}
      <FlatList
        inverted
        data={[...chatRumors].reverse()}
        keyExtractor={(r) => r.id}
        style={{ backgroundColor: chatBg }}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <MessageBubble
            rumor={item}
            isMe={item.pubkey === userPubkey}
            profileMap={profileMap}
            reactions={reactions.get(item.id) || []}
            parentRumor={getParentRumor(item)}
            onReply={(r) => setReplyTo(r)}
            onReact={(emoji) => handleReaction(item, emoji)}
            isGroupChat={isGroupChat}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.grey2 }}>No messages yet</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={{ paddingBottom: insets.bottom }}>
        <MessageInput
          replyTo={replyTo}
          profileMap={profileMap}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
        />
      </View>
    </Screen>
  )
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
    marginRight: 8,
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
  lightningBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
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
}))
