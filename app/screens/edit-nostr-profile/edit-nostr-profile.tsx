import React, { useEffect } from "react"
import { View, StyleSheet, ActivityIndicator } from "react-native"
import { useChatContext } from "../nip17-chat/chatContext"
import { EditProfileUI } from "./edit-profile-ui"

const EditNostrProfileScreen = () => {
  const { userProfileEvent, refreshUserProfile } = useChatContext()

  useEffect(() => {
    console.log("EDIT PROFILE SCREEN, USER EVENT?", userProfileEvent)
    if (!userProfileEvent) {
      refreshUserProfile()
    }
  }, [])

  if (!userProfileEvent) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <EditProfileUI profileEvent={userProfileEvent} />
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
  },
})

export default EditNostrProfileScreen
