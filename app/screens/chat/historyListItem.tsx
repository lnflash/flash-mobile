import { ListItem } from "@rneui/themed"
import { useStyles } from "./style"
import { Image, Text, View } from "react-native"
import { nip19, Event, getPublicKey } from "nostr-tools"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { useEffect, useState } from "react"
import { useChatContext } from "./chatContext"
import { Rumor } from "@app/utils/nostr"
import { getLastSeen } from "./utils"
import { bytesToHex } from "@noble/hashes/utils"
import Icon from "react-native-vector-icons/Ionicons"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"

interface HistoryListItemProps {
  item: string
  userPrivateKey: Uint8Array
  groups: Map<string, Rumor[]>
}

export const HistoryListItem: React.FC<HistoryListItemProps> = ({
  item,
  userPrivateKey,
  groups,
}) => {
  const { profileMap, addEventToProfiles } = useChatContext()
  const [hasUnread, setHasUnread] = useState(false)
  const [subscribedPubkeys, setSubscribedPubkeys] = useState<Set<string>>(new Set())

  const userPublicKey = userPrivateKey ? getPublicKey(userPrivateKey) : ""
  const selfNote = item.split(",").length === 1

  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const styles = useStyles()

  // Last message in this conversation
  const lastRumor = (groups.get(item) || []).sort(
    (a, b) => b.created_at - a.created_at,
  )[0]

  // Subscribe to profiles using nostrRuntime
  useEffect(() => {
    const pubkeys = item
      .split(",")
      .filter((p) => !profileMap?.get(p) && !subscribedPubkeys.has(p))
    if (pubkeys.length === 0) return

    pubkeys.forEach((pubkey) => subscribedPubkeys.add(pubkey))
    setSubscribedPubkeys(new Set(subscribedPubkeys))

    const unsub = nostrRuntime.ensureSubscription(
      `historyProfile:${pubkeys.join(",")}`,
      [{ kinds: [0], authors: pubkeys }],
      (event: Event) => {
        addEventToProfiles(event)
      },
    )
  }, [profileMap, subscribedPubkeys, item])

  // Check unread messages
  useFocusEffect(() => {
    const checkUnreadStatus = async () => {
      const lastSeen = await getLastSeen(item)
      if (lastRumor && (!lastSeen || lastSeen < lastRumor.created_at)) {
        setHasUnread(true)
      } else {
        setHasUnread(false)
      }
    }
    checkUnreadStatus()
  })

  return (
    <ListItem
      key={item}
      style={styles.item}
      containerStyle={styles.itemContainer}
      onPress={() =>
        navigation.navigate("messages", {
          groupId: item,
          userPrivateKey: bytesToHex(userPrivateKey),
        })
      }
    >
      {/* Profile Images */}
      {item
        .split(",")
        .filter((p) => p !== userPublicKey)
        .map((p) => (
          <Image
            key={p}
            source={{
              uri:
                profileMap?.get(p)?.picture ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
            }}
            style={styles.profilePicture}
          />
        ))}

      {/* Self note indicator */}
      {selfNote && (
        <Image
          key="self-note-image"
          source={{
            uri: "https://cdn.pixabay.com/photo/2016/07/29/21/39/school-1555899_960_720.png",
          }}
          style={styles.selfNotePicture}
        />
      )}

      {/* Names and last message */}
      <View style={{ flexDirection: "column", maxWidth: "80%" }}>
        <ListItem.Content key="heading">
          <ListItem.Subtitle style={styles.itemText} key="subheading">
            {item
              .split(",")
              .filter((p) => p !== userPublicKey)
              .map((pubkey) => {
                const profile = profileMap?.get(pubkey)
                return (
                  profile?.nip05 ||
                  profile?.name ||
                  profile?.username ||
                  nip19.npubEncode(pubkey).slice(0, 9) + ".."
                )
              })
              .join(", ")}
            {selfNote && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ ...styles.itemText, fontWeight: "bold" }}>
                  Note to Self
                </Text>
                <Icon
                  name="checkmark-done-circle-outline"
                  size={20}
                  style={styles.verifiedIcon}
                />
              </View>
            )}
          </ListItem.Subtitle>
        </ListItem.Content>

        <ListItem.Content key="last message">
          <View style={{ flexWrap: "wrap", flexDirection: "row" }}>
            {lastRumor && (
              <Text style={styles.itemText}>
                {(profileMap?.get(lastRumor.pubkey)?.name ||
                  profileMap?.get(lastRumor.pubkey)?.nip05 ||
                  profileMap?.get(lastRumor.pubkey)?.username ||
                  nip19.npubEncode(lastRumor.pubkey).slice(0, 9)) + ": "}
                {lastRumor.content.replace(/\s+/g, " ").slice(0, 55)}
                {lastRumor.content.length > 45 ? "..." : ""}
              </Text>
            )}
          </View>
        </ListItem.Content>
      </View>

      {/* Unread indicator */}
      {hasUnread && <View style={styles.unreadIndicator} />}
    </ListItem>
  )
}
