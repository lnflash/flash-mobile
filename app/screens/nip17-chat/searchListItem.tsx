import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { getPublicKey, nip19 } from "nostr-tools"
import { bytesToHex } from "@noble/hashes/utils"
import { useChatContext } from "./chatContext"
import { addToContactList } from "@app/utils/nostr"
import Icon from "react-native-vector-icons/Ionicons"

interface SearchListItemProps {
  item: Chat
  userPrivateKey: Uint8Array
}
export const SearchListItem: React.FC<SearchListItemProps> = ({
  item,
  userPrivateKey,
}) => {
  const { poolRef, contacts } = useChatContext()
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const tabNavigation = useNavigation()

  const getIcon = () => {
    let itemPubkey = item.groupId
      .split(",")
      .filter((p) => p !== getPublicKey(userPrivateKey))[0]
    console.log(
      "item pubkey is",
      itemPubkey,
      contacts.filter((c) => c.pubkey! === itemPubkey).length,
      contacts,
    )
    return contacts.filter((c) => c.pubkey! === itemPubkey).length === 0
      ? "person-add"
      : "checkmark-outline"
  }
  return (
    <ListItem
      key={item.id}
      style={styles.item}
      containerStyle={styles.itemContainer}
      onPress={() => {
        navigation.navigate("messages", {
          groupId: item.groupId,
          userPrivateKey: bytesToHex(userPrivateKey),
        })
      }}
    >
      <Image
        source={{
          uri:
            item.picture ||
            "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }}
        style={styles.profilePicture}
      />
      <ListItem.Content>
        <ListItem.Title style={styles.itemText}>
          {item.alias ||
            item.username ||
            item.name ||
            item.lud16 ||
            nip19.npubEncode(item.id)}
        </ListItem.Title>
      </ListItem.Content>
      <Icon
        name={getIcon()}
        size={24}
        color={colors.primary}
        onPress={() => {
          if (!poolRef) return
          addToContactList(userPrivateKey, item.id, poolRef.current)
          console.log("Add contact pressed for", item)
          setTimeout(() => tabNavigation.navigate("Contacts"), 500)
        }}
      />
    </ListItem>
  )
}
