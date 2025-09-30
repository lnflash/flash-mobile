// ContactCard.tsx
import React from "react"
import { Image, Text, View } from "react-native"
import { ListItem } from "@rneui/themed"
import { useTheme } from "@rneui/themed"
import { nip19 } from "nostr-tools"
import { GaloyIconButton } from "@app/components/atomic/galoy-icon-button"
import ChatIcon from "@app/assets/icons/chat.svg"
import { hexToBytes } from "@noble/curves/abstract/utils"

interface ContactCardProps {
  item: any
  profileMap?: Map<string, NostrProfile>
  style?: Object
  containerStyle?: Object
  onPress: () => void
}

const ContactCard: React.FC<ContactCardProps> = ({
  item,
  profileMap,
  style,
  containerStyle,
  onPress,
}) => {
  const { theme } = useTheme()
  const colors = theme.colors

  const getContactMetadata = (contact: any) => {
    let profile = profileMap?.get(contact.pubkey || "")
    return (
      profile?.nip05 ||
      profile?.name ||
      profile?.username ||
      nip19.npubEncode(contact.pubkey!).slice(0, 9) + ".."
    )
  }

  return (
    <ListItem style={style} containerStyle={containerStyle} onPress={onPress}>
      <Image
        source={{
          uri:
            profileMap?.get(item.pubkey!)?.picture ||
            "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }}
        style={{ width: 40, height: 40, borderRadius: 40 / 2 }}
      />
      <ListItem.Content
        style={{ display: "flex", flexDirection: "row", justifyContent: "space-between" }}
      >
        <ListItem.Subtitle style={{ fontSize: 16, marginTop: 5, marginBottom: 5 }}>
          <Text style={{ color: colors.primary3 }}>{getContactMetadata(item)}</Text>
        </ListItem.Subtitle>
      </ListItem.Content>
    </ListItem>
  )
}

export default ContactCard
