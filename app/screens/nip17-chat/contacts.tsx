// Contacts.tsx
import React, { useEffect, useState } from "react"
import { FlatList, Text, View, ActivityIndicator } from "react-native"
import { useStyles } from "./style" // Adjust the path as needed
import { useChatContext } from "./chatContext"
import { nip19, Event } from "nostr-tools"
import { useNavigation } from "@react-navigation/native"
import { useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { UserSearchBar } from "./UserSearchBar"
import { SearchListItem } from "./searchListItem"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getContactsFromEvent } from "./utils"
import ContactCard from "./contactCard"
import { fetchNostrUsers } from "@app/utils/nostr"
import { useI18nContext } from "@app/i18n/i18n-react"

interface ContactsProps {
  userPrivateKey: string
}

const Contacts: React.FC<ContactsProps> = ({ userPrivateKey }) => {
  const baseStyles = useStyles()
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const { poolRef, profileMap, contactsEvent, addEventToProfiles } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const { theme } = useTheme()
  const { LL } = useI18nContext()
  const colors = theme.colors

  // State to toggle spinner size & message after 3 seconds
  const [showAltMessage, setShowAltMessage] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowAltMessage(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

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

  // Merge the base styles with additional styles
  const styles = {
    ...baseStyles,
    container: {
      flex: 1,
    },
    contactCardWrapper: {
      backgroundColor: "white",
      borderRadius: 8,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
  }

  let ListEmptyContent = (
    <View style={styles.activityIndicatorContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )

  const navigateToContactDetails = (contactPubkey: string) => {
    navigation.navigate("contactDetails", {
      contactPubkey,
      userPrivateKey,
    })
  }

  return (
    <View style={styles.container}>
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
          contentContainerStyle={{ ...styles.listContainer }}
          data={getContactsFromEvent(contactsEvent)}
          ListEmptyComponent={<Text>{LL.Nostr.Contacts.noCantacts()}</Text>}
          renderItem={({ item }) => (
            <ContactCard
              item={item}
              profileMap={profileMap}
              containerStyle={styles.itemContainer}
              style={styles.item}
              onPress={() => navigateToContactDetails(item.pubkey)}
            />
          )}
          keyExtractor={(item) => item.pubkey!}
        />
      ) : (
        <View style={styles.activityIndicatorContainer}>
          {showAltMessage ? (
            <>
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={{ transform: [{ scale: 0.7 }] }}
              />
              <Text style={{ margin: 10, textAlign: "center" }}>
                {LL.Nostr.Contacts.stillLoading()}
              </Text>
            </>
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
      )}
    </View>
  )
}

export default Contacts
