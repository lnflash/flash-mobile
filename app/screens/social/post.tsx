import React, { useState } from "react"
import {
  View,
  TextInput,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  ScrollView,
  Alert,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native"
import { Text, useTheme, makeStyles } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { launchImageLibrary, launchCamera } from "react-native-image-picker"
import { StackNavigationProp } from "@react-navigation/stack"
import { RootStackParamList } from "@app/navigation/stack-param-lists"
import { useNavigation } from "@react-navigation/native"
import { PrimaryBtn } from "@app/components/buttons"
import { useI18nContext } from "@app/i18n/i18n-react"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { ExplainerVideo } from "@app/components/explainer-video"

import { nip19 } from "nostr-tools"
import { pool } from "@app/utils/nostr/pool"
import { publishEventToRelays, getPublishingRelays } from "@app/utils/nostr/publish-helpers"
import { getSigner } from "@app/nostr/signer"

// Get appropriate relays for note publishing
const RELAYS = getPublishingRelays("note")

type MakeNostrPostNavigationProp = StackNavigationProp<
  RootStackParamList,
  "makeNostrPost"
>

const FIXED_TEXT_LINE =
  "This is your first post using Flash! For only your first post, we add this to the end: \n\n"
const FIXED_TEXT_LINE_2 = "#introductions"
const FIXED_TEXT_LINE_3 =
  "If you would like to remove the Flash credit from this post, uncheck the box below."

const MakeNostrPost = ({ privateKey }: { privateKey: string }) => {
  const styles = useStyles()
  const navigation = useNavigation<MakeNostrPostNavigationProp>()
  const { theme } = useTheme()
  const { LL } = useI18nContext()
  const { persistentState, updateState } = usePersistentStateContext()
  const [userText, setUserText] = useState("")
  const [inputHeight, setInputHeight] = useState(40)
  const [loading, setLoading] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [includeFlashCredit, setIncludeFlashCredit] = useState(true)

  const FIXED_TEXT_LINE_1 = LL.Social.flashAppCredit()
  const isFirstPost = !persistentState.hasPostedToNostr

  const onContentSizeChange = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => {
    setInputHeight(event.nativeEvent.contentSize.height)
  }

  // Generate NIP-98 auth header
  const generateNIP98AuthHeader = async (
    url: string,
    method: string,
  ): Promise<string> => {
    try {
      const signer = await getSigner()

      const authEvent = {
        kind: 27235, // NIP-98 HTTP Auth
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["u", url],
          ["method", method],
        ],
        content: "",
      }

      const signedAuthEvent = await signer.signEvent(authEvent)
      const encodedAuth = btoa(JSON.stringify(signedAuthEvent))
      return `Nostr ${encodedAuth}`
    } catch (error) {
      console.error("Error generating NIP-98 auth:", error)
      throw error
    }
  }

  // Upload media to nostr.build with NIP-98 authentication
  const uploadMediaToNostrBuild = async (
    mediaUri: string,
    isVideo: boolean = false,
  ): Promise<string | null> => {
    try {
      console.log("Uploading media to nostr.build:", mediaUri, "isVideo:", isVideo)

      const uploadUrl = "https://nostr.build/api/v2/upload/files"
      const authHeader = await generateNIP98AuthHeader(uploadUrl, "POST")

      const formData = new FormData()
      formData.append("file", {
        uri: mediaUri,
        type: isVideo ? "video/mp4" : "image/jpeg",
        name: isVideo ? "video.mp4" : "photo.jpg",
      } as any)

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: authHeader,
        },
      })

      console.log("Upload response status:", response.status)
      const data = await response.json()
      console.log("Upload response data:", JSON.stringify(data, null, 2))

      if (data.status === "success" && data.data && data.data.length > 0) {
        // nostr.build API v2 returns an array of objects with url property
        const uploadedUrl = data.data[0].url
        console.log("Extracted URL:", uploadedUrl)
        return uploadedUrl
      }

      console.log("Upload failed: no URL found in response")
      return null
    } catch (error) {
      console.error("Error uploading media:", error)
      Alert.alert("Upload Error", "Failed to upload media. Please try again.")
      return null
    }
  }

  const handleAddImage = () => {
    launchImageLibrary(
      {
        mediaType: "photo",
        selectionLimit: 4,
        quality: 0.8,
      },
      async (response) => {
        if (response.didCancel) {
          return
        }
        if (response.errorCode) {
          Alert.alert("Error", response.errorMessage || "Failed to select image")
          return
        }
        if (response.assets && response.assets.length > 0) {
          const uris = response.assets
            .map((asset) => asset.uri)
            .filter(Boolean) as string[]
          setSelectedImages(uris)
        }
      },
    )
  }

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRecordVideo = () => {
    launchCamera(
      {
        mediaType: "video",
        videoQuality: "medium",
        durationLimit: 60, // 60 seconds max
      },
      async (response) => {
        if (response.didCancel) {
          return
        }
        if (response.errorCode) {
          Alert.alert("Error", response.errorMessage || "Failed to record video")
          return
        }
        if (response.assets && response.assets.length > 0 && response.assets[0].uri) {
          setSelectedVideo(response.assets[0].uri)
          // Clear images when video is selected
          setSelectedImages([])
        }
      },
    )
  }

  const handleRemoveVideo = () => {
    setSelectedVideo(null)
  }

  const handleTakePicture = () => {
    launchCamera(
      {
        mediaType: "photo",
        quality: 0.8,
        saveToPhotos: false,
      },
      async (response) => {
        if (response.didCancel) {
          return
        }
        if (response.errorCode) {
          Alert.alert("Error", response.errorMessage || "Failed to take picture")
          return
        }
        if (response.assets && response.assets.length > 0 && response.assets[0].uri) {
          // Clear video if any
          setSelectedVideo(null)
        }
      },
    )
  }

  // Extract hashtags from content and create t tags
  const extractHashtags = (content: string): string[] => {
    // Match hashtags: #word including at start of string, after space, or after newline
    // But not inside URLs
    const hashtags = new Set<string>()
    const regex = /(^|\s)#([a-zA-Z0-9_]+)/g
    let match
    while ((match = regex.exec(content)) !== null) {
      // Add the hashtag without the # symbol, converted to lowercase
      hashtags.add(match[2].toLowerCase())
    }
    return Array.from(hashtags)
  }

  const publishNostrNote = async (content: string) => {
    try {
      setLoading(true)
      const signer = await getSigner()

      let finalContent = content

      // Upload media if any are selected
      if (selectedImages.length > 0 || selectedVideo) {
        setUploadingImages(true)
        try {
          const uploadedUrls: string[] = []

          console.log(
            "Starting media upload. Images:",
            selectedImages.length,
            "Video:",
            !!selectedVideo,
          )

          // Upload images
          for (const imageUri of selectedImages) {
            console.log("Uploading image:", imageUri)
            const url = await uploadMediaToNostrBuild(imageUri, false)
            if (url) {
              console.log("Image uploaded successfully:", url)
              uploadedUrls.push(url)
            } else {
              console.log("Image upload failed")
            }
          }

          // Upload video
          if (selectedVideo) {
            console.log("Uploading video:", selectedVideo)
            const url = await uploadMediaToNostrBuild(selectedVideo, true)
            if (url) {
              console.log("Video uploaded successfully:", url)
              uploadedUrls.push(url)
            } else {
              console.log("Video upload failed")
            }
          }

          console.log("Total uploaded URLs:", uploadedUrls.length)
          if (uploadedUrls.length > 0) {
            finalContent = content + "\n\n" + uploadedUrls.join("\n")
            console.log("Final content with media:", finalContent)
          } else if (selectedImages.length > 0 || selectedVideo) {
            // Only show alert if we actually tried to upload media
            Alert.alert("Upload Failed", "Media upload failed. Posting without media.")
          }
        } catch (uploadError) {
          console.error("Error during media upload:", uploadError)
          Alert.alert("Upload Error", "Failed to upload media. Posting without media.")
        } finally {
          setUploadingImages(false)
        }
      }

      const pubkey = await signer.getPublicKey()

      // Extract hashtags and create t tags
      const hashtags = extractHashtags(finalContent)
      const tags: string[][] = hashtags.map((tag) => ["t", tag])

      console.log("Extracted hashtags:", hashtags)
      console.log("Created tags:", tags)

      const event = {
        kind: 1, // kind 1 = short text note
        created_at: Math.floor(Date.now() / 1000),
        tags: tags,
        content: finalContent,
      }

      const signedEvent = await signer.signEvent(event)

      console.log("Publishing kind-1 note to relays...")
      console.log("Author pubkey:", pubkey)
      console.log("Event ID:", signedEvent.id)

      // Use the new helper for reliable publishing
      const publishResult = await publishEventToRelays(
        pool,
        signedEvent,
        RELAYS,
        "Note (kind-1)",
      )

      if (publishResult.successCount === 0) {
        throw new Error("Failed to publish note to any relay")
      }

      console.log(
        `✅ Note successfully published to ${publishResult.successCount}/${RELAYS.length} relays`,
      )

      // Mark that user has posted to Nostr
      updateState((state: any) => {
        if (state) {
          return {
            ...state,
            hasPostedToNostr: true,
          }
        }
        return undefined
      })

      // Navigate to success screen
      const npub = nip19.npubEncode(pubkey)
      navigation.replace("postSuccess", {
        postContent: finalContent,
        userNpub: npub,
        event: signedEvent,
      })
    } catch (e) {
      console.error("Error posting Nostr note:", e)
      Alert.alert(LL.Social.errorPostFailed())
      setLoading(false)
    }
  }

  const onPost = async () => {
    if (loading) {
      console.log("Already posting, ignoring duplicate press")
      return
    }

    // Only add #introductions hashtag on first post and if checkbox is checked
    const shouldIncludeCredit = isFirstPost && includeFlashCredit
    const finalText = shouldIncludeCredit
      ? `${userText}\n\n${FIXED_TEXT_LINE_1}\n${FIXED_TEXT_LINE_2}`
      : `${userText}`

    if (!finalText.trim()) {
      Alert.alert(LL.Social.errorEmptyNote())
      return
    }
    await publishNostrNote(finalText)
  }

  return (
    <ScrollView
      style={[styles.container]}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.textInputContainer}>
        <TextInput
          style={[
            styles.textInput,
            {
              borderColor: theme.colors.black,
              height: Math.max(inputHeight, 100),
              color: theme.colors.black,
            },
          ]}
          multiline
          value={userText}
          onChangeText={setUserText}
          onContentSizeChange={onContentSizeChange}
          textAlignVertical="top"
          placeholder="Type here to share something cool, funny, or interesting! Add a vlog or meme, you may just get paid and even go viral ⚡"
          placeholderTextColor={theme.colors.grey3}
        />
      </View>

      {/* Image previews */}
      {selectedImages.length > 0 && (
        <View style={styles.imagePreviewContainer}>
          {selectedImages.map((uri, index) => (
            <View key={index} style={styles.imagePreviewWrapper}>
              <Image source={{ uri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => handleRemoveImage(index)}
              >
                <Icon name="close-circle" size={24} color="#FF6B35" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Video preview */}
      {selectedVideo && (
        <View style={styles.videoPreviewContainer}>
          <View style={styles.videoPreviewWrapper}>
            <View style={styles.videoPlaceholder}>
              <Icon name="videocam" size={48} color={theme.colors.primary} />
              <Text style={[styles.videoText, { color: theme.colors.grey3 }]}>
                Video selected
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={handleRemoveVideo}
            >
              <Icon name="close-circle" size={24} color="#FF6B35" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Media buttons */}
      <View style={styles.mediaButtonsContainer}>
        <TouchableOpacity
          style={[styles.mediaButton, selectedVideo ? styles.mediaButtonDisabled : null]}
          onPress={handleAddImage}
          disabled={loading || uploadingImages || !!selectedVideo}
        >
          <Icon
            name="image-outline"
            size={20}
            color={selectedVideo ? theme.colors.grey3 : theme.colors.primary}
          />
          <Text
            style={[
              styles.mediaButtonText,
              { color: selectedVideo ? theme.colors.grey3 : theme.colors.primary },
            ]}
          >
            Gallery
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mediaButton, selectedVideo ? styles.mediaButtonDisabled : null]}
          onPress={handleTakePicture}
          disabled={loading || uploadingImages || !!selectedVideo}
        >
          <Icon
            name="camera-outline"
            size={20}
            color={selectedVideo ? theme.colors.grey3 : theme.colors.primary}
          />
          <Text
            style={[
              styles.mediaButtonText,
              { color: selectedVideo ? theme.colors.grey3 : theme.colors.primary },
            ]}
          >
            Camera
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mediaButton,
            selectedImages.length > 0 && styles.mediaButtonDisabled,
          ]}
          onPress={handleRecordVideo}
          disabled={loading || uploadingImages || selectedImages.length > 0}
        >
          <Icon
            name="videocam-outline"
            size={20}
            color={selectedImages.length > 0 ? theme.colors.grey3 : theme.colors.primary}
          />
          <Text
            style={[
              styles.mediaButtonText,
              {
                color:
                  selectedImages.length > 0 ? theme.colors.grey3 : theme.colors.primary,
              },
            ]}
          >
            Video
          </Text>
        </TouchableOpacity>
      </View>

      {isFirstPost && (
        <View style={styles.fixedTextContainer}>
          {includeFlashCredit ? (
            <View>
              <Text style={[styles.fixedText, { color: theme.colors.grey3 }]}>
                {FIXED_TEXT_LINE}
              </Text>
              <Text style={[styles.fixedTextBold, { color: theme.colors.grey2 }]}>
                {FIXED_TEXT_LINE_1}
              </Text>
              <Text style={[styles.fixedTextBold, { color: theme.colors.grey2 }]}>
                {FIXED_TEXT_LINE_2}
              </Text>
            </View>
          ) : null}

          <View style={styles.checkboxContainer}>
            <TouchableOpacity
              style={styles.checkbox}
              onPress={() => setIncludeFlashCredit(!includeFlashCredit)}
            >
              {includeFlashCredit && (
                <Icon name="checkmark" size={16} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
            <Text style={[styles.checkboxText, { color: theme.colors.grey3 }]}>
              {FIXED_TEXT_LINE_3}
            </Text>
          </View>
        </View>
      )}

      {uploadingImages && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.uploadingText, { color: theme.colors.grey3 }]}>
            Uploading media...
          </Text>
        </View>
      )}

      {/* Explainer video */}
      <ExplainerVideo
        videoUrl="https://v.nostr.build/2TNtuYh8WLpWBHXV.mp4"
        title="How to make a great post (Video Tutorial)"
        style={styles.explainerVideo}
      />

      <PrimaryBtn
        label={loading ? LL.Social.posting() : LL.Social.postButton()}
        onPress={onPost}
        btnStyle={styles.buttonContainer}
        disabled={loading || uploadingImages}
      />
    </ScrollView>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
  },
  textInputContainer: {
    width: "100%",
    marginBottom: 16,
  },
  textInput: {
    borderWidth: 0.2,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    backgroundColor: colors.white,
    width: "100%",
  },
  imagePreviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  imagePreviewWrapper: {
    position: "relative",
    width: 100,
    height: 100,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  videoPreviewContainer: {
    marginBottom: 12,
  },
  videoPreviewWrapper: {
    position: "relative",
    width: "100%",
    height: 150,
  },
  videoPlaceholder: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    backgroundColor: colors.grey5,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  videoText: {
    fontSize: 14,
    fontWeight: "500",
  },
  mediaButtonsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  mediaButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    gap: 8,
  },
  mediaButtonDisabled: {
    borderColor: colors.grey3,
    opacity: 0.5,
  },
  mediaButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  uploadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 8,
  },
  uploadingText: {
    fontSize: 14,
  },
  explainerVideo: {
    marginBottom: 16,
  },
  fixedTextContainer: {
    marginBottom: 20,
  },
  fixedText: {
    fontSize: 14,
  },
  fixedTextBold: {
    fontSize: 14,
    fontWeight: "600",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.white,
  },
  checkboxText: {
    fontSize: 14,
    flex: 1,
  },
  buttonContainer: {
    marginTop: 10,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  ageRestrictionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
  },
  ageRestrictionMessage: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  countdownContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: "600",
  },
}))

export default MakeNostrPost
