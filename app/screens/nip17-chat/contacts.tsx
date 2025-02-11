// Contacts.tsx
import React, { useState } from "react"
import { FlatList, Text, View, Image, ActivityIndicator } from "react-native"
import { useStyles } from "./style" // Adjust the path as needed
import { useChatContext } from "./chatContext"
import { nip19 } from "nostr-tools"
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

interface ContactsProps {
  userPrivateKey: string
}

const Contacts: React.FC<ContactsProps> = ({ userPrivateKey }) => {
  const styles = useStyles()
  const [searchedUsers, setSearchedUsers] = useState<Chat[]>([])
  const { poolRef, profileMap, contactsEvent } = useChatContext()
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
  let ListEmptyContent = (
    <View style={styles.activityIndicatorContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
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
          contentContainerStyle={styles.listContainer}
          data={getContactsFromEvent(contactsEvent)}
          ListEmptyComponent={<Text>No Contacts Available</Text>}
          renderItem={({ item }) => (
            <ListItem style={styles.item} containerStyle={styles.itemContainer}>
              <Image
                source={{
                  uri:
                    profileMap?.get(item.pubkey!)?.picture ||
                    "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
                }}
                style={styles.profilePicture}
                key={item.pubkey!}
              />
              <ListItem.Content
                key="heading"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <ListItem.Subtitle style={styles.itemText} key="subheading">
                  <Text
                    style={{
                      color: colors.primary3,
                    }}
                  >
                    {" "}
                    {getContactMetadata(item)}
                  </Text>
                </ListItem.Subtitle>
              </ListItem.Content>
              <ChatIcon
                color={colors.primary}
                onPress={() =>
                  navigation.navigate("messages", {
                    groupId: item.pubkey!,
                    userPrivateKey,
                  })
                }
              />
              <GaloyIconButton
                name={"lightning"}
                size="medium"
                style={{ margin: 5 }}
                onPress={() => {
                  navigation.navigate("sendBitcoinDestination", {
                    username: profileMap?.get(item.pubkey!)?.lud16 || "",
                  })
                }}
                key="lightning-button"
              />
            </ListItem>
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
