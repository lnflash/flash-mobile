import React, { useState } from "react"
import {
  View,
  TouchableOpacity,
  Linking,
  Animated,
  Image,
  Dimensions,
  Modal,
  ScrollView,
} from "react-native"
import { Text, Avatar, makeStyles, useTheme } from "@rneui/themed"
import Icon from "react-native-vector-icons/Ionicons"
import { Event } from "nostr-tools"
import { nip19 } from "nostr-tools"
import LinearGradient from "react-native-linear-gradient"
import Video from "react-native-video"

type FeedItemProps = {
  event: Event
  profile?: {
    name?: string
    picture?: string
    about?: string
  }
  compact?: boolean
  repostedEvent?: Event
  repostedProfile?: {
    name?: string
    picture?: string
    about?: string
  }
}

const CARIBBEAN_COLORS = {
  sunsetOrange: "#FF6B35",
  oceanBlue: "#00B4D8",
  tropicalGreen: "#06D6A0",
  coralPink: "#FF8FAB",
  sunYellow: "#FFD23F",
  deepSea: "#023E8A",
  sandBeige: "#F4E8C1",
  palmGreen: "#2D6A4F",
}

// Component for rendering individual Nostr posts with support for text, media, reposts, and invoices
export const FeedItem: React.FC<FeedItemProps> = ({
  event,
  profile,
  compact = false,
  repostedEvent,
  repostedProfile,
}) => {
  const styles = useStyles()
  const { theme } = useTheme()
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)

  // Safety check for required event properties
  if (!event || !event.pubkey || !event.created_at || !event.content) {
    console.error("FeedItem: Invalid event object", event)
    return null
  }

  // Handle reposts (kind 6) by displaying the embedded event and original author's profile
  const isRepost = event.kind === 6
  const displayEvent = isRepost && repostedEvent ? repostedEvent : event
  const displayProfile = isRepost && repostedProfile ? repostedProfile : profile

  const formatTimestamp = (timestamp: number) => {
    try {
      const now = Math.floor(Date.now() / 1000)
      const diff = now - timestamp

      if (diff < 60) return "just now"
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
      return new Date(timestamp * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    } catch (e) {
      console.error("Error formatting timestamp:", e)
      return "recently"
    }
  }

  const displayName = (() => {
    try {
      return (
        displayProfile?.name || nip19.npubEncode(displayEvent.pubkey).slice(0, 12) + "..."
      )
    } catch (e) {
      console.error("Error encoding displayName:", e)
      return "Nostr User"
    }
  })()

  const reposterName = (() => {
    if (!isRepost) return null
    try {
      return profile?.name || nip19.npubEncode(event.pubkey).slice(0, 12) + "..."
    } catch (e) {
      console.error("Error encoding reposterName:", e)
      return "Nostr User"
    }
  })()

  const gradients = [
    [CARIBBEAN_COLORS.sunsetOrange, CARIBBEAN_COLORS.coralPink],
    [CARIBBEAN_COLORS.oceanBlue, CARIBBEAN_COLORS.tropicalGreen],
    [CARIBBEAN_COLORS.sunYellow, CARIBBEAN_COLORS.sunsetOrange],
    [CARIBBEAN_COLORS.deepSea, CARIBBEAN_COLORS.oceanBlue],
    [CARIBBEAN_COLORS.palmGreen, CARIBBEAN_COLORS.tropicalGreen],
  ]

  const gradientIndex = (() => {
    try {
      const idSlice = displayEvent.id.slice(0, 8)
      const parsed = parseInt(idSlice, 16)
      if (isNaN(parsed)) {
        console.log("Invalid hex in event id, using default gradient")
        return 0
      }
      return parsed % gradients.length
    } catch (e) {
      console.error("Error calculating gradientIndex:", e)
      return 0
    }
  })()
  const selectedGradient = gradients[gradientIndex] || gradients[0]

  // Extract media URLs (images/videos) and lightning invoices (LNURL/lnbc) from post content
  const extractMediaAndInvoices = (content: string) => {
    try {
      const imageRegex = /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?[^\s]*)?/gi
      const videoRegex = /https?:\/\/\S+\.(mp4|mov|webm|avi)(\?[^\s]*)?/gi
      const imageHostRegex =
        /https?:\/\/(i\.)?nostr\.build\/\S+|https?:\/\/image\.nostr\.build\/\S+|https?:\/\/void\.cat\/\S+|https?:\/\/i\.imgur\.com\/\S+/gi
      const lnurlRegex = /(lnurl[a-zA-Z0-9]+)/gi
      const lightningInvoiceRegex = /(lnbc[a-zA-Z0-9]+)/gi

      let images = content.match(imageRegex) || []
      const imageHosts = content.match(imageHostRegex) || []
      images = [...images, ...imageHosts]

      const videos = content.match(videoRegex) || []
      const lnurls = content.match(lnurlRegex) || []
      const invoices = content.match(lightningInvoiceRegex) || []

      let textContent = content
      images.forEach((img) => (textContent = textContent.replace(img, "")))
      videos.forEach((vid) => (textContent = textContent.replace(vid, "")))
      lnurls.forEach((lnurl) => (textContent = textContent.replace(lnurl, "")))
      invoices.forEach((inv) => (textContent = textContent.replace(inv, "")))

      return {
        text: textContent.trim(),
        images: [...new Set(images)],
        videos,
        lnurls,
        invoices,
      }
    } catch (e) {
      console.error("Error extracting media and invoices:", e)
      return {
        text: content,
        images: [],
        videos: [],
        lnurls: [],
        invoices: [],
      }
    }
  }

  const media = extractMediaAndInvoices(displayEvent.content)

  // Parse Nostr references (npub, note, nevent, nprofile) found in post content
  const parseNostrReference = (ref: string) => {
    try {
      const cleanRef = ref.replace("nostr:", "")
      const decoded = nip19.decode(cleanRef)

      if (decoded.type === "npub") {
        return { type: "user", id: decoded.data as string }
      } else if (decoded.type === "note") {
        return { type: "note", id: decoded.data as string }
      } else if (decoded.type === "nevent") {
        const data = decoded.data as nip19.EventPointer
        return { type: "event", id: data.id, author: data.author, relays: data.relays }
      } else if (decoded.type === "nprofile") {
        const data = decoded.data as nip19.ProfilePointer
        return { type: "profile", pubkey: data.pubkey, relays: data.relays }
      }
    } catch (e) {
      console.error("Error parsing nostr reference", e)
    }
    return null
  }

  const linkifyText = (text: string) => {
    try {
      const urlRegex = /(https?:\/\/[^\s]+)/g
      const nostrMentionRegex =
        /(nostr:)?(npub1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+|nprofile1[a-zA-Z0-9]+)/g
      const combinedRegex = new RegExp(
        `${urlRegex.source}|${nostrMentionRegex.source}`,
        "g",
      )
      const parts = text.split(combinedRegex).filter(Boolean)

      return parts.map((part, index) => {
        try {
          if (part === "nostr:") {
            return null
          }

          if (urlRegex.test(part) && !part.match(/^(npub|note|nevent|nprofile)/)) {
            return (
              <Text
                key={index}
                style={{ color: theme.colors.primary }}
                onPress={() => Linking.openURL(part)}
              >
                {part}
              </Text>
            )
          } else if (part.match(/^(npub1|note1|nevent1|nprofile1)/)) {
            const refData = parseNostrReference(part)
            const displayText = part.slice(0, 8) + "..." + part.slice(-4)

            return (
              <Text key={index} style={{ color: "#60aa55", fontWeight: "600" }}>
                @{displayText}
              </Text>
            )
          }
          return <Text key={index}>{part}</Text>
        } catch (e) {
          console.error("Error in linkifyText map for part:", part, e)
          return <Text key={index}>{part}</Text>
        }
      })
    } catch (e) {
      console.error("Error in linkifyText:", e)
      return <Text>{text}</Text>
    }
  }

  const handleInvoicePress = (invoice: string) => {
    Linking.openURL(`lightning:${invoice}`)
  }

  try {
    return (
      <View style={styles.containerWrapper}>
        <LinearGradient
          colors={selectedGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accentBar}
        />

        <View style={styles.container}>
          {isRepost && reposterName && (
            <View style={styles.repostHeader}>
              <Icon name="repeat" size={14} color="#60aa55" />
              <Text style={styles.repostText}>{reposterName} reposted</Text>
            </View>
          )}

          <View style={styles.header}>
            <LinearGradient colors={selectedGradient} style={styles.avatarGradientBorder}>
              <View style={styles.avatarInner}>
                <Avatar
                  size={36}
                  rounded
                  source={
                    displayProfile?.picture ? { uri: displayProfile.picture } : undefined
                  }
                  title={
                    !displayProfile?.picture
                      ? displayName.charAt(0).toUpperCase()
                      : undefined
                  }
                  containerStyle={
                    !displayProfile?.picture
                      ? { backgroundColor: selectedGradient[0] }
                      : undefined
                  }
                />
              </View>
            </LinearGradient>
            <View style={styles.userInfo}>
              <Text style={styles.username}>{displayName}</Text>
              <View style={styles.timestampContainer}>
                <Icon
                  name="time-outline"
                  size={12}
                  color={CARIBBEAN_COLORS.oceanBlue}
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.timestamp}>
                  {formatTimestamp(displayEvent.created_at)}
                </Text>
              </View>
            </View>
          </View>

          <View style={compact ? styles.contentCompact : styles.content}>
            {media.text && (
              <Text style={styles.contentText} numberOfLines={compact ? 3 : undefined}>
                {linkifyText(media.text)}
              </Text>
            )}

            {media.images.length > 0 && (
              <View style={styles.mediaContainer}>
                {media.images.slice(0, compact ? 1 : 4).map((imageUrl, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => setSelectedImage(imageUrl)}
                    style={styles.imageWrapper}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={compact ? styles.mediaImageCompact : styles.mediaImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
                {compact && media.images.length > 1 && (
                  <Text style={styles.moreImagesText}>
                    +{media.images.length - 1} more
                  </Text>
                )}
              </View>
            )}

            {media.videos.length > 0 && (
              <View style={styles.mediaContainer}>
                {media.videos
                  .slice(0, compact ? 1 : media.videos.length)
                  .map((videoUrl, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedVideo(videoUrl)}
                      style={styles.videoWrapper}
                    >
                      <View
                        style={
                          compact
                            ? styles.videoPlaceholderCompact
                            : styles.videoPlaceholder
                        }
                      >
                        <Icon
                          name="play-circle"
                          size={compact ? 32 : 48}
                          color={theme.colors.grey3}
                        />
                        {!compact && <Text style={styles.videoText}>Video</Text>}
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            )}

            {!compact && (media.invoices.length > 0 || media.lnurls.length > 0) && (
              <View style={styles.invoiceContainer}>
                {media.invoices.map((invoice, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.invoiceButton}
                    onPress={() => handleInvoicePress(invoice)}
                  >
                    <Icon name="flash" size={20} color="#FF8C42" />
                    <Text style={styles.invoiceText}>Pay Lightning Invoice</Text>
                    <Icon name="open-outline" size={16} color={theme.colors.grey3} />
                  </TouchableOpacity>
                ))}
                {media.lnurls.map((lnurl, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.invoiceButton}
                    onPress={() => Linking.openURL(`lightning:${lnurl}`)}
                  >
                    <Icon name="flash" size={20} color="#60aa55" />
                    <Text style={styles.invoiceText}>Zap Request</Text>
                    <Icon name="open-outline" size={16} color={theme.colors.grey3} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Image Modal */}
        <Modal
          visible={selectedImage !== null}
          transparent={true}
          onRequestClose={() => setSelectedImage(null)}
          animationType="fade"
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedImage(null)}
            >
              <Icon name="close" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* Video Modal */}
        <Modal
          visible={selectedVideo !== null}
          transparent={true}
          onRequestClose={() => setSelectedVideo(null)}
          animationType="fade"
        >
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedVideo(null)}
            >
              <Icon name="close" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            {selectedVideo && (
              <View style={styles.videoPlayerContainer}>
                <Video
                  source={{ uri: selectedVideo }}
                  style={styles.videoPlayer}
                  controls={true}
                  resizeMode="contain"
                  paused={false}
                  onError={(error) => console.error("Video error:", error)}
                />
              </View>
            )}
          </View>
        </Modal>
      </View>
    )
  } catch (e) {
    console.error("Error rendering FeedItem:", e)
    console.error("Error stack:", e.stack)
    return (
      <View style={styles.containerWrapper}>
        <Text style={{ padding: 20, color: "red" }}>Error displaying post</Text>
      </View>
    )
  }
}

const useStyles = makeStyles(({ colors }) => ({
  containerWrapper: {
    marginHorizontal: 8,
    marginVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.grey5,
  },
  accentBar: {
    height: 4,
    width: "100%",
  },
  container: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  repostHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  repostText: {
    fontSize: 12,
    color: "#60aa55",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  avatarGradientBorder: {
    borderRadius: 22,
    padding: 2,
  },
  avatarInner: {
    borderRadius: 20,
    backgroundColor: colors.background,
    padding: 2,
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.black,
    marginBottom: 2,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  timestamp: {
    fontSize: 11,
    color: colors.grey3,
    fontStyle: "italic",
  },
  content: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  contentCompact: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  contentText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.black,
  },
  mediaContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  imageWrapper: {
    marginBottom: 8,
  },
  mediaImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.grey5,
  },
  mediaImageCompact: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    backgroundColor: colors.grey5,
  },
  moreImagesText: {
    fontSize: 12,
    color: colors.grey3,
    marginTop: 4,
    fontStyle: "italic",
  },
  videoWrapper: {
    marginBottom: 8,
  },
  videoPlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.grey5,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlaceholderCompact: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    backgroundColor: colors.grey5,
    justifyContent: "center",
    alignItems: "center",
  },
  videoText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.grey3,
  },
  invoiceContainer: {
    marginTop: 12,
    gap: 8,
  },
  invoiceButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: colors.grey5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.grey4,
    gap: 8,
  },
  invoiceText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
  videoPlayerContainer: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height * 0.6,
    justifyContent: "center",
    alignItems: "center",
  },
  videoPlayer: {
    width: "100%",
    height: "100%",
  },
}))
