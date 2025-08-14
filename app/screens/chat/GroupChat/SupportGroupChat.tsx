import React from "react"
import { View, Platform } from "react-native"
import { useTheme, makeStyles, Button, Text } from "@rneui/themed"
import { Screen } from "../../../components/screen"
import { Chat, MessageType, defaultTheme } from "@flyerhq/react-native-chat-ui"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { ChatMessage } from "../chatMessage"
import type { StackScreenProps } from "@react-navigation/stack"
import type { RootStackParamList } from "../../../navigation/stack-param-lists"
import { NostrGroupChatProvider, useNostrGroupChat } from "./GroupChatProvider"

type SupportGroupChatScreenProps = StackScreenProps<RootStackParamList, "Nip29GroupChat">

const InnerGroupChat: React.FC = () => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()

  const { messages, isMember, sendMessage, requestJoin } = useNostrGroupChat()

  const renderTextMessage = (
    message: MessageType.Text,
    showName: number,
    nextMessage: boolean,
  ) => {
    if (message.author.id === "system") {
      return (
        <View
          style={{ alignItems: "center", paddingVertical: 8, backgroundColor: "#e0e0e0" }}
        >
          <View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: "#555", textAlign: "center" }}>
              {message.text}
            </Text>
          </View>
        </View>
      )
    }

    return (
      <ChatMessage
        key={message.id}
        message={message}
        showSender={!!showName}
        nextMessage={0}
        prevMessage={false}
      />
    )
  }

  return (
    <Screen>
      <SafeAreaProvider>
        <View style={styles.chatView}>
          <Chat
            messages={messages}
            onSendPress={(partial: MessageType.PartialText) => sendMessage(partial.text)}
            user={{ id: "me" }}
            renderTextMessage={(message, showName, nextMessage) =>
              renderTextMessage(message, showName, nextMessage)
            }
            customBottomComponent={
              !isMember
                ? () => (
                    <View style={{ padding: 16, alignItems: "center" }}>
                      <Button title="Join Support Group" onPress={requestJoin} />
                    </View>
                  )
                : undefined
            }
            renderBubble={({ child, message }) => (
              <View
                style={{
                  backgroundColor: message.author.id === "me" ? "#8fbc8f" : "white",
                  borderRadius: 15,
                  overflow: "hidden",
                }}
              >
                {child}
              </View>
            )}
            l10nOverride={{ emptyChatPlaceholder: "No messages yet..." }}
            flatListProps={{
              contentContainerStyle: {
                paddingTop: messages.length ? (Platform.OS === "ios" ? 50 : 0) : 100,
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

export const SupportGroupChatScreen: React.FC<SupportGroupChatScreenProps> = ({
  route,
}) => {
  const groupId = "A9lScksyYAOWNxqR"
  console.log("GROUP ID IS", groupId)
  const adminPubkeys: string[] = []

  return (
    <NostrGroupChatProvider
      groupId={groupId}
      relayUrls={["wss://groups.0xchat.com"]}
      adminPubkeys={adminPubkeys}
    >
      <InnerGroupChat />
    </NostrGroupChatProvider>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  chatView: {
    flex: 1,
    marginHorizontal: 30,
    borderRadius: 24,
    overflow: "hidden",
  },
}))
