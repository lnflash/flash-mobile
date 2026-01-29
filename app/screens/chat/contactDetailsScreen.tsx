import React, { useState, useCallback, useEffect } from "react"
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native"
import { useTheme, makeStyles } from "@rneui/themed"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import Icon from "react-native-vector-icons/Ionicons"
import Clipboard from "@react-native-clipboard/clipboard"

import { Screen } from "../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { nip19, Event } from "nostr-tools"

import { FeedItem } from "@app/components/nostr-feed/FeedItem"
import { ExplainerVideo } from "@app/components/explainer-video"
import ChatIcon from "@app/assets/icons/chat.svg"
import ArrowUp from "@app/assets/icons/arrow-up.svg"

import { useChatContext } from "./chatContext"
import { useBusinessMapMarkersQuery } from "@app/graphql/generated"
import { nostrRuntime } from "@app/nostr/runtime/NostrRuntime"
import { pool } from "@app/utils/nostr/pool"

type ContactDetailsRouteProp = RouteProp<ChatStackParamList, "contactDetails">

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
]

const ContactDetailsScreen: React.FC = () => {
  const route = useRoute<ContactDetailsRouteProp>()
  const navigation =
    useNavigation<StackNavigationProp<ChatStackParamList, "contactDetails">>()
  const { theme } = useTheme()
  const colors = theme.colors
  const styles = useStyles()
  const { LL } = useI18nContext()

  const { profileMap, contactsEvent, setContactsEvent, userPublicKey } = useChatContext()
  const { contactPubkey } = route.params
  const profile = profileMap?.get(contactPubkey)
  const npub = nip19.npubEncode(contactPubkey)
  const postsKey = `posts:${contactPubkey}`
  // Posts, reposts, and profiles
  const [posts, setPosts] = useState<Event[]>(() => {
    return nostrRuntime
      .getAllEvents()
      .filter((e) => e.pubkey === contactPubkey && (e.kind === 1 || e.kind === 6))
      .sort((a, b) => b.created_at - a.created_at)
  })

  const [loadingPosts, setLoadingPosts] = useState(posts.length === 0)

  const [repostedEvents, setRepostedEvents] = useState<Map<string, Event>>(new Map())
  const [repostedProfiles, setRepostedProfiles] = useState<Map<string, any>>(new Map())

  // Business check
  const { data: businessMapData } = useBusinessMapMarkersQuery({
    fetchPolicy: "cache-first",
  })
  const businessUsernames =
    businessMapData?.businessMapMarkers.map((m) => m.username) || []
  const isBusiness = profile?.username
    ? businessUsernames.includes(profile.username)
    : false

  const isOwnProfile = userPublicKey === contactPubkey
  const groupId = userPublicKey ? [userPublicKey, contactPubkey].sort().join(",") : ""

  // Copy npub
  const handleCopy = () => {
    if (!npub) return
    Clipboard.setString(npub)
  }

  // Actions
  const handleUnfollow = () => {
    if (!contactsEvent) return
    const profiles = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])
    const tagsWithoutProfiles = contactsEvent.tags.filter((p) => p[0] !== "p")
    const newProfiles = profiles.filter((p) => p !== contactPubkey)
    const newContactsEvent = {
      ...contactsEvent,
      tags: [...tagsWithoutProfiles, ...newProfiles.map((p) => ["p", p])],
    }
    pool.publish(RELAYS, newContactsEvent)
    setContactsEvent(newContactsEvent)
    navigation.goBack()
  }

  const handleSendPayment = () => {
    const lud16 = profile?.lud16 || ""
    navigation.navigate("sendBitcoinDestination", { username: lud16 })
  }

  const handleStartChat = () => {
    navigation.replace("messages", { groupId })
  }

  // Fetch posts and reposts using nostrRuntime
  const fetchPosts = useCallback(() => {
    // already have posts → don't refetch

    if (posts.length > 0) return

    setLoadingPosts(true)

    const fetchedEvents: Event[] = []
    const repostMap = new Map<string, Event>()
    const profilesMap = new Map<string, any>()

    nostrRuntime.ensureSubscription(
      postsKey,
      [{ kinds: [1, 6], authors: [contactPubkey], limit: 10 }],
      (event) => {
        fetchedEvents.push(event)

        if (event.kind === 6) {
          const pTag = event.tags.find((t) => t[0] === "p")?.[1]
          if (pTag) {
            nostrRuntime.ensureSubscription(
              `profile:${pTag}`,
              [{ kinds: [0], authors: [pTag], limit: 1 }],
              (profileEvent) => {
                profilesMap.set(pTag, JSON.parse(profileEvent.content))
                setRepostedProfiles(new Map(profilesMap))
              },
            )
          }
        }
      },
      () => {
        fetchedEvents.sort((a, b) => b.created_at - a.created_at)
        setPosts(fetchedEvents)
        setRepostedEvents(repostMap)
        setLoadingPosts(false)
      },
    )
  }, [contactPubkey, posts.length])

  useEffect(() => {
    fetchPosts()

    return () => {
      nostrRuntime.releaseSubscription(postsKey)
    }
  }, [fetchPosts])

  return (
    <Screen preset="fixed">
      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>
        {/* Banner */}
        {profile?.banner && (
          <Image
            source={{ uri: profile.banner }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        )}

        {/* Profile info */}
        <View style={[styles.profileContainer, !profile?.banner && { marginTop: 40 }]}>
          <View style={styles.profileImageWrapper}>
            <Image
              source={{
                uri:
                  profile?.picture ||
                  "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwinaero.com%2Fblog%2Fwp-content%2Fuploads%2F2017%2F12%2FUser-icon-256-blue.png",
              }}
              style={styles.profileImage}
            />
          </View>

          <View style={styles.profileInfoSection}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName}>
                {profile?.name || profile?.username || "Nostr User"}
              </Text>
              {isOwnProfile && (
                <TouchableOpacity
                  onPress={() => navigation.navigate("EditNostrProfile" as any)}
                >
                  <Icon name="create-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
              {isBusiness && (
                <View style={styles.businessBadge}>
                  <Icon name="storefront" size={12} color="#FFFFFF" />
                  <Text style={styles.businessBadgeText}>Business</Text>
                </View>
              )}
            </View>

            <TouchableOpacity onPress={handleCopy} style={styles.profileNpub}>
              <Icon name="key-outline" size={12} color={colors.grey3} />
              <Text style={styles.npubText}>
                {npub?.slice(0, 8)}...{npub?.slice(-6)}
              </Text>
            </TouchableOpacity>

            {profile?.lud16 && <Text style={styles.lud16Text}>{profile.lud16}</Text>}
            {profile?.website && (
              <Text style={styles.websiteText}>{profile.website}</Text>
            )}
            {profile?.about && <Text style={styles.aboutText}>{profile.about}</Text>}
          </View>
        </View>

        {/* Actions */}
        {!isOwnProfile && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity onPress={handleStartChat} style={styles.messageButton}>
              <ChatIcon width={30} height={30} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendPayment} style={styles.sendButton}>
              <ArrowUp width={30} height={30} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Posts */}
        <View style={styles.postsSection}>
          {loadingPosts ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : posts.length === 0 ? (
            <Text>No posts yet</Text>
          ) : (
            posts.map((post) => (
              <FeedItem
                key={post.id}
                event={post}
                profile={profile}
                compact
                repostedEvent={post.kind === 6 ? repostedEvents.get(post.id) : undefined}
                repostedProfile={
                  post.kind === 6
                    ? repostedProfiles.get(
                        post.tags.find((tag) => tag[0] === "p")?.[1] || "",
                      )
                    : undefined
                }
              />
            ))
          )}
        </View>

        {/* Explainer video */}
        <ExplainerVideo
          videoUrl="https://blossom.primal.net/f0d613b379e9855f32822a7286605b0fad32d79ea5b81ed23cf9cdda1da461ef.mp4"
          title="What is nostr?"
          style={styles.explainerVideo}
        />
      </ScrollView>

      {/* Unfollow */}
      {!isOwnProfile && (
        <TouchableOpacity
          style={[styles.unfollowButton, { backgroundColor: colors.error }]}
          onPress={handleUnfollow}
        >
          <Text style={{ color: "#FFF" }}>Unfollow</Text>
        </TouchableOpacity>
      )}
    </Screen>
  )
}

