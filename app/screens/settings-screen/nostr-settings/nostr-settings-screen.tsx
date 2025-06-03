import { View, Pressable } from "react-native"
import { Text, useTheme } from "@rneui/themed"
import { useEffect, useState } from "react"
import { getPublicKey, nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useNavigation } from "@react-navigation/native"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useChatContext } from "../../nip17-chat/chatContext"
import Clipboard from "@react-native-clipboard/clipboard"
import { Screen } from "../../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useStyles } from "./styles"
import { ProfileHeader } from "./profile-header"
import { AdvancedSettings } from "./advanced-settings"
import { bytesToHex } from "@noble/curves/abstract/utils"

export const NostrSettingsScreen = () => {
  const { LL } = useI18nContext()
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [expandAdvanced, setExpandAdvanced] = useState(false)

  const isAuthed = useIsAuthed()
  const styles = useStyles()
  const { data: dataAuthed, refetch } = useHomeAuthedQuery({
    skip: !isAuthed,
    fetchPolicy: "network-only",
    errorPolicy: "all",
    nextFetchPolicy: "network-only",
  })

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
  const [isGenerating, setIsGenerating] = useState(false)

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

  const toggleAdvancedSettings = () => {
    setExpandAdvanced(!expandAdvanced)
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

    return (
      <View style={styles.container}>
        {/* Profile Header */}
        <ProfileHeader userProfile={userProfile} copyToClipboard={copyToClipboard} />

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
          <AdvancedSettings
            expandAdvanced={expandAdvanced}
            secretKeyHex={bytesToHex(secretKey)}
            onReconnect={async () => {
              await refetch()
            }}
            copyToClipboard={copyToClipboard}
            accountLinked={linked}
          />
        </View>
      </View>
    )
  }

  return (
    <Screen preset="scroll" keyboardShouldPersistTaps="handled">
      {renderContent()}
    </Screen>
  )
}
