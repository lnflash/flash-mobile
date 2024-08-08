import "react-native-get-random-values"
import * as React from "react"
import { ActivityIndicator, Image, View } from "react-native"
import { useI18nContext } from "@app/i18n/i18n-react"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
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
import { getPublicKey, Event, nip19, SubCloser } from "nostr-tools"
import {
  Rumor,
  convertRumorsToGroups,
  fetchNostrUsers,
  getRumorFromWrap,
  sendNip17Message,
} from "@app/utils/nostr"
import { useEffect, useState } from "react"
import { useChatContext } from "./chatContext"

type MessagesProps = {
  route: RouteProp<ChatStackParamList, "messages">
}

export const Messages: React.FC<MessagesProps> = ({ route }) => {
  let userPubkey = getPublicKey(route.params.userPrivateKey)
  let groupId = route.params.groupId
  const { poolRef } = useChatContext()
  const [profileMap, setProfileMap] = useState<Map<string, NostrProfile>>()

  function handleProfileEvent(event: Event) {
    let profile = JSON.parse(event.content)
    setProfileMap((profileMap) => {
      let newProfileMap = profileMap || new Map<string, Object>()
      newProfileMap.set(event.pubkey, profile)
      return newProfileMap
    })
  }

  useEffect(() => {
    let closer: SubCloser
    if (poolRef)
      closer = fetchNostrUsers(groupId.split(","), poolRef.current, handleProfileEvent)
    return () => {
      if (closer) closer.close()
    }
  }, [groupId, poolRef])

  return (
    <MessagesScreen
      userPubkey={userPubkey}
      groupId={route.params.groupId}
      profileMap={profileMap}
    />
  )
}

type MessagesScreenProps = {
  groupId: string
  userPubkey: string
  profileMap?: Map<string, NostrProfile>
}

export const MessagesScreen: React.FC<MessagesScreenProps> = ({
  userPubkey,
  groupId,
  profileMap,
}) => {
  const {
    theme: { colors },
  } = useTheme()
  let { rumors, poolRef } = useChatContext()
  let chatRumors = convertRumorsToGroups(rumors).get(groupId)
  const styles = useStyles()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList, "Primary">>()
  const { LL } = useI18nContext()
  const [initialized, setInitialized] = React.useState(false)

  const user = { id: userPubkey }
  console.log("IN MESSAGES SCREEN", rumors)

  const convertRumorsToMessages = (rumors: Rumor[]): MessageType.Text[] => {
    let chats = (chatRumors || []).map((r) => {
      return {
        author: { id: r.pubkey },
        createdAt: r.created_at,
        id: r.id,
        type: "text",
        text: r.content,
      }
    })
    chats.sort((a, b) => {
      return b.createdAt - a.createdAt
    })
    return chats as MessageType.Text[]
  }

  React.useEffect(() => {
    console.log("NEW ITEMSSS IN MESSAGES SCREEEEN")
    let isMounted = true
    async function initialize() {
      if (poolRef) setInitialized(true)
    }
    if (!initialized) initialize()

    return () => {
      isMounted = false
    }
  }, [poolRef])

  const handleSendPress = async (message: MessageType.PartialText) => {
    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      id: user.id,
      text: message.text,
      type: "text",
    }
    await sendNip17Message(groupId.split(","), message.text, poolRef!.current)
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
          {profileMap?.get(userPubkey)?.name ||
            profileMap?.get(userPubkey)?.username ||
            profileMap?.get(userPubkey)?.lud16 ||
            nip19.npubEncode(userPubkey).slice(0, 9) + ".."}
        </Text>
        <View style={{ display: "flex", flexDirection: "row" }}>
          <GaloyIconButton
            name={"lightning"}
            size="large"
            //text={LL.HomeScreen.pay()}
            style={{ marginRight: 5 }}
            onPress={() =>
              navigation.navigate("sendBitcoinDestination", {
                //username: chat.lud16,
              })
            }
          />
          <Image
            source={{
              uri: "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
            }}
            style={styles.userPic}
          />
        </View>
      </View>
      {!initialized && <ActivityIndicator />}
      <View style={styles.chatBodyContainer}>
        <View style={styles.chatView}>
          <Chat
            messages={convertRumorsToMessages(rumors)}
            onPreviewDataFetched={() => {}}
            onSendPress={handleSendPress}
            l10nOverride={{
              emptyChatPlaceholder: initialized
                ? isIos
                  ? "No messages here yet"
                  : "..."
                : isIos
                ? "Fetching Messages..."
                : "...",
            }}
            showUserAvatars={true}
            user={user}
            renderTextMessage={(message, nextMessage, prevMessage) => (
              <ChatMessage
                message={message}
                recipientId={userPubkey}
                nextMessage={nextMessage}
                prevMessage={prevMessage}
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
          />
        </View>
      </View>
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  actionsContainer: {
    margin: 12,
  },
  aliasView: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 10,
    paddingLeft: 10,
    paddingBottom: 6,
    paddingTop: isIos ? 40 : 10,
  },
  chatBodyContainer: {
    flex: 1,
  },
  chatView: {
    flex: 1,
    marginHorizontal: 30,
    borderRadius: 24,
    overflow: "hidden",
  },
  userPic: {
    borderRadius: 50,
    height: 50,
    width: 50,
    borderWidth: 1,
    borderColor: colors.green,
  },
  backButton: {
    fontSize: 26,
  },
}))
