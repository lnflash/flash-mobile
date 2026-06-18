import React, { useEffect, useRef, useState } from "react"
import { Alert, View, Image, TouchableOpacity, Platform } from "react-native"
import { makeStyles, useTheme, Text, Button } from "@rneui/themed"
import { Screen } from "../../../components/screen"
import { FlatList } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import Icon from "react-native-vector-icons/Ionicons"
import type { StackScreenProps } from "@react-navigation/stack"
import type { RootStackParamList } from "../../../navigation/stack-param-lists"
import { useNostrGroupChat, GroupMessage, NostrGroupChatProvider } from "./GroupChatProvider"
import { NIP29_DEFAULT_GROUP_ID, NIP29_DEFAULT_RELAY_URL } from "./constants"
import { useChatContext } from "../chatContext"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { MessageInput } from "../components/MessageInput"
import { MessageBubble } from "../components/MessageBubble"
import { GroupInfoModal } from "./GroupInfoModal"
import { Rumor } from "@app/utils/nostr"

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

// Convert a GroupMessage to a Rumor-compatible shape for MessageBubble
function toRumor(msg: GroupMessage): Rumor {
  const tags: string[][] = []
  if (msg.replyToId) tags.push(["e", msg.replyToId, "", "reply"])
  return {
    id: msg.id,
    pubkey: msg.authorId,
    content: msg.text,
    created_at: Math.floor(msg.createdAt / 1000),
    kind: 9,
    tags,
  }
}

