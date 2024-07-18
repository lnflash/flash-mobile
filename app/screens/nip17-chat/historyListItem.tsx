import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image } from "react-native"
import { UnsignedEvent, nip19, Event } from "nostr-tools"
import { fetchNostrUsers } from "@app/utils/nostr"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { useEffect, useState } from "react"

interface HistoryListItemProps {
  item: string
  userPrivateKey: Uint8Array
}
export const HistoryListItem: React.FC<HistoryListItemProps> = ({
  item,
  userPrivateKey,
}) => {
  const [profileMap, setProfileMap] = useState<Map<string, Object>>()
  useEffect(() => {
    fetchNostrUsers(item.split(",")).then((profiles: Event[]) => {
      let profilesMap = new Map<string, Object>()
      profiles.forEach((profile) => {
        try {
          let content = JSON.parse(profile.content)
          profilesMap.set(profile.pubkey, content)
        } catch (e) {
          console.log("error parsing profile", profile.content)
          return
        }
      })
      setProfileMap(profilesMap)
    })
  }, [item])
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const navigation = useNavigation<StackNavigationProp<ChatStackParamList, "chatList">>()
  return (
    <ListItem
      key={item}
      style={styles.item}
      containerStyle={styles.itemContainer}
      onPress={() =>
        navigation.navigate("messages", {
          groupId: item,
          userPrivateKey,
        })
      }
    >
      {Array.from(profileMap?.values() || []).map((profile: any) => {
        return (
          <Image
            source={{
              uri:
                profile.picture ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
            }}
            style={styles.profilePicture}
          />
        )
      })}
      <ListItem.Content>
        <ListItem.Title style={styles.itemText}>
          <>
            {item
              .split(",")
              .map((pubkey) => {
                return (profileMap?.get(pubkey) as any)?.lud16 || pubkey
              })
              .join(", ")}
          </>
        </ListItem.Title>
      </ListItem.Content>
    </ListItem>
  )
}
