import { ActivityIndicator, Alert, Linking, Pressable, View } from "react-native"
import { Button, Text, useTheme } from "@rneui/themed"
import { useStyles } from "./styles"
import Ionicons from "react-native-vector-icons/Ionicons"
import { useState } from "react"
import ReactNativeModal from "react-native-modal"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { getPublicKey, nip19 } from "nostr-tools"
import { useUserUpdateNpubMutation } from "@app/graphql/generated"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { ImportNsecModal } from "@app/components/import-nsec/import-nsec-modal"
import { useChatContext } from "@app/screens/nip17-chat/chatContext"
import { KeyModal } from "./key-modal"

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

  const { resetChat } = useChatContext()

  const [showSecretModal, setShowSecretModal] = useState(false)
  const [keysModalType, setKeysModalType] = useState<"public" | "private">("public")
  const [updatingNpub, setUpdatingNpub] = useState<boolean>(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [userUpdateNpub] = useUserUpdateNpubMutation()
  const { deleteNostrKeys } = useNostrProfile()

  const handleShowKeys = (type: "public" | "private") => {
    setKeysModalType(type)
    setShowSecretModal(true)
  }

  const handleReconnectNostr = async () => {
    if (!secretKeyHex) {
      Alert.alert("No Profile ID exists")
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
    Alert.alert("Success", "Your profile has been reconnected successfully")
  }

  const handleDeleteNostr = () => {
    Alert.alert(
      "Warning",
      "Deleting your profile keys will remove your account from this device. Without a backup, you won't be able to access this profile again. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteNostrKeys()
          },
        },
      ],
    )
  }

  return (
    <View>
      {expandAdvanced && (
        <View style={styles.advancedContainer}>
          {/* Show Public Key */}
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
              <Text style={styles.menuText}>Learn about Nostr</Text>
              <Text style={styles.menuSubtext}>
                Explore this guide to get the most out of nostr chat
              </Text>
            </View>
            <Ionicons name="open-outline" size={24} color="#3366cc" />
          </Pressable>
          <Pressable
            style={styles.advancedMenuItem}
            onPress={() => handleShowKeys("public")}
          >
            <View style={styles.menuIconContainer}>
              <Ionicons name="key-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>Show public key</Text>
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
            <Text style={styles.menuText}>Show private key</Text>
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
                {accountLinked ? "Profile Connected" : "Reconnect Profile"}
              </Text>
              {accountLinked && (
                <Text style={styles.menuSubtext}>Tap to refresh connection</Text>
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
            <Text style={styles.menuText}>Import existing profile</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Delete Nostr Account */}
          <Pressable style={styles.advancedMenuItem} onPress={handleDeleteNostr}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="trash-outline" size={24} color="red" />
            </View>
            <Text style={[styles.menuText, { color: "red" }]}>Delete profile</Text>
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
          Alert.alert("Success", "Profile imported successfully")
        }}
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
