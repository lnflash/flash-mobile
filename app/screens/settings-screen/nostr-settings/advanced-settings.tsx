import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { useStyles } from "./styles"
import Ionicons from "react-native-vector-icons/Ionicons"
import { useState } from "react"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { ImportNsecModal } from "@app/components/import-nsec/import-nsec-modal"
import { useChatContext } from "@app/screens/chat/chatContext"
import { KeyModal } from "./key-modal"
import { useNavigation } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useI18nContext } from "@app/i18n/i18n-react"
import { createContactListEvent } from "@app/utils/nostr"
import { getSigner } from "@app/nostr/signer"
import { reconnectLocalNpub } from "@app/nostr/reconnect-npub"
import { relinkRefusedMessage } from "@app/nostr/relink-refused-message"

interface AdvancedSettingsProps {
  expandAdvanced: boolean
  copyToClipboard: (text: string, onSuccess?: (copied: boolean) => void) => void
  onReconnect: () => Promise<void>
  accountLinked: boolean | null
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  expandAdvanced,
  copyToClipboard,
  onReconnect,
  accountLinked,
}) => {
  const styles = useStyles()
  const {
    theme: { colors },
  } = useTheme()
  const { LL } = useI18nContext()

  const { resetChat, refreshUserProfile, contactsEvent } = useChatContext()

  const [showSecretModal, setShowSecretModal] = useState(false)
  const [keysModalType, setKeysModalType] = useState<"public" | "private">("public")
  const [updatingNpub, setUpdatingNpub] = useState<boolean>(false)
  const [creatingContacts, setCreatingContacts] = useState<boolean>(false)
  const [importModalVisible, setImportModalVisible] = useState(false)

  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const isAuthed = useIsAuthed()
  const { data: dataAuthed } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "cache-first",
    errorPolicy: "all",
  })
  const { deleteNostrKeys } = useNostrProfile()
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList, "NostrSettingsScreen">>()

  const handleShowKeys = (type: "public" | "private") => {
    setKeysModalType(type)
    setShowSecretModal(true)
  }

  const handleReconnectNostr = async () => {
    setUpdatingNpub(true)
    try {
      const result = await reconnectLocalNpub(
        (npub) => userUpdateNpub({ variables: { input: { npub } } }),
        dataAuthed?.me?.id,
      )
      if (result.status === "no-key") {
        Alert.alert(LL.Nostr.noProfileIdExists())
        return
      }
      await onReconnect()
      if (result.status === "refused") {
        // Typically NPUB_NOT_AVAILABLE: another account holds this key.
        // Retrying gives the same answer, so do not report success. Unless
        // this account owns the key, it may be another account's only copy:
        // never advise deleting it then. Without an owner record, do not
        // claim the holder is on this phone either.
        console.warn("Backend refused to reconnect local npub:", result.code)
        Alert.alert(LL.common.error(), relinkRefusedMessage(LL, result.keyOwner))
        return
      }
      Alert.alert(LL.common.success(), LL.Nostr.profileReconnected())
    } catch (e) {
      // `reconnectLocalNpub` propagates a rejected mutation (offline is the
      // very state `keyMismatchRelinkFailed` sends people here from) and a
      // throwing signer; the screen owns the alert.
      console.error("Reconnect npub failed:", e)
      Alert.alert(LL.common.error(), LL.Nostr.keyMismatchRelinkFailed())
    } finally {
      setUpdatingNpub(false)
    }
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
              console.log("Creating contact list")
              const signer = await getSigner()
              await createContactListEvent(signer)
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

  const handleViewContacts = () => {
    navigation.navigate("Contacts")
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
              Linking.openURL("https://documentation.getflash.io/en/guides/chat")
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
        onClose={() => setShowSecretModal(false)}
        copyToClipboard={copyToClipboard}
        keysModalType={keysModalType}
      />
    </View>
  )
}
