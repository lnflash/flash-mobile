// Contacts.tsx
import React, { useEffect, useRef, useState } from "react"
import { FlatList, Text, View, Image, ActivityIndicator } from "react-native"
import { useStyles } from "../style" // Adjust the path as needed
import { useChatContext } from "../chat/chatContext"
import { nip19, Event, finalizeEvent } from "nostr-tools"
import { useNavigation } from "@react-navigation/native"
import { ListItem, useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import ChatIcon from "@app/assets/icons/chat.svg"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"
import { UserSearchBar } from "../search-bar/UserSearchBar"
import { SearchListItem } from "../search-bar/searchListItem"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getContactsFromEvent } from "../utils"
import ContactCard from "./contactCard"
import { Swipeable } from "react-native-gesture-handler"
import { customPublish, fetchNostrUsers, publicRelays } from "@app/utils/nostr"
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

  const handleUnfollow = (contactPubkey: string) => {
    if (!poolRef || !contactsEvent) return
    console.log("unfollowing pubkey", contactPubkey)
    let tagsWithoutProfile = contactsEvent.tags.filter(
      (p) => p[0] === "p" && p[1] !== contactPubkey,
    )
    let newCreatedAt = Math.floor(new Date().getTime() / 1000)
    let newContactsEvent: Event = {
      ...contactsEvent,
      id: "",
      sig: "",
      created_at: newCreatedAt,
      tags: [...tagsWithoutProfile],
    }
    let finalEvent = finalizeEvent(newContactsEvent, hexToBytes(userPrivateKey))
    console.log(
      "Old Contacts event vs NewContacts Event",
      contactPubkey,
      contactsEvent,
      newContactsEvent,
    )
    customPublish(publicRelays, finalEvent)
    console.log("Published!")
  }

  const swipeableRefs = useRef<Map<string, React.RefObject<Swipeable>>>(new Map())

  // Handle ellipses press (trigger swipe action)
  const handleEllipsesPress = (pubkey: string) => {
    const swipeable = swipeableRefs.current.get(pubkey)
    console.log("GOT SWIPEABLE", swipeable, pubkey)
    if (swipeable) {
      swipeable.current?.openRight() // Trigger the swipe to reveal actions
    }
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
          renderItem={({ item }) => {
            if (!swipeableRefs.current.has(item.pubkey)) {
              swipeableRefs.current.set(item.pubkey, React.createRef())
            }

            return (
              <Swipeable
                renderRightActions={() => renderRightActions(item)}
                containerStyle={styles.itemContainer}
                ref={swipeableRefs.current.get(item.pubkey)!}
              >
                <ContactCard
                  item={item}
                  profileMap={profileMap}
                  containerStyle={styles.itemContainer}
                  style={styles.item}
                  onEllipsesPress={() => handleEllipsesPress(item.pubkey!)} // Trigger swipe on ellipses click
                />
              </Swipeable>
            )
          }}
          keyExtractor={(item) => item.pubkey!}
        />
      ) : (
        <Text>Loading...</Text>
      )}
    </View>
  )
}

export default Contacts
