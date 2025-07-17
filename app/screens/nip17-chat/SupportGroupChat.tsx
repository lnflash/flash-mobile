import React, { useEffect, useState } from "react"
import { View, Platform } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp, StackScreenProps } from "@react-navigation/stack"
import { useTheme, Text, makeStyles } from "@rneui/themed"
import { Screen } from "../../components/screen"
import { Chat, MessageType, defaultTheme } from "@flyerhq/react-native-chat-ui"
import { SafeAreaProvider } from "react-native-safe-area-context"
import Icon from "react-native-vector-icons/Ionicons"
import { ChatMessage } from "./chatMessage"
import type { RootStackParamList } from "../../navigation/stack-param-lists"
import { useChatContext } from "./chatContext"

type Nip29GroupChatScreenProps = StackScreenProps<RootStackParamList, "Nip29GroupChat">

export const Nip29GroupChatScreen: React.FC<Nip29GroupChatScreenProps> = ({ route }) => {
  const { poolRef } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()
  const {
    theme: { colors },
  } = useTheme()
  const styles = useStyles()

  const [messages, setMessages] = useState<Map<string, MessageType.Text>>(new Map())
  const user = { id: "me" } // Replace with your actual pubkey

  useEffect(() => {
    if (!poolRef?.current) return
    const subCloser = poolRef?.current.subscribeMany(
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

  const handleSendPress = (message: MessageType.PartialText) => {
    // Placeholder send - just adds locally
    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      text: message.text,
      type: "text",
      id: message.text,
    }
    setMessages((prev) => new Map(prev).set(textMessage.id, textMessage))
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
            user={user}
            renderTextMessage={(message, next, prev) => (
              <ChatMessage
                key={message.id}
                message={message}
                nextMessage={next}
                prevMessage={prev}
              />
            )}
            renderBubble={({ child, message }) => (
              <View
                style={{
                  backgroundColor: user.id === message.author.id ? "#8fbc8f" : "white",
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
