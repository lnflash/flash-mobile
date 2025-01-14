// Contacts.tsx
import React, { useState } from "react"
import { Alert, FlatList, Text, View } from "react-native"
import { useStyles } from "./style" // Adjust the path as needed
import { bytesToHex } from "@noble/hashes/utils"
import { fetchContactList, fetchSecretFromLocalStorage } from "@app/utils/nostr"
import { useChatContext } from "./chatContext"
import { getPublicKey, nip19 } from "nostr-tools"
import { useFocusEffect, useNavigation } from "@react-navigation/native"
import { ListItem } from "@rneui/themed"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"

interface ContactsProps {
  userPrivateKey: string
}

const Contacts: React.FC<ContactsProps> = ({ userPrivateKey }) => {
  const styles = useStyles()
  const [contacts, setContacts] = useState<NostrProfile[]>([])
  const [initialized, setInitialized] = useState(false)
  const { poolRef } = useChatContext()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  useFocusEffect(
    React.useCallback(() => {
      async function initialize() {
        console.log("Initializing contacts")
        let secretKeyString = await fetchSecretFromLocalStorage()
        if (!secretKeyString) {
          Alert.alert("Secret Key Not Found in Storage")
          return
        }
        let secret = nip19.decode(secretKeyString).data as Uint8Array
        let newContacts =
          (await fetchContactList(getPublicKey(secret), poolRef!.current))?.tags
            .filter((t: string[]) => t[0] === "p")
            .map((t: string[]) => {
              return { pubkey: t[1] }
            }) || []
        console.log("contacts are", newContacts)
        setContacts([...contacts, ...newContacts])
        setInitialized(true)
      }
      if (poolRef && !initialized) {
        initialize()
      }
    }, []),
  )
  return (
    <View>
      <Text>Contacts: {contacts.join(", ")}</Text>
      <FlatList
        contentContainerStyle={styles.listContainer}
        data={contacts}
        ListEmptyComponent={<Text>No Contacts Available</Text>}
        renderItem={({ item }) => (
          <ListItem
            style={styles.item}
            containerStyle={styles.itemContainer}
            onPress={() =>
              navigation.navigate("messages", {
                groupId: item.pubkey!,
                userPrivateKey,
              })
            }
          >
            <ListItem.Content key="heading">
              <ListItem.Subtitle style={styles.itemText} key="subheading">
                <Text
                  style={{
                    color: "white",
                  }}
                >
                  {" "}
                  {item.username || nip19.npubEncode(item.pubkey!)}
                </Text>
              </ListItem.Subtitle>
            </ListItem.Content>
          </ListItem>
        )}
        keyExtractor={(item) => item.pubkey!}
      />
    </View>
  )
}

export default Contacts
