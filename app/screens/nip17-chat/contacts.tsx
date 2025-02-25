// Contacts.tsx
import React, { useEffect, useState } from "react"
import { FlatList, Text, View, Image, ActivityIndicator } from "react-native"
import { useStyles } from "./style" // Adjust the path as needed
import { useChatContext } from "./chatContext"
import { nip19, Event } from "nostr-tools"
import { useNavigation } from "@react-navigation/native"
import { ListItem, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import ChatIcon from "@app/assets/icons/chat.svg"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"
import { UserSearchBar } from "./UserSearchBar"
import { SearchListItem } from "./searchListItem"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getContactsFromEvent } from "./utils"
import ContactCard from "./contactCard"
import { Swipeable } from "react-native-gesture-handler"
import { fetchNostrUsers, publicRelays } from "@app/utils/nostr"
import Icon from "react-native-vector-icons/Ionicons"
import { bytesToHex } from "@noble/hashes/utils"

interface ContactsProps {
  userPrivateKey: string
}

const Contacts: React.FC<ContactsProps> = ({ userPrivateKey }) => {
  const styles = useStyles()
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const { poolRef, profileMap, contactsEvent, addEventToProfiles } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const { theme } = useTheme()
  const colors = theme.colors

  const getContactMetadata = (contact: NostrProfile) => {
    let profile = profileMap?.get(contact.pubkey || "")
    return (
      profile?.nip05 ||
      profile?.name ||
      profile?.username ||
      nip19.npubEncode(contact.pubkey!).slice(0, 9) + ".."
    )
  }

  const handleUnfollow = (contactPubkey: string) => {
    if (!poolRef || !contactsEvent) return
    console.log("unfollowing pubkey", contactPubkey)
    let profiles = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])
    let tagsWithoutProfiles = contactsEvent.tags.filter((p) => p[0] !== "p")
    let newProfiles = profiles.filter((p) => p[1] !== contactPubkey)
    let newContactsEvent: Event = {
      ...contactsEvent,
      tags: [...tagsWithoutProfiles, newProfiles],
    }
    console.log(
      "Old Contacts event vs NewContacts Event",
      contactPubkey,
      contactsEvent,
      newContactsEvent,
    )
    poolRef.current.publish(publicRelays, newContactsEvent)
  }

  useEffect(() => {
    if (!poolRef) return
    let contactPubkeys =
      contactsEvent?.tags.filter((p) => p[0] === "p").map((p) => p[1]) || []
    let closer = fetchNostrUsers(contactPubkeys, poolRef.current, (event: Event) => {
      addEventToProfiles(event)
    })
    return () => {
      if (closer) closer.close()
    }
  }, [poolRef, contactsEvent])

  let ListEmptyContent = (
    <View style={styles.activityIndicatorContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )

  const renderRightActions = (item: { pubkey: string }) => {
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "center",
          backgroundColor: colors.grey4,
        }}
      >
        <Icon
          name="remove-circle"
          style={{ margin: 5, fontSize: 20, color: "red" }}
          onPress={() => {
            handleUnfollow(item.pubkey)
          }}
        />
        <Icon
          name="flash"
          style={{ margin: 5, fontSize: 20, color: "orange" }}
          onPress={() => {
            navigation.navigate("sendBitcoinDestination", {
              username: profileMap?.get(item.pubkey)?.lud16 || "",
            })
          }}
        />
        <ChatIcon
          color={colors.primary}
          onPress={() => {
            navigation.navigate("messages", {
              groupId: item.pubkey,
              userPrivateKey: userPrivateKey,
            })
          }}
          style={{ margin: 10 }}
          fontSize={20}
        />
      </View>
    )
  }
  return (
    <View>
      <UserSearchBar setSearchedUsers={setSearchedUsers} />
      {searchedUsers.length !== 0 ? (
        <FlatList
          contentContainerStyle={styles.listContainer}
          data={searchedUsers}
          ListEmptyComponent={ListEmptyContent}
          renderItem={({ item }) => (
            <SearchListItem
              item={item}
              userPrivateKey={hexToBytes(userPrivateKey) as Uint8Array}
            />
          )}
          keyExtractor={(item) => item.id}
        />
      ) : contactsEvent ? (
        <FlatList
          contentContainerStyle={{ ...styles.listContainer, margin: 20 }}
          data={getContactsFromEvent(contactsEvent)}
          ListEmptyComponent={<Text>No Contacts Available</Text>}
          renderItem={({ item }) => (
            <Swipeable
              renderRightActions={() => renderRightActions(item)}
              containerStyle={styles.itemContainer}
            >
              <ContactCard
                item={item}
                profileMap={profileMap}
                containerStyle={styles.itemContainer}
                style={styles.item}
              />
            </Swipeable>
          )}
          keyExtractor={(item) => item.pubkey!}
        />
      ) : (
        <Text>Loading...</Text>
      )}
    </View>
  )
}

export default Contacts
