import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image } from "react-native"
import { UnsignedEvent, nip19, Event, SimplePool, SubCloser } from "nostr-tools"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { useEffect, useState } from "react"
import { useChatContext } from "./chatContext"
import { fetchNostrUsers } from "@app/utils/nostr"

interface HistoryListItemProps {
  item: string
  userPrivateKey: Uint8Array
}
export const HistoryListItem: React.FC<HistoryListItemProps> = ({
  item,
  userPrivateKey,
}) => {
  const [profileMap, setProfileMap] = useState<Map<string, NostrProfile>>()
  const { poolRef } = useChatContext()

  function handleProfileEvent(event: Event) {
    let profile = JSON.parse(event.content)
    setProfileMap((profileMap) => {
      let newProfileMap = profileMap || new Map<string, Object>()
      newProfileMap.set(event.pubkey, profile)
      return newProfileMap
    })
  }

  useEffect(() => {
    let closer: SubCloser | null = null
    if (poolRef?.current) {
      closer = fetchNostrUsers(item.split(","), poolRef?.current, handleProfileEvent)
    }

    return () => {
      if (closer) {
        closer.close()
      }
    }
  }, [item, poolRef])
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
                return (
                  (profileMap?.get(pubkey) as any)?.lud16 ||
                  nip19.npubEncode(pubkey).slice(0, 9) + ".."
                )
              })
              .join(", ")}
          </>
        </ListItem.Title>
      </ListItem.Content>
    </ListItem>
  )
}
