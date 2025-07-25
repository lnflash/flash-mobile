import React from "react"
import { View, StyleSheet, Text, Image, TouchableOpacity, ScrollView } from "react-native"
import { useTheme } from "@rneui/themed"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { useChatContext } from "./chatContext"
import { Header } from "@rneui/base"
import Icon from "react-native-vector-icons/Ionicons"
import ChatIcon from "@app/assets/icons/chat.svg"
import { nip19, getPublicKey } from "nostr-tools"
import { publicRelays } from "@app/utils/nostr"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { Screen } from "../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"

type ContactDetailsRouteProp = RouteProp<ChatStackParamList, "contactDetails">

const ContactDetailsScreen: React.FC = () => {
  const route = useRoute<ContactDetailsRouteProp>()
  const navigation =
    useNavigation<StackNavigationProp<ChatStackParamList, "contactDetails">>()
  const { theme } = useTheme()
  const colors = theme.colors
  const { profileMap, contactsEvent, poolRef, setContactsEvent } = useChatContext()
  const { LL } = useI18nContext()

  const { contactPubkey, userPrivateKey } = route.params

  const profile = profileMap?.get(contactPubkey)
  const npub = nip19.npubEncode(contactPubkey)

  const userPrivateKeyHex =
    typeof userPrivateKey === "string" ? userPrivateKey : bytesToHex(userPrivateKey)

  const userPubkey = getPublicKey(
    typeof userPrivateKey === "string" ? hexToBytes(userPrivateKey) : userPrivateKey,
  )

  const groupId = [userPubkey, contactPubkey].sort().join(",")

  const handleUnfollow = () => {
    if (!poolRef || !contactsEvent) return

    let profiles = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])
    let tagsWithoutProfiles = contactsEvent.tags.filter((p) => p[0] !== "p")
    let newProfiles = profiles.filter((p) => p !== contactPubkey)

    let newContactsEvent = {
      ...contactsEvent,
      tags: [...tagsWithoutProfiles, ...newProfiles.map((p) => ["p", p])],
    }
    poolRef.current.publish(publicRelays, newContactsEvent)
    setContactsEvent(newContactsEvent)
    navigation.goBack()
  }

  const handleSendPayment = () => {
    const lud16 = profile?.lud16 || ""
    navigation.navigate("sendBitcoinDestination", {
      username: lud16,
    })
  }

  const handleStartChat = () => {
    navigation.replace("messages", {
      groupId: groupId,
      userPrivateKey: userPrivateKeyHex,
    })
  }

  return (
    <Screen>
      <Header
        leftComponent={
          <Icon
            name="arrow-back"
            size={24}
            color={colors.black}
            onPress={() => navigation.goBack()}
          />
        }
        centerComponent={{
          text: LL.Nostr.Contacts.profile(),
          style: { color: colors.black, fontSize: 18 },
        }}
        backgroundColor={colors.background}
        containerStyle={styles.headerContainer}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.profileHeader}>
          <Image
            source={
              profile?.picture
                ? { uri: profile.picture }
                : {
                    uri: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwinaero.com%2Fblog%2Fwp-content%2Fuploads%2F2017%2F12%2FUser-icon-256-blue.png&f=1&nofb=1&ipt=d8f3a13e26633e5c7fb42aed4cd2ab50e1bb3d91cfead71975713af0d1ed278c",
                  }
            }
            style={styles.profileImage}
          />
          <Text style={[styles.profileName, { color: colors.black }]}>
            {profile?.name || profile?.username || LL.Nostr.Contacts.nostrUser()}
          </Text>
          {profile?.nip05 && <Text style={styles.nip05}>{profile.nip05}</Text>}
          <Text style={styles.npub}>
            {npub.slice(0, 8)}...{npub.slice(-4)}
          </Text>
          {profile?.about && <Text style={styles.aboutText}>{profile.about}</Text>}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.grey5 }]}
            onPress={handleStartChat}
          >
            <ChatIcon color={colors.primary} style={styles.actionIcon} fontSize={24} />
            <Text style={styles.actionText}>{LL.Nostr.Contacts.message()}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.grey5 }]}
            onPress={handleSendPayment}
          >
            <Icon name="flash" style={[styles.icon, { color: "orange" }]} />
            <Text style={styles.actionText}>{LL.Nostr.Contacts.sendPayment()}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>{LL.Nostr.Contacts.contactInfo()}</Text>
          {profile?.lud16 && (
            <View style={styles.infoRow}>
              <Icon name="flash-outline" style={styles.infoIcon} />
              <Text style={styles.infoText}>{profile.lud16}</Text>
            </View>
          )}
          {profile?.website && (
            <View style={styles.infoRow}>
              <Icon name="globe-outline" style={styles.infoIcon} />
              <Text style={styles.infoText}>{profile.website}</Text>
            </View>
          )}
        </View>

        <View style={styles.dangerZoneContainer}>
          <Text style={styles.dangerZoneTitle}>
            {LL.Nostr.Contacts.contactManagement()}
          </Text>
          <TouchableOpacity
            style={[styles.unfollowButton, { backgroundColor: colors.error }]}
            onPress={handleUnfollow}
          >
            <Icon name="remove-circle" style={[styles.icon, { color: "white" }]} />
            <Text style={[styles.actionText, { color: "white" }]}>
              {LL.Nostr.Contacts.unfollowContact()}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  headerContainer: {
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  nip05: {
    fontSize: 16,
    color: "#666",
    marginBottom: 4,
  },
  npub: {
    fontSize: 14,
    color: "#888",
    marginBottom: 16,
  },
  aboutText: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionIcon: {
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  infoSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#333",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoIcon: {
    fontSize: 20,
    color: "#666",
    marginRight: 12,
  },
  infoText: {
    fontSize: 16,
    color: "#333",
  },
  dangerZoneContainer: {
    padding: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginBottom: 24,
  },
  dangerZoneTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#333",
  },
  unfollowButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
})

export default ContactDetailsScreen
