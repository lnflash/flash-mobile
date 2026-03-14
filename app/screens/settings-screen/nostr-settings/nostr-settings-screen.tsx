import { View, Pressable, ActivityIndicator } from "react-native"
import { Switch, Text, useTheme } from "@rneui/themed"
import { useCallback, useEffect, useState } from "react"
import { nip19 } from "nostr-tools"
import Ionicons from "react-native-vector-icons/Ionicons"
import { getSigner } from "@app/nostr/signer"
import useNostrProfile from "@app/hooks/use-nostr-profile"
import { setPreferredRelay } from "@app/utils/nostr"
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
import { ImportNsecModal } from "@app/components/import-nsec/import-nsec-modal"

const PROFILE_CREATION_STEPS = [
  "Creating Nostr profile...",
  "Generating profile picture...",
  "Generating banner image...",
  "Uploading profile picture...",
  "Uploading banner image...",
  "Publishing profile to relays...",
  "Profile created successfully!",
]

const ProfileCreationSteps: React.FC<{ currentMessage: string }> = ({
  currentMessage,
}) => {
  const {
    theme: { colors },
  } = useTheme()
  const currentIndex = PROFILE_CREATION_STEPS.indexOf(currentMessage)
  const allDone = currentMessage === "Profile created successfully!"

  return (
    <View style={{ alignSelf: "stretch", paddingHorizontal: 32, marginTop: 16 }}>
      {PROFILE_CREATION_STEPS.map((step, index) => {
        const isDone = allDone || index < currentIndex
        const isActive = !allDone && index === currentIndex

        return (
          <View
            key={step}
            style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}
          >
            <View style={{ width: 24, alignItems: "center" }}>
              {isDone ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              ) : isActive ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={colors.grey4} />
              )}
            </View>
            <Text
              style={{
                marginLeft: 12,
                fontSize: 14,
                color: isDone || isActive ? colors.black : colors.grey3,
                fontWeight: isActive ? "600" : "400",
              }}
            >
              {step}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

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

  const initialize = useCallback(async () => {
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
  }, [dataAuthed])

  useEffect(() => {
    initialize()
  }, [initialize])

  const { saveNewNostrKey, generateProfileImages } = useNostrProfile()
  const { refreshUserProfile, resetChat } = useChatContext()
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  useEffect(() => {
    if (userProfileEvent) {
      setIsLoadingProfile(false)
      return
    }
    const timer = setTimeout(() => setIsLoadingProfile(false), 3000)
    return () => clearTimeout(timer)
  }, [userProfileEvent])

  const {
    theme: { colors },
  } = useTheme()
  const [isGenerating, setIsGenerating] = useState(false)
  const [progressMessage, setProgressMessage] = useState("")
  const [showImportModal, setShowImportModal] = useState(false)

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
    // Conflict: backend has a registered npub but no local key was found on this device.
    // This can happen after reinstalling or switching devices.
    if (!nostrPubKey && dataAuthed?.me?.npub) {
      return (
        <View
          style={[
            styles.container,
            { flex: 1, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Ionicons name="warning-outline" size={80} color={colors.warning} />
          <Text
            style={{ fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 }}
          >
            {LL.Nostr.keyConflictTitle()}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.grey3,
              textAlign: "center",
              marginBottom: 20,
              paddingHorizontal: 24,
            }}
          >
            {LL.Nostr.keyConflictDescription()}
          </Text>
          {isGenerating ? (
            <ProfileCreationSteps currentMessage={progressMessage} />
          ) : (
            <>
              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: colors.black,
                  borderRadius: 16,
                  marginBottom: 12,
                }}
                onPress={() => setShowImportModal(true)}
              >
                <Ionicons
                  name="key-outline"
                  size={20}
                  color={colors.white}
                  style={{ marginRight: 10 }}
                />
                <Text style={{ color: colors.white, fontWeight: "bold" }}>
                  {LL.Nostr.importNsecTitle()}
                </Text>
              </Pressable>

              <Pressable
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: colors.black,
                  borderRadius: 16,
                }}
                onPress={async () => {
                  setIsGenerating(true)
                  setProgressMessage("Creating Nostr profile...")
                  await saveNewNostrKey(
                    (message) => setProgressMessage(message),
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
                  await initialize()
                }}
              >
                <Ionicons
                  name="person-add-outline"
                  size={20}
                  color={colors.white}
                  style={{ marginRight: 10 }}
                />
                <Text style={{ color: colors.white, fontWeight: "bold" }}>
                  {LL.Nostr.createNewProfile()}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      )
    }

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

          {isGenerating ? (
            <ProfileCreationSteps currentMessage={progressMessage} />
          ) : (
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
                setIsGenerating(true)
                setProgressMessage("Creating Nostr profile...")
                await saveNewNostrKey(
                  (message) => setProgressMessage(message),
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
                await initialize()
              }}
            >
              <Ionicons
                name="person-add-outline"
                size={20}
                color={colors.white}
                style={{ marginRight: 10 }}
              />
              <Text style={{ color: colors.white, fontWeight: "bold" }}>
                {LL.Nostr.createNewProfile()}
              </Text>
            </Pressable>
          )}
        </View>
      )
    }

    if (isLoadingProfile) {
      return (
        <View
          style={[
            styles.container,
            { flex: 1, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )
    }

    if (!userProfileEvent) {
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
              setProgressMessage("Creating profile...")
              try {
                const signer = await getSigner()
                await setPreferredRelay(signer)
                await generateProfileImages(
                  {
                    name: dataAuthed?.me?.username,
                    username: dataAuthed?.me?.username,
                    lud16: `${dataAuthed?.me?.username}@${lnDomain}`,
                    nip05: `${dataAuthed?.me?.username}@${lnDomain}`,
                  },
                  (msg) => setProgressMessage(msg),
                )
              } finally {
                setIsGenerating(false)
                setProgressMessage("")
                await resetChat()
                await initialize()
              }
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
                : LL.Nostr.generateProfile()}
            </Text>
          </Pressable>
          {nostrPubKey && !isGenerating && (
            <Text
              style={{
                marginTop: 16,
                fontSize: 11,
                color: colors.grey3,
                fontFamily: "monospace",
              }}
            >
              {nostrPubKey.slice(0, 12)}...{nostrPubKey.slice(-8)}
            </Text>
          )}
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
      <ImportNsecModal
        isActive={showImportModal}
        onCancel={() => setShowImportModal(false)}
        onSubmit={async () => {
          setShowImportModal(false)
          await resetChat()
          await initialize()
        }}
        descriptionText={LL.Nostr.importNsecDescription()}
      />
    </Screen>
  )
}
