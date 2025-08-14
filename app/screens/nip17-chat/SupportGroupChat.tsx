import React, { useEffect, useRef, useState } from "react"
import { View, Platform } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp, StackScreenProps } from "@react-navigation/stack"
import { useTheme, makeStyles, Button, Text } from "@rneui/themed"
import { Screen } from "../../components/screen"
import { Chat, MessageType, defaultTheme } from "@flyerhq/react-native-chat-ui"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ChatMessage } from "./chatMessage"
import type { RootStackParamList } from "../../navigation/stack-param-lists"
import { useChatContext } from "./chatContext"
import { finalizeEvent } from "nostr-tools"
import { getSecretKey } from "@app/utils/nostr"

type Nip29GroupChatScreenProps = StackScreenProps<RootStackParamList, "Nip29GroupChat">

export const Nip29GroupChatScreen: React.FC<Nip29GroupChatScreenProps> = ({ route }) => {
  const { poolRef } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()

  const [messages, setMessages] = useState<Map<string, MessageType.Text>>(new Map())
  const [isMember, setIsMember] = useState(false)
  const { userPublicKey } = useChatContext()
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false)
  const prevIsMemberRef = useRef(isMember)
  const [knownMembers, setKnownMembers] = useState<Set<string>>(new Set())

  const sendJoinGroupRequest = async () => {
    if (!poolRef?.current) throw Error("No PoolRef present")

    const secretKey = await getSecretKey()
    if (!secretKey) throw Error("Could not get Secret Key")

    const joinEvent = {
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["h", "A9lScksyYAOWNxqR"], // Group ID
        // ["code", "optional-code"], // Optional invite code
      ],
      content: "I'd like to join this group.",
      pubkey: userPublicKey,
    }

    const signedJoinEvent = finalizeEvent(joinEvent, secretKey)
    console.log("Membership Request Sent:", signedJoinEvent)

    poolRef.current.publish(["wss://groups.0xchat.com"], signedJoinEvent)

    setHasRequestedJoin(true)
  }

  const addSystemMessage = (text: string) => {
    const sysMsg: MessageType.Text = {
      id: `sys-${Date.now()}`,
      author: { id: "system" },
      createdAt: Date.now(),
      type: "text",
      text,
    }
    setMessages((prev) => new Map(prev).set(sysMsg.id, sysMsg))
  }
  useEffect(() => {
    if (!prevIsMemberRef.current && isMember && hasRequestedJoin) {
      addSystemMessage("You joined the group")
      setHasRequestedJoin(false)
    }
    prevIsMemberRef.current = isMember
  }, [isMember, hasRequestedJoin])

  useEffect(() => {
    if (!poolRef?.current) return
    poolRef?.current.subscribeMany(
      ["wss://groups.0xchat.com"],
      [
        {
          "kinds": [39000],
          "authors": ["ad98dd84852786e33eb0651878eb835b242d25f7c0255e6e5a745bf7b6be15c8"],
          "#d": ["A9lScksyYAOWNxqR"],
        },
      ],
      {
        onevent: (event: any) => {
          console.log("EVENT RECEIVED WAS", event)
        },
      },
    )
  }, [])
  useEffect(() => {
    if (!poolRef?.current) return
    const subCloser = poolRef?.current.subscribeMany(
      ["wss://groups.0xchat.com"],
      [
        {
          "#h": ["A9lScksyYAOWNxqR"],
          "kinds": [9],
        },
      ],
      {
        onevent: (event: any) => {
          console.log("EVENT received was", event)
          const msg: MessageType.Text = {
            id: event.id,
            author: { id: event.pubkey },
            createdAt: event.created_at * 1000,
            type: "text",
            text: event.content,
          }

          setMessages((prev) => new Map(prev).set(msg.id, msg))
        },
      },
    )
  }, [])

  const shortenPubKey = (pubkey: string) => pubkey.slice(0, 6) + "…" + pubkey.slice(-4)

  useEffect(() => {
    if (!poolRef?.current) return

    poolRef.current.subscribeMany(
      ["wss://groups.0xchat.com"],
      [
        {
          "kinds": [39002],
          "authors": ["ad98dd84852786e33eb0651878eb835b242d25f7c0255e6e5a745bf7b6be15c8"],
          "#d": ["A9lScksyYAOWNxqR"],
        },
      ],
      {
        onevent: (event: any) => {
          console.log("MEMBERSHIP EVENT RECEIVED WAS", event)

          // Current set of members from event
          const currentMembers = event.tags
            .filter((tag: string[]) => tag[0] === "p")
            .map((tag: string[]) => tag[1])

          setKnownMembers((prev) => {
            const updated = new Set(prev)

            currentMembers.forEach((memberPubKey: string) => {
              if (!updated.has(memberPubKey)) {
                // New member detected
                if (memberPubKey === userPublicKey) {
                  addSystemMessage("You joined the group")
                } else {
                  addSystemMessage(`${shortenPubKey(memberPubKey)} joined the group`)
                }
                updated.add(memberPubKey)
              }
            })

            return updated
          })

          // Check if user is a member
          if (currentMembers.includes(userPublicKey)) {
            setIsMember(true)
          }
        },
      },
    )
  }, [poolRef?.current, userPublicKey])

  const handleSendPress = async (message: MessageType.PartialText) => {
    if (!poolRef?.current) throw Error("No PoolRef present")

    // Now publish to relay
    const nostrEvent = {
      kind: 9,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["h", "A9lScksyYAOWNxqR", "wss://groups.0xchat.com"]], // Your group ID tag
      content: message.text,
      pubkey: userPublicKey, // Your pubkey
    }

    // Sign the event (requires your signing logic)
    const secretKey = await getSecretKey()
    if (!secretKey) throw Error("Could not get Secret Key")
    const signedEvent = finalizeEvent(nostrEvent, secretKey)
    console.log("SIGNED EVENT IS", signedEvent)
    poolRef.current.publish(["wss://groups.0xchat.com"], signedEvent)
  }

  return (
    <Screen>
      <SafeAreaProvider>
        <View style={styles.chatView}>
          <Chat
            messages={Array.from(messages.values()).sort(
              (a, b) => b.createdAt! - a.createdAt!,
            )}
            onSendPress={handleSendPress}
            user={{ id: userPublicKey! }}
            renderTextMessage={(message, next, prev) => {
              // System message (e.g., joined group)
              if (message.author.id === "system") {
                return (
                  <View
                    style={{
                      alignItems: "center",
                      paddingVertical: 8,
                      backgroundColor: "#e0e0e0",
                    }}
                  >
                    <View
                      style={{
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#555",
                          textAlign: "center",
                        }}
                      >
                        {message.text}
                      </Text>
                    </View>
                  </View>
                )
              }

              // Normal chat messages
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  nextMessage={next}
                  prevMessage={prev}
                  showSender={true}
                />
              )
            }}
            customBottomComponent={
              !isMember
                ? () => (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Button title="Join Support Group" onPress={sendJoinGroupRequest} />
                    </View>
                  )
                : undefined
            }
            renderBubble={({ child, message }) => (
              <View
                style={{
                  backgroundColor:
                    userPublicKey === message.author.id ? "#8fbc8f" : "white",
                  borderRadius: 15,
                  overflow: "hidden",
                }}
              >
                {child}
              </View>
            )}
            l10nOverride={{
              emptyChatPlaceholder: "No messages yet...",
            }}
            flatListProps={{
              contentContainerStyle: {
                paddingTop: messages.size ? (Platform.OS == "ios" ? 50 : 0) : 100,
              },
            }}
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
          />
        </View>
      </SafeAreaProvider>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 10,
    paddingLeft: 10,
    paddingBottom: 6,
    paddingTop: Platform.OS === "ios" ? 40 : 10,
  },
  backButton: {
    fontSize: 26,
    color: colors.primary3,
  },
  chatView: {
    flex: 1,
    marginHorizontal: 30,
    borderRadius: 24,
    overflow: "hidden",
  },
}))
