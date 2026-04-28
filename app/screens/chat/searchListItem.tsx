import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image, TouchableOpacity, View, StyleSheet } from "react-native"
import { useNavigation, CommonActions } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { nip19 } from "nostr-tools"
import { useChatContext } from "./chatContext"
import { addToContactList } from "@app/utils/nostr"
import Icon from "react-native-vector-icons/Ionicons"
import { getContactsFromEvent } from "./utils"
import { useState } from "react"
import { ActivityIndicator } from "react-native"
import { getSigner } from "@app/nostr/signer"

// Featured profile detection
import { isFeaturedPubkey } from "@app/utils/featured-profile"
import { logFeaturedProfileSelected } from "@app/utils/analytics"

interface SearchListItemProps {
  item: Chat
}
export const SearchListItem: React.FC<SearchListItemProps> = ({ item }) => {
  const { contactsEvent, userPublicKey } = useChatContext()
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

  // Is this the featured profile?
  const isFeaturedProfile = isFeaturedPubkey(item.id)

  const getIcon = () => {
    const itemPubkey = item.groupId
      .split(",")
      .filter((p) => p !== userPublicKey)[0]
    if (contactsEvent)
      return getContactsFromEvent(contactsEvent).filter((c) => c.pubkey! === itemPubkey)
        .length === 0
        ? "person-add"
        : "checkmark-outline"
    else return "person-add"
  }

  const handleAddContact = async () => {
    if (isUserAdded()) return
    try {
      setIsLoading(true)
      const signer = await getSigner()
      await addToContactList(
        signer,
        item.id,
        () => Promise.resolve(true),
        contactsEvent,
      )
    } catch (error) {
      console.error("Error adding contact:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePress = () => {
    if (isFeaturedProfile) {
      logFeaturedProfileSelected({ discoveryMethod: "search" })
      // FeaturedProfileView is registered on the root navigator — dispatch upward
      // so the chat stack's typing stays intact for the normal messages flow.
      navigation.getParent()?.dispatch(
        CommonActions.navigate({
          name: "FeaturedProfileView",
          params: { entryPoint: "search" },
        }),
      )
      return
    }
    navigation.navigate("messages", {
      groupId: item.groupId,
    })
  }

  const avatarUri =
    item.picture ||
    "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg"

  return (
    <ListItem
      key={item.id}
      style={styles.item}
      containerStyle={[
        styles.itemContainer,
        isFeaturedProfile && localStyles.featuredItemContainer,
      ]}
      onPress={handlePress}
    >
      {isFeaturedProfile ? (
        <View style={localStyles.avatarContainer}>
          <Image source={{ uri: avatarUri }} style={styles.profilePicture} />
          <View style={localStyles.featuredBadge}>
            <Icon name="key" size={12} color="#000" />
          </View>
        </View>
      ) : (
        <Image source={{ uri: avatarUri }} style={styles.profilePicture} />
      )}
      <ListItem.Content>
        <ListItem.Title
          style={[styles.itemText, isFeaturedProfile && localStyles.featuredItemText]}
        >
          {item.alias ||
            item.username ||
            item.name ||
            item.lud16 ||
            nip19.npubEncode(item.id)}
        </ListItem.Title>
      </ListItem.Content>

      {isFeaturedProfile ? (
        <Icon name="arrow-forward" size={24} color="#FFD700" />
      ) : isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <TouchableOpacity onPress={handleAddContact}>
          <Icon name={getIcon()!} size={24} color={colors.primary} />
        </TouchableOpacity>
      )}
    </ListItem>
  )
}

const localStyles = StyleSheet.create({
  avatarContainer: {
    position: "relative",
  },
  featuredItemContainer: {
    borderLeftWidth: 3,
    borderLeftColor: "#FFD700",
  },
  featuredItemText: {
    fontWeight: "600",
  },
  featuredBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#FFD700",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
})
