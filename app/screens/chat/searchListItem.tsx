import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image, TouchableOpacity } from "react-native"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { getPublicKey, nip19 } from "nostr-tools"
import { bytesToHex } from "@noble/hashes/utils"
import { useChatContext } from "./chatContext"
import { addToContactList } from "@app/utils/nostr"
import Icon from "react-native-vector-icons/Ionicons"
import { getContactsFromEvent } from "./utils"
import { useState } from "react"
import { ActivityIndicator } from "react-native"

interface SearchListItemProps {
  item: Chat
  userPrivateKey: Uint8Array
}
export const SearchListItem: React.FC<SearchListItemProps> = ({
  item,
  userPrivateKey,
}) => {
  const { poolRef, contactsEvent } = useChatContext()
  const [isLoading, setIsLoading] = useState(false)

  const isUserAdded = () => {
    if (!contactsEvent) return false
    let existingContacts = getContactsFromEvent(contactsEvent)
    return existingContacts.map((p: NostrProfile) => p.pubkey).includes(item.id)
  }

  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()

  const getIcon = () => {
    let itemPubkey = item.groupId
      .split(",")
      .filter((p) => p !== getPublicKey(userPrivateKey))[0]
    if (contactsEvent)
      return getContactsFromEvent(contactsEvent).filter((c) => c.pubkey! === itemPubkey)
        .length === 0
        ? "person-add"
        : "checkmark-outline"
    else return "person-add"
  }

  const handleAddContact = async () => {
    if (isUserAdded() || !poolRef) return
    try {
      setIsLoading(true)
      await addToContactList(
        userPrivateKey,
        item.id,
        poolRef.current,
        () => Promise.resolve(true),
        contactsEvent,
      )
    } catch (error) {
      console.error("Error adding contact:", error)
    } finally {
      setIsLoading(false)
    }
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

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <TouchableOpacity onPress={handleAddContact}>
          <Icon name={getIcon()!} size={24} color={colors.primary} />
        </TouchableOpacity>
      )}
    </ListItem>
  )
}
