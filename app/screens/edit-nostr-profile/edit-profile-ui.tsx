import useNostrProfile from "@app/hooks/use-nostr-profile"
import { useTheme, makeStyles, Button, Input } from "@rneui/themed"
import { Event, nip19 } from "nostr-tools"
import React, { useState, useEffect } from "react"
import {
  View,
  Alert,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Clipboard,
  ScrollView,
} from "react-native"
import { Image } from "react-native"

type NostrProfile = {
  pubkey?: string
  username?: string
  name?: string
  nip05?: string
  picture?: string
  lud16?: string
  about?: string
  website?: string
}

interface EditProfileUIProps {
  profileEvent: Event | null
}

export const EditProfileUI: React.FC<EditProfileUIProps> = ({ profileEvent }) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const [formData, setFormData] = useState<NostrProfile>({
    username: "",
    name: "",
    nip05: "",
    picture: "",
    lud16: "",
    about: "",
    website: "",
  })

  let { updateNostrProfile, generateProfileImages } = useNostrProfile()
  const [isFormVisible, setIsFormVisible] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [generatingImages, setGeneratingImages] = useState(false)
  const [imageProgressMessage, setImageProgressMessage] = useState("")

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
        setIsFormVisible(true)
      } catch (error) {
        console.error("Error parsing content:", error)
      }
    }
  }, [profileEvent])

  const handleInputChange = (field: keyof NostrProfile, value: string) => {
    setFormData({
      ...formData,
      [field]: value,
    })
  }

  const copyToClipboard = async () => {
    if (profileEvent?.pubkey) {
      await Clipboard.setString(profileEvent.pubkey)
      Alert.alert("Copied to Clipboard", "The pubkey has been copied to your clipboard.")
    }
  }

  const handleGenerateImages = async () => {
    try {
      setGeneratingImages(true)
      setImageProgressMessage("Starting image generation...")

      const result = await generateProfileImages(formData, (message) => {
        setImageProgressMessage(message)
      })

      if (result) {
        // Update form data with generated image URLs
        setFormData({
          ...formData,
          picture: result.picture || formData.picture,
        })
        Alert.alert("Success!", "Profile picture and banner generated successfully!")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate images"
      Alert.alert("Error", message)
    } finally {
      setGeneratingImages(false)
      setImageProgressMessage("")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <>
        {profileEvent?.pubkey && (
          <TouchableOpacity onPress={copyToClipboard}>
            <View style={styles.pubkeyContainer}>
              <Text style={styles.pubkeyText}>
                {profileEvent?.pubkey ? nip19.npubEncode(profileEvent.pubkey) : null}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <ProfileForm
          formData={formData}
          handleInputChange={handleInputChange}
          updating={updating}
          generatingImages={generatingImages}
          imageProgressMessage={imageProgressMessage}
          onSubmit={async () => {
            setUpdating(true)
            await updateNostrProfile({ content: formData })
            setUpdating(false)
          }}
          onGenerateImages={handleGenerateImages}
        />
      </>
    </ScrollView>
  )
}

interface ProfileFormProps {
  formData: NostrProfile
  handleInputChange: (field: keyof NostrProfile, value: string) => void
  updating: boolean
  generatingImages: boolean
  imageProgressMessage: string
  onSubmit: () => void
  onGenerateImages: () => void
}

const ProfileForm: React.FC<ProfileFormProps> = ({
  formData,
  handleInputChange,
  updating,
  generatingImages,
  imageProgressMessage,
  onSubmit,
  onGenerateImages,
}) => {
  const styles = useStyles()
  const { theme } = useTheme()

  return (
    <View style={styles.formContainer}>
      <Image
        source={{
          uri:
            formData.picture ||
            "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }}
        style={styles.profileImage}
        resizeMode="cover"
      />
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Username</Text>
        <Input
          style={styles.input}
          placeholder="Username"
          value={formData.username}
          onChangeText={(text) => handleInputChange("username", text)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Name</Text>
        <Input
          style={styles.input}
          placeholder="Name"
          value={formData.name}
          onChangeText={(text) => handleInputChange("name", text)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>NIP-05</Text>
        <Input
          style={styles.input}
          placeholder="NIP-05"
          value={formData.nip05}
          onChangeText={(text) => handleInputChange("nip05", text)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Picture URL</Text>
        <Input
          style={styles.input}
          placeholder="Picture URL"
          value={formData.picture}
          onChangeText={(text) => handleInputChange("picture", text)}
        />
      </View>

      {/* Generate Images Button */}
      <View style={styles.inputGroup}>
        {generatingImages ? (
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.generatingText}>{imageProgressMessage}</Text>
          </View>
        ) : (
          <Button
            title="Generate Profile Images"
            onPress={onGenerateImages}
            type="outline"
            containerStyle={styles.generateButton}
            icon={{
              name: "image",
              type: "ionicon",
              size: 18,
              color: theme.colors.primary,
            }}
          />
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>LUD-16</Text>
        <Input
          style={styles.input}
          placeholder="LUD-16"
          value={formData.lud16}
          onChangeText={(text) => handleInputChange("lud16", text)}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Website</Text>
        <Input
          style={styles.input}
          placeholder="Website"
          value={formData.website}
          onChangeText={(text) => handleInputChange("website", text)}
        />
      </View>

      {updating ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : (
        <Button
          title="Save Changes"
          onPress={onSubmit}
          color={theme.colors.primary}
          containerStyle={styles.saveButton}
        />
      )}
    </View>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  saveButton: {
    marginBottom: 30,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: "center",
    marginBottom: 15,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  pubkeyContainer: {
    backgroundColor: colors.grey4,
    borderRadius: 10,
    marginBottom: 20,
    padding: 10,
    justifyContent: "center",
  },
  pubkeyText: {
    fontSize: 16,
    color: colors.primary3,
  },
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 15,
    width: "100%",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 5,
    marginLeft: 5,
  },
  input: {
    width: "100%",
  },
  generateButton: {
    marginBottom: 10,
  },
  generatingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: colors.grey5,
    borderRadius: 8,
  },
  generatingText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.grey1,
  },
}))
