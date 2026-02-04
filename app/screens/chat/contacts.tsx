import React, { useEffect, useState } from "react"
import { FlatList, Text, View, ActivityIndicator } from "react-native"
import { useStyles } from "./style"
import { useChatContext } from "./chatContext"
import { Event } from "nostr-tools"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"
import { useTheme } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList, RootStackParamList } from "@app/navigation/stack-param-lists"
import { UserSearchBar } from "./UserSearchBar"
import { SearchListItem } from "./searchListItem"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getContactsFromEvent } from "./utils"
import ContactCard from "./contactCard"
import { useI18nContext } from "@app/i18n/i18n-react"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"

// Route params type
type ContactsRouteProp = RouteProp<RootStackParamList, "Contacts">

interface ContactsProps {
  userPrivateKey?: string
}

const Contacts: React.FC<ContactsProps> = ({ userPrivateKey: propKey }) => {
  const baseStyles = useStyles()
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const { profileMap, contactsEvent, addEventToProfiles } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  const route = useRoute<ContactsRouteProp>()
  const { theme } = useTheme()
  const colors = theme.colors
  const { LL } = useI18nContext()

  const realUserKey = propKey || route.params?.userPrivateKey
  const [showAltMessage, setShowAltMessage] = useState(false)

  // Show alternative message if loading takes too long
  useEffect(() => {
    const timer = setTimeout(() => setShowAltMessage(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Fetch contacts once and subscribe for live updates
  useEffect(() => {
    if (!contactsEvent) return

    const contactPubkeys = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])
    const subKey = `contacts:${contactPubkeys.join(",")}`

    nostrRuntime.ensureSubscription(
      subKey,
      [{ kinds: [0], authors: contactPubkeys }],
      (event: Event) => {
        addEventToProfiles(event)
      },
    )
  }, [contactsEvent])

  // Safety check: if we still don't have a key
  if (!realUserKey) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const styles = {
    ...baseStyles,
    container: { flex: 1 },
    contactCardWrapper: {
      borderRadius: 8,
      marginBottom: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
  }

  const ListEmptyContent = (
    <View style={styles.activityIndicatorContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )

  const navigateToContactDetails = (contactPubkey: string) => {
    navigation.navigate("contactDetails", {
      contactPubkey,
      userPrivateKey: realUserKey,
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
              userPrivateKey={hexToBytes(realUserKey) as Uint8Array}
            />
          )}
          keyExtractor={(item) => item.id}
        />
      ) : contactsEvent ? (
        <FlatList
          contentContainerStyle={styles.listContainer}
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
