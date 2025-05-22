import {
  View,
  Alert,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
} from "react-native"
import { Button, makeStyles, Text, useTheme } from "@rneui/themed"
import { useEffect, useState, useRef } from "react"
import { getPublicKey, nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useNavigation } from "@react-navigation/native"
import { useHomeAuthedQuery, useUserUpdateNpubMutation } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { NsecInputForm } from "@app/components/import-nsec/import-nsec-form"
import { useChatContext } from "../nip17-chat/chatContext"
import Clipboard from "@react-native-clipboard/clipboard"
import { Screen } from "../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import ReactNativeModal from "react-native-modal"
import { useAppConfig } from "@app/hooks"
import { toastShow } from "@app/utils/toast"

export const NostrSettingsScreen = () => {
  const { LL } = useI18nContext()
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [updatingNpub, setUpdatingNpub] = useState<boolean>(false)
  const [expandAdvanced, setExpandAdvanced] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [showSecretModal, setShowSecretModal] = useState(false)
  const [keysModalType, setKeysModalType] = useState<"public" | "private">("public")
  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const {
    data: dataAuthed,
    loading: loadingAuthed,
    refetch,
  } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "network-only",
  })
  const [userUpdateNpub] = useUserUpdateNpubMutation()

  const { userProfileEvent } = useChatContext()
  let userProfile: NostrProfile | null = userProfileEvent
    ? JSON.parse(userProfileEvent.content)
    : null
  console.log("USER PROFILE IS", userProfile)
  useEffect(() => {
    const initialize = async () => {
      let secret
      if (!secretKey) {
        let secret = await getSecretKey()
        setSecretKey(secret)
      } else {
        secret = secretKey
      }
      if (secret && dataAuthed?.me?.npub === nip19.npubEncode(getPublicKey(secret))) {
        setLinked(true)
      } else {
        setLinked(false)
      }
    }
    initialize()
  }, [secretKey, dataAuthed])

  const { saveNewNostrKey, deleteNostrKeys } = useNostrProfile()
  let nostrPubKey = ""
  if (secretKey) {
    nostrPubKey = nip19.npubEncode(getPublicKey(secretKey as Uint8Array))
  }

  const {
    theme: { colors },
  } = useTheme()
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain },
    },
  } = useAppConfig()
  const [copiedNsec, setCopiedNsec] = useState(false)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [hideSecret, setHideSecret] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const { resetChat } = useChatContext()

  const copyToClipboard = (copyText: string, handler?: (copied: boolean) => void) => {
    Clipboard.setString(copyText)
    handler?.(true)
    setTimeout(() => {
      handler?.(false)
    }, 1000)
  }

  const navigation = useNavigation()

  const handleEditProfile = () => {
    navigation.navigate("EditNostrProfile")
  }

  const handleReconnectNostr = async () => {
    if (!secretKey) {
      Alert.alert("No Profile ID exists")
      return
    }
    setUpdatingNpub(true)
    const data = await userUpdateNpub({
      variables: {
        input: {
          npub: nip19.npubEncode(getPublicKey(secretKey)),
        },
      },
    })
    await refetch()
    setUpdatingNpub(false)
    Alert.alert("Success", "Your profile has been reconnected successfully")
  }

  const handleImportNostr = () => {
    setImportModalVisible(true)
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
            setSecretKey(null)
            setImportModalVisible(false)
          },
        },
      ],
    )
  }

  const handleShowKeys = (type: "public" | "private") => {
    setKeysModalType(type)
    setShowSecretModal(true)
  }

  const toggleAdvancedSettings = () => {
    setExpandAdvanced(!expandAdvanced)
  }

  const renderKeyModal = () => {
    const styles = useStyles()
    if (!secretKey) return null

    const isPublic = keysModalType === "public"
    const keyValue = isPublic
      ? nostrPubKey
      : hideSecret
      ? "***************"
      : nip19.nsecEncode(secretKey)

    return (
      <ReactNativeModal
        isVisible={showSecretModal}
        backdropColor={colors.grey5}
        backdropOpacity={0.7}
        onBackButtonPress={() => setShowSecretModal(false)}
        onBackdropPress={() => setShowSecretModal(false)}
      >
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {isPublic ? "Your Public Profile ID" : "Your Private Profile Key"}
          </Text>

          <View style={styles.keyContainer}>
            <Text>{keyValue}</Text>
          </View>

          <View style={styles.modalButtonsRow}>
            {!isPublic && (
              <Button onPress={() => setHideSecret(!hideSecret)}>
                <Text>{hideSecret ? "Show" : "Hide"}</Text>
              </Button>
            )}

            <Button
              onPress={() => {
                copyToClipboard(
                  isPublic ? nostrPubKey : nip19.nsecEncode(secretKey),
                  isPublic ? setCopiedNpub : setCopiedNsec,
                )
                Alert.alert("Copied", "Key copied to clipboard")
              }}
            >
              <Text style={styles.modalButtonText}>Copy</Text>
            </Button>

            <Button onPress={() => setShowSecretModal(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </Button>
          </View>
        </View>
      </ReactNativeModal>
    )
  }

  const renderImportModal = () => {
    return (
      <ReactNativeModal
        isVisible={importModalVisible}
        backdropColor={colors.grey5}
        backdropOpacity={0.7}
        onBackButtonPress={() => setImportModalVisible(false)}
        onBackdropPress={() => setImportModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Text>Import Profile</Text>
          <NsecInputForm
            onSubmit={(nsec, success) => {
              if (success) {
                resetChat()
                setSecretKey(nip19.decode(nsec).data as Uint8Array)
                setImportModalVisible(false)
                Alert.alert("Success", "Profile imported successfully")
              }
            }}
          />
          <Button onPress={() => setImportModalVisible(false)}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </ReactNativeModal>
    )
  }

  const renderContent = () => {
    if (!secretKey) {
      return (
        <View>
          <Text>No Profile Found</Text>
          <Pressable
            style={styles.generateButton}
            onPress={async () => {
              if (isGenerating) return
              setIsGenerating(true)
              let newSecret = await saveNewNostrKey()
              setSecretKey(newSecret)
              setIsGenerating(false)
            }}
            disabled={isGenerating}
          >
            <Ionicons
              name="person-add-outline"
              size={20}
              color={colors.black}
              style={{ opacity: isGenerating ? 0.5 : 1, marginRight: 10 }}
            />
            <Text>{isGenerating ? "Creating Profile..." : "Create New Profile"}</Text>
          </Pressable>
        </View>
      )
    }

    const profileText = dataAuthed?.me?.username
      ? `${dataAuthed.me.username}@${lnDomain}`
      : "Finding You.."

    return (
      <View style={styles.container}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileIcon}>
            <Image
              source={{
                uri:
                  userProfile?.picture ||
                  "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
              }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
              }}
            />

            {/* <Ionicons name="person-circle-outline" size={80} color={colors.grey3} /> */}
          </View>
          <TouchableOpacity
            onPress={() => {
              dataAuthed?.me?.username
                ? copyToClipboard(profileText, (copied) => {
                    toastShow({
                      message: "Copied",
                      type: "success",
                    })
                  })
                : null
            }}
            activeOpacity={0.7}
            style={styles.profileInfo}
          >
            <Text>{profileText}</Text>
          </TouchableOpacity>
        </View>

        {/* Main Menu Items */}
        <View style={styles.menuContainer}>
          {/* Edit Profile */}
          <Pressable style={styles.menuItem} onPress={handleEditProfile}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="person-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Advanced Settings Toggle */}
          <Pressable style={styles.menuItem} onPress={toggleAdvancedSettings}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="settings-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>Advanced Nostr Settings</Text>
            <Ionicons
              name={expandAdvanced ? "chevron-down" : "chevron-forward"}
              size={24}
              color={colors.grey3}
            />
          </Pressable>
        </View>

        {/* Advanced Settings */}
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
                    name={linked ? "checkmark-circle-outline" : "sync-outline"}
                    size={24}
                    color={linked ? "green" : colors.black}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuText}>
                  {linked ? "Profile Connected" : "Reconnect Profile"}
                </Text>
                {linked && (
                  <Text style={styles.menuSubtext}>Tap to refresh connection</Text>
                )}
              </View>
            </Pressable>

            {/* Import Nostr Account */}
            <Pressable style={styles.advancedMenuItem} onPress={handleImportNostr}>
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
      </View>
    )
  }

  return (
    <Screen preset="scroll" keyboardShouldPersistTaps="handled">
      {renderContent()}
      {renderKeyModal()}
      {renderImportModal()}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors, mode }) => ({
  container: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    marginBottom: 10,
  },
  profileIcon: {
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  menuContainer: {
    marginBottom: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  advancedContainer: {
    backgroundColor: colors.white,
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  advancedMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: colors.black,
  },
  menuSubtext: {
    fontSize: 12,
    color: colors.black,
  },
  nostrLearnCard: {
    backgroundColor:
      mode === "dark"
        ? `${colors.primary}25` // 15% opacity in dark mode
        : `${colors.primary}15`, // 10% opacity in light mode
  },
  nostrLearnIcon: {
    color: colors.primary,
  },
  profileCopyButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileText: {
    marginRight: 8,
  },
  profileCopyIcon: {
    color: colors.grey3,
  },
  generateButton: {
    backgroundColor: colors.grey5 + "40",
  },
  modalContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    maxHeight: "80%",
  },
  keyContainer: {
    backgroundColor: colors.grey5 + "30",
  },
  modalButton: {
    backgroundColor: colors.grey5 + "40",
  },
  modalButtonCancel: {
    backgroundColor: colors.grey5 + "60",
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
}))