const InnerGroupChat: React.FC = () => {
  const styles = useStyles()
  const { theme: { colors, mode } } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const { messages, isMember, isAdmin, canModerate, isKing, adminList, roleMap, knownMembers, sendMessage, requestJoin, removeMessage, removeMember, setRole, groupMetadata } = useNostrGroupChat()
  const { userPublicKey } = useChatContext()
  const [replyTo, setReplyTo] = useState<Rumor | null>(null)
  const [infoVisible, setInfoVisible] = useState(false)

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

  // Subscribe to profiles for any new authors/members/admins we haven't seen yet
  useEffect(() => {
    const candidates = [
      ...messages.filter((m) => !m.isSystem).map((m) => m.authorId),
      ...knownMembers,
      ...adminList,
    ]
    const newPubkeys = candidates.filter(
      (id, i, arr) => !subscribedPubkeys.current.has(id) && arr.indexOf(id) === i,
    )

    if (newPubkeys.length === 0) return

    newPubkeys.forEach((pk) => subscribedPubkeys.current.add(pk))

    nostrRuntime.ensureSubscription(
      `groupProfiles:${[...subscribedPubkeys.current].sort().join(",")}`,
      { kinds: [0], authors: [...subscribedPubkeys.current] },
    )

    setProfileMap(readProfilesFromStore([...subscribedPubkeys.current]))
  }, [messages, knownMembers, adminList])

  const chatBg = mode === "dark" ? "#0e1a16" : "#eef5f2"

  const handleAdminPress = (msg: GroupMessage) => {
    const isOwnMessage = msg.authorId === userPublicKey
    const targetIsAdmin = adminList.includes(msg.authorId)
    const options: { text: string; onPress: () => void; style?: "destructive" | "cancel" }[] = []

    // Delete is available to any moderator (king or bishop).
    if (canModerate) {
      options.push({
        text: "Delete Message",
        style: "destructive",
        onPress: () => removeMessage(msg.id),
      })
    }

    if (!isOwnMessage) {
      // Removing users and promoting roles are king-only actions.
      if (isKing) {
        options.push({
          text: "Remove User",
          style: "destructive",
          onPress: () => {
            Alert.alert("Remove User", "Remove this user from the group?", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => removeMember(msg.authorId) },
            ])
          },
        })

        if (!targetIsAdmin) {
          options.push({
            text: "Make Bishop",
            onPress: () => {
              Alert.alert("Make Bishop", "Grant this user moderator (bishop) permissions?", [
                { text: "Cancel", style: "cancel" },
                { text: "Make Bishop", onPress: () => setRole(msg.authorId, "bishop") },
              ])
            },
          })
          options.push({
            text: "Make King",
            onPress: () => {
              Alert.alert("Make King", "Grant this user full admin (king) permissions?", [
                { text: "Cancel", style: "cancel" },
                { text: "Make King", onPress: () => setRole(msg.authorId, "king") },
              ])
            },
          })
        }
      }
    }

    options.push({ text: "Cancel", style: "cancel", onPress: () => {} })

    Alert.alert("Admin Actions", undefined, options)
  }

  // Build a map of rumor-shaped messages for parent lookup
  const rumorMap = new Map(messages.filter((m) => !m.isSystem).map((m) => [m.id, toRumor(m)]))

  const getParentRumor = (rumor: Rumor): Rumor | null => {
    const replyTag = rumor.tags.find((t) => t[0] === "e" && t[3] === "reply")
    if (!replyTag) return null
    return rumorMap.get(replyTag[1]) || null
  }

  return (
    <Screen>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "android" ? insets.top : 0 }]}>
        <TouchableOpacity onPress={navigation.goBack} style={styles.backBtn} hitSlop={8}>
          <Icon name="arrow-back-outline" size={24} color={colors.primary3} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} activeOpacity={0.7} onPress={() => setInfoVisible(true)}>
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
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {knownMembers.size} members · tap for info
            </Text>
          </View>
        </TouchableOpacity>
        <Icon name="information-circle-outline" size={22} color={colors.primary} style={{ marginLeft: 4 }} />
      </View>

      {/* Message list */}
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ backgroundColor: chatBg }}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: msg }) => {
          if (msg.isSystem) {
            return (
              <View style={styles.systemRow}>
                <View style={styles.systemPill}>
                  <Text style={styles.systemText}>{msg.text}</Text>
                </View>
              </View>
            )
          }
          const rumor = toRumor(msg)
          return (
            <MessageBubble
              rumor={rumor}
              isMe={msg.authorId === userPublicKey}
              profileMap={profileMap}
              reactions={[]}
              parentRumor={getParentRumor(rumor)}
              onReply={setReplyTo}
              onReact={() => {}}
              isGroupChat
              onAdminPress={canModerate || isKing ? () => handleAdminPress(msg) : undefined}
            />
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: colors.grey2 }}>No messages yet</Text>
          </View>
        }
      />

      {/* Input or Join button */}
      <View style={{ paddingBottom: Platform.OS === "android" ? insets.bottom : 0 }}>
        {isMember ? (
          <MessageInput
            replyTo={replyTo}
            profileMap={profileMap}
            onCancelReply={() => setReplyTo(null)}
            onSend={(text) => sendMessage(text, replyTo?.id)}
          />
        ) : (
          <View style={styles.joinContainer}>
            <Button title="Request to Join" onPress={requestJoin} />
          </View>
        )}
      </View>

      <GroupInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        groupMetadata={groupMetadata}
        adminList={adminList}
        roleMap={roleMap}
        memberCount={knownMembers.size}
        profileMap={profileMap}
        isAdmin={isAdmin}
      />
    </Screen>
  )
}

export const SupportGroupChatScreen: React.FC<SupportGroupChatScreenProps> = ({ route }) => {
  const groupId = route.params?.groupId || NIP29_DEFAULT_GROUP_ID
  return (
    <NostrGroupChatProvider groupId={groupId} relayUrls={[NIP29_DEFAULT_RELAY_URL]}>
      <InnerGroupChat />
    </NostrGroupChatProvider>
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
  joinContainer: {
    padding: 16,
    alignItems: "center",
    backgroundColor: colors.grey5,
    borderTopWidth: 0.5,
    borderTopColor: colors.grey4,
  },
}))
