import useNostrProfile from "@app/hooks/use-nostr-profile"
import { Event } from "nostr-tools"
import React, { useState, useEffect } from "react"
import {
  View,
  TextInput,
  Button,
  Alert,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Clipboard,
  StyleSheet,
} from "react-native"

type NostrProfile = {
  pubkey?: string
  username?: string
  name?: string
  nip05?: string
  picture?: string
  lud16?: string
}

interface EditProfileUIProps {
  profileEvent: Event | null
}

export const EditProfileUI: React.FC<EditProfileUIProps> = ({ profileEvent }) => {
  // State to hold form data
  const [formData, setFormData] = useState<NostrProfile>({
    username: "",
    name: "",
    nip05: "",
    picture: "",
    lud16: "",
  })

  let { updateNostrProfile } = useNostrProfile()
  // State to track loading state
  const [isLoading, setIsLoading] = useState(true)

  // State to track whether to show the form after confirmation
  const [isFormVisible, setIsFormVisible] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Prefill the form if profileEvent is present
  useEffect(() => {
    if (profileEvent?.content) {
      try {
        const parsedContent = JSON.parse(profileEvent.content)
        setFormData({
          username: parsedContent.username ?? "",
          name: parsedContent.name ?? "",
          nip05: parsedContent.nip05 ?? "",
          picture: parsedContent.picture ?? "",
          lud16: parsedContent.lud16 ?? "",
        })
        setIsFormVisible(true) // Show form if profileEvent is present
      } catch (error) {
        console.error("Error parsing content:", error)
      }
    }

    // Simulate loading for 10 seconds
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
    }, 10000) // 10 seconds

    // Clean up timeout on unmount
    return () => clearTimeout(timeoutId)
  }, [profileEvent])

  // Handle input changes
  const handleInputChange = (field: keyof NostrProfile, value: string) => {
    setFormData({
      ...formData,
      [field]: value,
    })
  }

  // Handle the "Create Profile" button click
  const handleCreateProfileClick = () => {
    const pubkeyMessage = profileEvent
      ? `Profile data will be overwritten.`
      : `We couldn't find a Nostr account attached to this pubkey.`

    Alert.alert(
      "Create Profile",
      `If you proceed, any existing profile data will be overwritten. ${pubkeyMessage} Do you want to continue?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            // Clear the form data to start fresh
            setFormData({
              username: "",
              name: "",
              nip05: "",
              picture: "",
              lud16: "",
            })
            setIsFormVisible(true) // Show the form after confirmation
          },
        },
      ],
    )
  }

  // Function to copy the pubkey to the clipboard
  const copyToClipboard = async () => {
    if (profileEvent?.pubkey) {
      await Clipboard.setString(profileEvent.pubkey)
      Alert.alert("Copied to Clipboard", "The pubkey has been copied to your clipboard.")
    }
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        // Show loading spinner for 10 seconds if profileEvent is null
        <ActivityIndicator size="large" color="#0000ff" />
      ) : isFormVisible ? (
        // Show form (either prefilled or empty) after the user confirms creating a profile
        <>
          <Text style={styles.title}>Profile Information</Text>

          {/* Touchable pubkey */}
          {profileEvent?.pubkey && (
            <TouchableOpacity onPress={copyToClipboard}>
              <Text style={styles.pubkeyText}>{profileEvent.pubkey}</Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={styles.input}
            placeholder="Username"
            value={formData.username}
            onChangeText={(text) => handleInputChange("username", text)}
          />
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={formData.name}
            onChangeText={(text) => handleInputChange("name", text)}
          />
          <TextInput
            style={styles.input}
            placeholder="NIP-05"
            value={formData.nip05}
            onChangeText={(text) => handleInputChange("nip05", text)}
          />
          <TextInput
            style={styles.input}
            placeholder="Picture URL"
            value={formData.picture}
            onChangeText={(text) => handleInputChange("picture", text)}
          />
          <TextInput
            style={styles.input}
            placeholder="LUD-16"
            value={formData.lud16}
            onChangeText={(text) => handleInputChange("lud16", text)}
          />

          {updating ? (
            // Show loading spinner when updating
            <ActivityIndicator size="large" color="#0000ff" />
          ) : (
            // Show "Save Changes" button when not updating
            <Button
              title="Save Changes"
              onPress={async () => {
                setUpdating(true)
                await updateNostrProfile({ content: formData })
                setUpdating(false)
              }}
            />
          )}
        </>
      ) : (
        // Show "Create Profile" button if profileEvent is null after loading
        <Button title="Create Profile" onPress={handleCreateProfileClick} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    padding: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  pubkeyText: {
    fontSize: 16,
    color: "#3498db",
    marginBottom: 20,
    textDecorationLine: "underline",
  },
})