const useStyles = makeStyles(({ colors }) => ({
  scrollView: { flex: 1 },
  bannerImage: { width: "100%", height: 150, backgroundColor: colors.grey5 },
  profileContainer: { paddingHorizontal: 16 },
  profileImageWrapper: { marginTop: -40, marginBottom: 12 },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: colors.background,
  },
  profileInfoSection: { paddingBottom: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  businessBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#60aa55",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  businessBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  profileName: { fontSize: 20, fontWeight: "bold", color: colors.black },
  profileNpub: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  npubText: { fontSize: 12, color: "#888" },
  lud16Text: { fontSize: 12, color: colors.grey1 },
  websiteText: { fontSize: 12, color: colors.grey3 },
  aboutText: { fontSize: 14, lineHeight: 20, paddingTop: 8, color: colors.grey1 },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  messageButton: {
    marginHorizontal: 8,
    backgroundColor: "#60aa55",
    padding: 16,
    borderRadius: 32,
  },
  sendButton: {
    marginHorizontal: 8,
    backgroundColor: "#FF8C42",
    padding: 16,
    borderRadius: 32,
  },
  postsSection: { padding: 12, marginTop: 8 },
  explainerVideo: { marginTop: 16, marginHorizontal: 8, marginBottom: 8 },
  unfollowButton: { padding: 16, borderRadius: 8, marginTop: 8, alignItems: "center" },
}))

export default ContactDetailsScreen
