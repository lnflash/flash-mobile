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
  })

  let { updateNostrProfile } = useNostrProfile()
  const [isLoading, setIsLoading] = useState(true)
  const [isFormVisible, setIsFormVisible] = useState(false)
  const [updating, setUpdating] = useState(false)

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

    const timeoutId = setTimeout(() => {
      setIsLoading(false)
    }, 10000)

    return () => clearTimeout(timeoutId)
  }, [profileEvent])

  const handleInputChange = (field: keyof NostrProfile, value: string) => {
    setFormData({
      ...formData,
      [field]: value,
    })
  }

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
            setFormData({
              username: "",
              name: "",
              nip05: "",
              picture: "",
              lud16: "",
            })
            setIsFormVisible(true)
          },
        },
      ],
    )
  }

  const copyToClipboard = async () => {
    if (profileEvent?.pubkey) {
      await Clipboard.setString(profileEvent.pubkey)
      Alert.alert("Copied to Clipboard", "The pubkey has been copied to your clipboard.")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {isLoading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : isFormVisible ? (
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
            onSubmit={async () => {
              setUpdating(true)
              await updateNostrProfile({ content: formData })
              setUpdating(false)
            }}
          />
        </>
      ) : (
        <Button title="Create Profile" onPress={handleCreateProfileClick} />
      )}
    </ScrollView>
  )
}

interface ProfileFormProps {
  formData: NostrProfile
  handleInputChange: (field: keyof NostrProfile, value: string) => void
  updating: boolean
  onSubmit: () => void
}

const ProfileForm: React.FC<ProfileFormProps> = ({
  formData,
  handleInputChange,
  updating,
  onSubmit,
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

      <View style={styles.inputGroup}>
        <Text style={styles.label}>LUD-16</Text>
        <Input
          style={styles.input}
          placeholder="LUD-16"
          value={formData.lud16}
          onChangeText={(text) => handleInputChange("lud16", text)}
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
}))
