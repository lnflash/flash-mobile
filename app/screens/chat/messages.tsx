import "react-native-get-random-values"
import * as React from "react"
import { ActivityIndicator, Image, Platform, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RouteProp, useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { Screen } from "../../components/screen"
import type {
  ChatStackParamList,
  RootStackParamList,
} from "../../navigation/stack-param-lists"
import { makeStyles, Text, useTheme } from "@rneui/themed"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"
import { isIos } from "@app/utils/helper"
import { Chat, MessageType, defaultTheme } from "@flyerhq/react-native-chat-ui"
import { ChatMessage } from "./chatMessage"
import Icon from "react-native-vector-icons/Ionicons"
import { getPublicKey, nip19, Event } from "nostr-tools"
import { Rumor, convertRumorsToGroups, sendNip17Message } from "@app/utils/nostr"
import { useEffect, useState } from "react"
import { useChatContext } from "./chatContext"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { updateLastSeen } from "./utils"
import { hexToBytes } from "@noble/hashes/utils"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { pool } from "@app/utils/nostr/pool"

type MessagesProps = {
  route: RouteProp<ChatStackParamList, "messages">
}

export const Messages: React.FC<MessagesProps> = ({ route }) => {
  const userPrivateKeyBytes = hexToBytes(route.params.userPrivateKey)
  const userPubkey = getPublicKey(userPrivateKeyBytes)
  const groupId = route.params.groupId
  const [profileMap, setProfileMap] = useState<Map<string, NostrProfile>>(new Map())
  const [preferredRelaysMap, setPreferredRelaysMap] = useState<Map<string, string[]>>(
    new Map(),
  )

  // Helper for handling profile events
  const handleProfileEvent = (event: Event) => {
    try {
      const profile = JSON.parse(event.content)
      setProfileMap((prev) => new Map(prev).set(event.pubkey, profile))
    } catch (e) {
      console.error("Failed to parse profile event", e)
    }
  }

  // Subscribe to profiles using nostrRuntime
  useEffect(() => {
    const pubkeys = groupId.split(",")
    nostrRuntime.ensureSubscription(
      `messagesProfiles:${pubkeys.join(",")}`,
      [{ kinds: [0], authors: pubkeys }],
      handleProfileEvent,
    )
  }, [groupId])

  return (
    <MessagesScreen
      userPubkey={userPubkey}
      groupId={groupId}
      profileMap={profileMap}
      preferredRelaysMap={preferredRelaysMap}
      userPrivateKey={userPrivateKeyBytes}
    />
  )
}

type MessagesScreenProps = {
  groupId: string
  userPubkey: string
  userPrivateKey: Uint8Array
  profileMap: Map<string, NostrProfile>
  preferredRelaysMap: Map<string, string[]>
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({
  userPubkey,
  userPrivateKey,
  groupId,
  profileMap,
  preferredRelaysMap,
}) => {
  const {
    theme: { colors },
  } = useTheme()
  const { rumors } = useChatContext()
  const styles = useStyles()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
  const { LL } = useI18nContext()
  const [initialized, setInitialized] = useState(false)
  const [messages, setMessages] = useState<Map<string, MessageType.Text>>(new Map())
  const user = { id: userPubkey }

  const convertRumorsToMessages = (rumors: Rumor[]) => {
    const chatMap = new Map<string, MessageType.Text>()
    rumors.forEach((r) => {
      chatMap.set(r.id, {
        author: { id: r.pubkey },
        createdAt: r.created_at * 1000,
        id: r.id,
        type: "text",
        text: r.content,
      })
    })
    return chatMap
  }

  // Initialize messages map & last-seen tracking
  useEffect(() => {
    setInitialized(true)
    const chatRumors = convertRumorsToGroups(rumors).get(groupId) || []
    const lastRumor = chatRumors.sort((a, b) => b.created_at - a.created_at)[0]
    if (lastRumor) updateLastSeen(groupId, lastRumor.created_at)
    setMessages((prev) => new Map([...prev, ...convertRumorsToMessages(chatRumors)]))
  }, [rumors])

  const handleSendPress = async (message: MessageType.PartialText) => {
    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      text: message.text,
      type: "text",
      id: message.text,
    }

    let sent = false
    const onSent = (rumor: Rumor) => {
      if (!sent) {
        textMessage.id = rumor.id
        setMessages((prev) => new Map(prev).set(textMessage.id, textMessage))
        sent = true
      }
    }

    const result = await sendNip17Message(
      groupId.split(","),
      message.text,
      preferredRelaysMap,
      onSent,
    )

    // Mark failed messages
    if (result.outputs.filter((o) => o.acceptedRelays.length > 0).length === 0) {
      textMessage.metadata = { errors: true }
      textMessage.id = result.rumor.id
      setMessages((prev) => new Map(prev).set(textMessage.id, textMessage))
    }
  }

  return (
    <Screen>
      <View style={styles.aliasView}>
        <Icon
          name="arrow-back-outline"
          onPress={navigation.goBack}
          style={styles.backButton}
        />
        <Text type="p1">
          {groupId
            .split(",")
            .filter((p) => p !== userPubkey)
            .map(
              (p) =>
                profileMap.get(p)?.name ||
                profileMap.get(p)?.username ||
                profileMap.get(p)?.lud16 ||
                nip19.npubEncode(p).slice(0, 9) + "..",
            )
            .join(", ")}
        </Text>
        <View style={{ flexDirection: "row" }}>
          <GaloyIconButton
            name="lightning"
            size="medium"
            style={{ margin: 5 }}
            onPress={() => {
              const recipientId = groupId.split(",").filter((id) => id !== userPubkey)[0]
              navigation.navigate("sendBitcoinDestination", {
                username: profileMap.get(recipientId)?.lud16,
              })
            }}
          />
          {groupId
            .split(",")
            .filter((p) => p !== userPubkey)
            .map((pubkey) => (
              <Image
                key={pubkey}
                source={{
                  uri:
                    profileMap.get(pubkey)?.picture ||
                    "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
                }}
                style={styles.userPic}
              />
            ))}
        </View>
      </View>

      {!initialized && <ActivityIndicator />}

      <View style={styles.chatBodyContainer}>
        <View style={styles.chatView}>
          <SafeAreaProvider>
            <Chat
              messages={Array.from(messages.values()).sort(
                (a, b) => b.createdAt! - a.createdAt!,
              )}
              user={user}
              onSendPress={handleSendPress}
              renderTextMessage={(msg, next, prev) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  nextMessage={next}
                  prevMessage={prev}
                />
              )}
              theme={{
                ...defaultTheme,
                colors: {
                  ...defaultTheme.colors,
                  inputBackground: colors._black,
                  background: colors._lightGrey,
                },
                fonts: {
                  ...defaultTheme.fonts,
                  sentMessageBodyTextStyle: {
                    ...defaultTheme.fonts.sentMessageBodyTextStyle,
                    fontSize: 12,
                  },
                },
              }}
              l10nOverride={{
                emptyChatPlaceholder: initialized
                  ? isIos
                    ? "No messages here yet"
                    : "..."
                  : isIos
                  ? "Fetching Messages..."
                  : "...",
              }}
              flatListProps={{
                contentContainerStyle: {
                  paddingTop: messages.size ? (Platform.OS === "ios" ? 50 : 0) : 100,
                },
              }}
            />
          </SafeAreaProvider>
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  aliasView: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 10,
    paddingLeft: 10,
    paddingBottom: 6,
    paddingTop: isIos ? 40 : 10,
  },
  chatBodyContainer: { flex: 1 },
  chatView: { flex: 1, marginHorizontal: 30, borderRadius: 24, overflow: "hidden" },
  userPic: {
    borderRadius: 50,
    height: 50,
    width: 50,
    borderWidth: 1,
    borderColor: colors.green,
  },
  backButton: { fontSize: 26, color: colors.primary3 },
}))
