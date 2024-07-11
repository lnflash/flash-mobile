import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image } from "react-native"
import { UnsignedEvent, nip19 } from "nostr-tools"
import { Rumor } from "@app/utils/nostr"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"

interface HistoryListItemProps {
  item: Rumor[]
  userPubKey: string
}
export const HistoryListItem: React.FC<HistoryListItemProps> = ({ item, userPubKey }) => {
  const styles = useStyles()
  let participants = item[0].tags.filter((t) => t[0] === "p").map((p) => p[1])
  const participantsSet = new Set([...participants, item[0].pubkey])
  participants = Array.from(participantsSet)
  participants.sort()
  const id = participants.join(",")
  const displayParticipants = participants.map((p) => nip19.npubEncode(p))
  const displayString = displayParticipants.join(", ")
  const subject = item[0].tags.find((t) => t[0] === "subject")?.[1]
  const {
    theme: { colors },
  } = useTheme()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  return (
    <ListItem
      key={id}
      style={styles.item}
      containerStyle={styles.itemContainer}
      onPress={() =>
        navigation.navigate("messages", {
          userPubkey: userPubKey,
          participants,
          rumors: item,
        })
      }
    >
      {/* <Image
        source={{
          uri:
            item. ||
            "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }}
        style={styles.profilePicture}
      /> */}
      <ListItem.Content>
        <ListItem.Title style={styles.itemText}>
          {subject || displayString}
        </ListItem.Title>
      </ListItem.Content>
    </ListItem>
  )
}
