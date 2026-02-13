import React, { useState, useEffect, useCallback } from "react"
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native"
import { useTheme, makeStyles } from "@rneui/themed"
import { RouteProp, useFocusEffect, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import Icon from "react-native-vector-icons/Ionicons"
import Clipboard from "@react-native-clipboard/clipboard"

import { Screen } from "../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { nip19, getPublicKey, Event } from "nostr-tools"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"

import { FeedItem } from "@app/components/nostr-feed/FeedItem"
import { ExplainerVideo } from "@app/components/explainer-video"
import ChatIcon from "@app/assets/icons/chat.svg"
import ArrowUp from "@app/assets/icons/arrow-up.svg"

import LinearGradient from "react-native-linear-gradient"

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

  const { profileMap, contactsEvent, setContactsEvent } = useChatContext()
  const { contactPubkey, userPrivateKey } = route.params
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

  const userPrivateKeyHex =
    typeof userPrivateKey === "string" ? userPrivateKey : bytesToHex(userPrivateKey)
  const selfPubkey = userPrivateKey ? getPublicKey(hexToBytes(userPrivateKeyHex)) : null
  const isOwnProfile = selfPubkey === contactPubkey
  const userPubkey = getPublicKey(
    typeof userPrivateKey === "string" ? hexToBytes(userPrivateKey) : userPrivateKey,
  )
  const groupId = [userPubkey, contactPubkey].sort().join(",")

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
    navigation.replace("messages", { groupId, userPrivateKey: userPrivateKeyHex })
  }

  // Re-sync posts from runtime store when screen gains focus (e.g. after publishing a new post)
  useFocusEffect(
    useCallback(() => {
      const latest = nostrRuntime
        .getAllEvents()
        .filter((e) => e.pubkey === contactPubkey && (e.kind === 1 || e.kind === 6))
        .sort((a, b) => b.created_at - a.created_at)
      setPosts((prev) => {
        const ids = new Set(prev.map((e) => e.id))
        const newEvents = latest.filter((e) => !ids.has(e.id))
        if (newEvents.length === 0) return prev
        return [...prev, ...newEvents].sort((a, b) => b.created_at - a.created_at)
      })
    }, [contactPubkey]),
  )

  // Subscribe to posts and reposts using nostrRuntime
  useEffect(() => {
    nostrRuntime.ensureSubscription(
      postsKey,
      { kinds: [1, 6], authors: [contactPubkey], limit: 10 },
      (event) => {
        setPosts((prev) => {
          if (prev.find((e) => e.id === event.id)) return prev
          return [...prev, event].sort((a, b) => b.created_at - a.created_at)
        })

        if (event.kind === 6) {
          const pTag = event.tags.find((t) => t[0] === "p")?.[1]
          if (pTag) {
            nostrRuntime.ensureSubscription(
              `profile:${pTag}`,
              { kinds: [0], authors: [pTag], limit: 1 },
              (profileEvent) => {
                setRepostedProfiles((prev) => {
                  const next = new Map(prev)
                  next.set(pTag, JSON.parse(profileEvent.content))
                  return next
                })
              },
            )
          }
        }
      },
      () => {
        setLoadingPosts(false)
      },
    )

    return () => {
      nostrRuntime.releaseSubscription(postsKey)
    }
  }, [contactPubkey])

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
          <View style={styles.postsSectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.black }]}>
              {isBusiness ? "Business Updates" : "Recent Posts"}
            </Text>
            {posts.length > 0 && (
              <Text style={[styles.postsCount, { color: colors.grey3 }]}>
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </Text>
            )}
          </View>
          {loadingPosts ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.grey3 }]}>
                Loading...
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View style={styles.emptyPostsContainer}>
              <Icon
                name={isBusiness ? "storefront-outline" : "chatbubble-outline"}
                size={48}
                color={colors.grey3}
                style={{ marginBottom: 8 }}
              />
              <Text style={[styles.emptyPostsText, { color: colors.grey3 }]}>
                {isBusiness ? "No business updates yet" : "No posts yet"}
              </Text>
              <TouchableOpacity
                style={[styles.makePostCTA, { backgroundColor: colors.grey5 }]}
                onPress={() => navigation.navigate("makeNostrPost")}
                activeOpacity={0.7}
              >
                <Icon
                  name="create-outline"
                  size={24}
                  color={colors.primary}
                  style={{ marginRight: 12 }}
                />
                <View style={styles.makePostTextContainer}>
                  <Text style={[styles.makePostTitle, { color: colors.black }]}>
                    {LL.NostrQuickStart.postHeading()}
                  </Text>
                  <Text style={[styles.makePostDesc, { color: colors.grey3 }]}>
                    {LL.NostrQuickStart.postDesc()}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={20} color={colors.grey3} />
              </TouchableOpacity>
            </View>
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

          {/* Explainer video */}
          <ExplainerVideo
            videoUrl="https://blossom.primal.net/f0d613b379e9855f32822a7286605b0fad32d79ea5b81ed23cf9cdda1da461ef.mp4"
            title="What is nostr?"
            style={styles.explainerVideo}
          />

          {/* CTA button to explore full Nostr experience on Primal */}
          <TouchableOpacity
            style={styles.primalButton}
            onPress={() => Linking.openURL(`https://primal.net/p/${userPubkey}`)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#FF6154", "#FE9F41"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primalButtonGradient}
            >
              <View style={styles.primalButtonContent}>
                <View style={styles.primalLogoContainer}>
                  <Image
                    source={require("@app/assets/images/primal-logo-large.png")}
                    style={styles.primalLogo}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.primalTextContainer}>
                  <Text style={styles.primalTitle}>Explore more on Primal</Text>
                  <Text style={styles.primalSubtitle}>
                    Full Nostr experience with feeds, notifications & more
                  </Text>
                </View>
                <View style={styles.primalArrowContainer}>
                  <Icon name="arrow-forward" size={22} color="#FFFFFF" />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Unfollow */}
        {!isOwnProfile && (
          <View style={[styles.dangerZoneContainer, { borderTopColor: colors.grey5 }]}>
            <Text style={[styles.dangerZoneTitle, { color: colors.black }]}>
              {LL.Nostr.Contacts.contactManagement()}
            </Text>
            <TouchableOpacity
              style={[styles.unfollowButton, { backgroundColor: colors.error }]}
              onPress={handleUnfollow}
            >
              <Icon name="remove-circle" style={[styles.icon, { color: "white" }]} />
              <Text style={{ color: "#FFF" }}>
                {LL.Nostr.Contacts.unfollowContact()}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button to create new post */}
      {posts.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate("makeNostrPost")}
          activeOpacity={0.8}
        >
          <Icon name="create" size={24} color="#FFFFFF" />
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
  postsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  postsCount: { fontSize: 14, fontWeight: "500" },
  loadingContainer: { alignItems: "center", paddingVertical: 16 },
  loadingText: { marginTop: 8, fontSize: 14 },
  emptyPostsContainer: { alignItems: "center", paddingVertical: 20 },
  emptyPostsText: { fontSize: 16, textAlign: "center", marginBottom: 16 },
  makePostCTA: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  makePostTextContainer: { flex: 1 },
  makePostTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  makePostDesc: { fontSize: 13, lineHeight: 18 },
  explainerVideo: { marginTop: 16, marginHorizontal: 8, marginBottom: 8 },
  primalButton: {
    marginTop: 8,
    marginHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primalButtonGradient: { borderRadius: 16 },
  primalButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    gap: 14,
  },
  primalLogoContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  primalLogo: { width: 32, height: 32, borderRadius: 16 },
  primalTextContainer: { flex: 1 },
  primalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 4, color: "#FFFFFF" },
  primalSubtitle: { fontSize: 13, lineHeight: 18, color: "rgba(255, 255, 255, 0.85)" },
  primalArrowContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dangerZoneContainer: {
    padding: 16,
    marginTop: 16,
    borderTopWidth: 1,
    marginBottom: 24,
  },
  dangerZoneTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 16 },
  unfollowButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  icon: { fontSize: 24, marginRight: 12 },
}))

export default ContactDetailsScreen
