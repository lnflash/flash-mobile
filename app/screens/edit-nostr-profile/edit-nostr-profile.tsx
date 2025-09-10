import React, { useEffect, useState } from "react"
import { View, StyleSheet, ActivityIndicator, Text, Alert } from "react-native"
import { useChatContext } from "../chat/chatContext"
import { EditProfileUI } from "./edit-profile-ui"
import { useTheme } from "@rneui/themed"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"
import { useI18nContext } from "@app/i18n/i18n-react" // <- i18n context

const EditNostrProfileScreen = () => {
  const { LL } = useI18nContext() // <- use LL
  const { userProfileEvent, refreshUserProfile } = useChatContext()
  const [fallbackToEmpty, setFallbackToEmpty] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  const {
    theme: { colors },
  } = useTheme()

  const handleCreateProfileClick = () => {
    const pubkeyMessage = LL.Nostr.createProfilePubkeyMessage()

    Alert.alert(
      LL.Nostr.createProfileTitle(),
      `${LL.Nostr.createProfileWarning()} ${pubkeyMessage} ${LL.Nostr.createProfilePrompt()}`,
      [
        {
          text: LL.common.cancel(),
          style: "cancel",
        },
        {
          text: LL.common.ok(),
          onPress: () => {
            setFallbackToEmpty(true)
          },
        },
      ],
    )
  }

  useEffect(() => {
    if (!userProfileEvent && !fallbackToEmpty) {
      refreshUserProfile()

      // Delay showing the fallback UI by 2 seconds
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [userProfileEvent, fallbackToEmpty])

  if (!userProfileEvent && !fallbackToEmpty) {
    return (
      <View style={styles.loadingContainer}>
        {!showPrompt ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <ActivityIndicator size="large" />
            <Text style={styles.infoText}>{LL.Nostr.profileNotFound()}</Text>
            <Text style={[styles.infoText, { fontSize: 14 }]}>
              {LL.Nostr.promptToCreateProfile()}
            </Text>

            <GaloySecondaryButton
              title={LL.Nostr.createProfileButton()}
              onPress={handleCreateProfileClick}
              style={styles.createButton}
            />
          </>
        )}
      </View>
    )
  }

  const profileData = userProfileEvent

  return (
    <View style={styles.container}>
      <EditProfileUI profileEvent={profileData} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  infoText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 20,
    textAlign: "center",
  },
  createButton: {
    margin: 10,
  },
})

export default EditNostrProfileScreen
