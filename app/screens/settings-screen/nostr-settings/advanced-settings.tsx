import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { useStyles } from "./styles"
import Ionicons from "react-native-vector-icons/Ionicons"
import { useState } from "react"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getPublicKey, nip19 } from "nostr-tools"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { ImportNsecModal } from "@app/components/import-nsec/import-nsec-modal"
import { useChatContext } from "@app/screens/chat/chatContext"
import { KeyModal } from "./key-modal"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { createContactListEvent } from "@app/utils/nostr"

interface AdvancedSettingsProps {
  expandAdvanced: boolean
  secretKeyHex: string
  copyToClipboard: (text: string, onSuccess?: (copied: boolean) => void) => void
  onReconnect: () => Promise<void>
  accountLinked: boolean | null
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  expandAdvanced,
  secretKeyHex,
  copyToClipboard,
  onReconnect,
  accountLinked,
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const { LL } = useI18nContext()

  // Grab contactsEvent and pool from context
  const { resetChat, refreshUserProfile, contactsEvent, poolRef } = useChatContext()

  const [showSecretModal, setShowSecretModal] = useState(false)
  const [keysModalType, setKeysModalType] = useState<"public" | "private">("public")
  const [updatingNpub, setUpdatingNpub] = useState<boolean>(false)
  const [creatingContacts, setCreatingContacts] = useState<boolean>(false)
  const [importModalVisible, setImportModalVisible] = useState(false)

  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const { deleteNostrKeys } = useNostrProfile()
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "NostrSettingsScreen">>()

  const handleShowKeys = (type: "public" | "private") => {
    setKeysModalType(type)
    setShowSecretModal(true)
  }

  const handleReconnectNostr = async () => {
    if (!secretKeyHex) {
      Alert.alert(LL.Nostr.noProfileIdExists())
      return
    }
    const secretKey = hexToBytes(secretKeyHex)
    setUpdatingNpub(true)
    const data = await userUpdateNpub({
      variables: {
        input: {
          npub: nip19.npubEncode(getPublicKey(secretKey)),
        },
      },
    })
    await onReconnect()
    setUpdatingNpub(false)
    Alert.alert(LL.common.success(), LL.Nostr.profileReconnected())
  }

  const handleDeleteNostr = () => {
    Alert.alert(LL.Nostr.deleteWarningTitle(), LL.Nostr.deleteWarningMessage(), [
      { text: LL.common.cancel(), style: "cancel" },
      {
        text: LL.support.delete(),
        style: "destructive",
        onPress: async () => {
          await deleteNostrKeys()
          await refreshUserProfile()
          await resetChat()
          navigation.goBack()
        },
      },
    ])
  }

  const handleCreateContactList = () => {
    Alert.alert(
      LL.Nostr.Contacts.createContactList() || "Create Contact List?",
      "WARNING: We couldn't find an existing contact list. Creating a new one may overwrite any list found later on other relays and delete those connections.\n\nOnly proceed if you are sure this is a new account or you have no contacts.",
      [
        {
          text: LL.common.cancel(),
          style: "cancel",
        },
        {
          text: "Create & Overwrite",
          style: "destructive",
          onPress: async () => {
            try {
              setCreatingContacts(true)
              // Call your utility function
              console.log("Creating contact list")
              await createContactListEvent(hexToBytes(secretKeyHex))
              // Refresh the context to see the new list immediately
              Alert.alert(LL.common.success(), "Contact list created successfully.")
              await refreshUserProfile()
              setCreatingContacts(false)
            } catch (error) {
              console.error(error)
              Alert.alert(LL.common.error(), "Failed to create contact list.")
            } finally {
              setCreatingContacts(false)
            }
          },
        },
      ],
    )
  }

  // --- NEW: Create Contact List Logic ---

  const handleViewContacts = () => {
    // Navigate to the existing Contacts screen
    // Ensure "Contacts" is in your RootStackParamList
    // Pass userPrivateKey as string if the screen requires it
    navigation.navigate("Contacts", { userPrivateKey: secretKeyHex })
  }
  const contactSectionText = contactsEvent
    ? LL.Nostr.Contacts.manageContacts()
    : LL.Nostr.Contacts.createContactList()

  return (
    <View>
      {expandAdvanced && (
        <View style={styles.advancedContainer}>
          {/* Learn More */}
          <Pressable
            style={[styles.advancedMenuItem]}
            onPress={() =>
              Linking.openURL(
                "https://flash-docs-msp2z.ondigitalocean.app/en/guides/chat",
              )
            }
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="book-outline" size={24} color="#3366cc" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>{LL.Nostr.learnAboutNostr()}</Text>
              <Text style={styles.menuSubtext}>{LL.Nostr.learnAboutNostrSubtext()}</Text>
            </View>
            <Ionicons name="open-outline" size={24} color="#3366cc" />
          </Pressable>
          <Pressable
            style={styles.advancedMenuItem}
            onPress={contactsEvent ? handleViewContacts : handleCreateContactList}
          >
            <View style={styles.menuIconContainer}>
              {creatingContacts ? (
                <ActivityIndicator size="small" />
              ) : (
                <Ionicons
                  name={contactsEvent ? "people-outline" : "people-circle-outline"}
                  size={24}
                />
              )}
            </View>
            <Text style={styles.menuText}>{contactSectionText}</Text>
            {contactsEvent ? (
              <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
            ) : null}
          </Pressable>

          {/* Show Public Key */}
          <Pressable
            style={styles.advancedMenuItem}
            onPress={() => handleShowKeys("public")}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="key-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>{LL.Nostr.showPublicKey()}</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Show Private Key */}
          <Pressable
            style={styles.advancedMenuItem}
            onPress={() => handleShowKeys("private")}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="lock-closed-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>{LL.Nostr.showPrivateKey()}</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Reconnect Nostr Account */}
          <Pressable style={[styles.advancedMenuItem]} onPress={handleReconnectNostr}>
            <View style={styles.menuIconContainer}>
              {updatingNpub ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <Ionicons
                  name={accountLinked ? "checkmark-circle-outline" : "sync-outline"}
                  size={24}
                  color={accountLinked ? "green" : colors.black}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>
                {accountLinked
                  ? LL.Nostr.profileConnected()
                  : LL.Nostr.reconnectProfile()}
              </Text>
              {accountLinked && (
                <Text style={styles.menuSubtext}>
                  {LL.Nostr.tapToRefreshConnection()}
                </Text>
              )}
            </View>
          </Pressable>

          {/* Import Nostr Account */}
          <Pressable
            style={styles.advancedMenuItem}
            onPress={() => setImportModalVisible(true)}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="download-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>{LL.Nostr.importExistingProfile()}</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Delete Nostr Account */}
          <Pressable style={styles.advancedMenuItem} onPress={handleDeleteNostr}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="trash-outline" size={24} color="red" />
            </View>
            <Text style={[styles.menuText, { color: "red" }]}>
              {LL.Nostr.deleteProfile()}
            </Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>
        </View>
      )}
      <ImportNsecModal
        isActive={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onSubmit={() => {
          resetChat()
          setImportModalVisible(false)
          Alert.alert(LL.common.success(), LL.Nostr.profileImportedSuccessfully())
        }}
        descriptionText={LL.Nostr.importNsecDescription()}
      />
      <KeyModal
        isOpen={showSecretModal}
        secretKeyHex={secretKeyHex}
        onClose={() => setShowSecretModal(false)}
        copyToClipboard={copyToClipboard}
        keysModalType={keysModalType}
      />
    </View>
  )
}
