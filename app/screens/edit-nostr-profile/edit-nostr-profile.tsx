import React, { useEffect, useState } from "react"
import { View, StyleSheet, ActivityIndicator, Text, Pressable, Alert } from "react-native"
import { useChatContext } from "../nip17-chat/chatContext"
import { EditProfileUI } from "./edit-profile-ui"
import Ionicons from "react-native-vector-icons/Ionicons"
import { useTheme } from "@rneui/themed"
import { GaloyPrimaryButton } from "@app/components/atomic/galoy-primary-button"
import { GaloySecondaryButton } from "@app/components/atomic/galoy-secondary-button"

const EditNostrProfileScreen = () => {
  const { userProfileEvent, refreshUserProfile } = useChatContext()
  const [fallbackToEmpty, setFallbackToEmpty] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  const {
    theme: { colors },
  } = useTheme()

  const handleCreateProfileClick = () => {
    const pubkeyMessage = `We couldn't find a profile event attached to this pubkey.`

    Alert.alert(
      "Create Profile",
      `If you proceed, any existing profile data will be overwritten. ${pubkeyMessage} Do you want to continue to create?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
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
            <Text style={styles.infoText}>
              We’re looking, but we haven’t been able to find your profile.
            </Text>
            <Text style={[styles.infoText, { fontSize: 14 }]}>
              Would you like to create one now?
            </Text>

            <GaloySecondaryButton
              title={"Create Profile"}
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
