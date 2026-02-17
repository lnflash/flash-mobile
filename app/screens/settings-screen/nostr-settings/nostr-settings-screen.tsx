import { View, Pressable } from "react-native"
import { Switch, Text, useTheme } from "@rneui/themed"
import { useEffect, useState } from "react"
import { nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSigner } from "@app/nostr/signer"
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
import { usePersistentStateContext } from "@app/store/persistent-state"
import { useAppConfig } from "@app/hooks/use-app-config"
import { ManualRepublishButton } from "./manual-republish-button"

export const NostrSettingsScreen = () => {
  const { LL } = useI18nContext()
  const [nostrPubKey, setNostrPubKey] = useState<string | null>(null)
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
    fetchPolicy: "cache-first",
    errorPolicy: "all",
    nextFetchPolicy: "cache-first",
  })

  const { userProfileEvent } = useChatContext()
  let userProfile: NostrProfile | null = userProfileEvent
    ? JSON.parse(userProfileEvent.content)
    : null
  console.log("USER PROFILE IS", userProfile)

  useEffect(() => {
    const initialize = async () => {
      try {
        const signer = await getSigner()
        const pubKey = await signer.getPublicKey()
        const npub = nip19.npubEncode(pubKey)
        setNostrPubKey(npub)
        if (dataAuthed?.me?.npub === npub) {
          setLinked(true)
        } else {
          setLinked(false)
        }
      } catch {
        setNostrPubKey(null)
        setLinked(false)
      }
    }
    initialize()
  }, [dataAuthed])

  const { saveNewNostrKey } = useNostrProfile()
  const { refreshUserProfile, resetChat } = useChatContext()

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
    if (!nostrPubKey) {
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
              await saveNewNostrKey(
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
              setIsGenerating(false)
              setProgressMessage("")
              await resetChat()
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
