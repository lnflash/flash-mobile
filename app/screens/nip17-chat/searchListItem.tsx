import { ListItem, useTheme } from "@rneui/themed"
import { useStyles } from "./style"
import { Image } from "react-native"

interface SearchListItemProps {
  item: Chat
}
export const SearchListItem: React.FC<SearchListItemProps> = ({ item }) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  return (
    <ListItem
      key={item.id}
      style={styles.item}
      containerStyle={styles.itemContainer}
      //   onPress={() =>
      //     // navigation.navigate("chatDetail", {
      //     //   chat: { ...item, transactionsCount: 0 },
      //     //   giftwraps: giftwrapEvents || [],
      //     // })
      //   }
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
          {item.alias || item.username || item.name || item.lud16 || item.id}
        </ListItem.Title>
      </ListItem.Content>
    </ListItem>
  )
}
