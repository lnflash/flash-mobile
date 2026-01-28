import { View, Pressable } from "react-native"
import { Switch, Text, useTheme } from "@rneui/themed"
import { useEffect, useState } from "react"
import { getPublicKey, nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSecretKey } from "@app/utils/nostr"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useNavigation } from "@react-navigation/native"
import { useHomeAuthedQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import { useChatContext } from "../../chat/chatContext"
import Clipboard from "@react-native-clipboard/clipboard"
import { Screen } from "../../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useStyles } from "./styles"
import { ProfileHeader } from "./profile-header"
import { AdvancedSettings } from "./advanced-settings"
import { bytesToHex } from "@noble/curves/abstract/utils"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useAppConfig } from "@app/hooks/use-app-config"
import { ManualRepublishButton } from "./manual-republish-button"

export const NostrSettingsScreen = () => {
  const { LL } = useI18nContext()
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null)
  const [linked, setLinked] = useState<boolean | null>(null)
  const [expandAdvanced, setExpandAdvanced] = useState(false)

  const { persistentState, updateState } = usePersistentStateContext()
  const {
    appConfig: {
      galoyInstance: { lnAddressHostname: lnDomain },
    },
  } = useAppConfig()

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
        secret = await getSecretKey()
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

  const { saveNewNostrKey } = useNostrProfile()
  let nostrPubKey = ""
  if (secretKey) {
    nostrPubKey = nip19.npubEncode(getPublicKey(secretKey as Uint8Array))
  }

  const {
    theme: { colors },
  } = useTheme()
  const [isGenerating, setIsGenerating] = useState(false)
  const [progressMessage, setProgressMessage] = useState("")

  const copyToClipboard = (copyText: string, handler?: (copied: boolean) => void) => {
    Clipboard.setString(copyText)
    handler?.(true)
  }

  const navigation = useNavigation()

  const handleEditProfile = () => {
    navigation.navigate("EditNostrProfile")
  }

  const toggleAdvancedSettings = () => {
    setExpandAdvanced(!expandAdvanced)
  }

  const renderEmptyContent = () => {
    if (!secretKey) {
      return (
        <View
          style={[
            styles.container,
            { flex: 1, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Ionicons name="person-circle-outline" size={80} color={colors.grey3} />
          <Text
            style={{ fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 }}
          >
            {LL.Nostr.noProfileFound()}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.grey3,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            {LL.Nostr.noProfileDescription()}
          </Text>

          <Pressable
            style={[
              styles.generateButton,
              {
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: colors.black,
                borderRadius: 16,
              },
            ]}
            onPress={async () => {
              if (isGenerating) return
              setIsGenerating(true)
              setProgressMessage("Creating Nostr profile...")
              let newSecret = await saveNewNostrKey(
                (message) => {
                  setProgressMessage(message)
                },
                {
                  name: dataAuthed?.me?.username,
                  username: dataAuthed?.me?.username,
                  lud16: `${dataAuthed?.me?.username}@${lnDomain}`,
                  nip05: `${dataAuthed?.me?.username}@${lnDomain}`,
                },
              )
              setSecretKey(newSecret)
              setIsGenerating(false)
              setProgressMessage("")
            }}
            disabled={isGenerating}
          >
            <Ionicons
              name="person-add-outline"
              size={20}
              color={colors.white}
              style={{ marginRight: 10, opacity: isGenerating ? 0.5 : 1 }}
            />
            <Text style={{ color: colors.white, fontWeight: "bold" }}>
              {isGenerating
                ? progressMessage || LL.Nostr.creatingProfile()
                : LL.Nostr.createNewProfile()}
            </Text>
          </Pressable>
        </View>
      )
    }

    return (
      <View style={styles.container}>
        {/* Profile Header */}
        <ProfileHeader userProfile={userProfile} copyToClipboard={copyToClipboard} />

        {/* Manual Republish Button - DEBUG TOOL */}
        {true ? null : (
          <ManualRepublishButton
            username={dataAuthed?.me?.username}
            lnDomain={lnDomain}
            onSuccess={() => {
              refetch()
              console.log("Profile republished successfully")
            }}
          />
        )}

        {/* Main Menu Items */}
        <View style={styles.menuContainer}>
          {/* Edit Profile */}
          <Pressable style={styles.menuItem} onPress={handleEditProfile}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="person-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>{LL.Nostr.editProfile()}</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.grey3} />
          </Pressable>

          {/* Advanced Settings Toggle */}
          <Pressable style={styles.menuItem} onPress={toggleAdvancedSettings}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="settings-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>{LL.Nostr.advancedSettings()}</Text>
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
          <View style={styles.menuItem}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="chatbubbles-outline" size={24} color={colors.black} />
            </View>
            <Text style={styles.menuText}>Enable Chat</Text>
            <Switch
              value={!!persistentState.chatEnabled}
              onValueChange={(enabled) => {
                updateState((state: any) => {
                  if (state)
                    return {
                      ...state,
                      chatEnabled: enabled,
                    }
                  return undefined
                })
              }}
            />
          </View>
        </View>
      </View>
    )
  }

  return (
    <Screen preset="scroll" keyboardShouldPersistTaps="handled">
      {renderEmptyContent()}
    </Screen>
  )
}
