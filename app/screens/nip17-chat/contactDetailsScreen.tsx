import React, { useState, useEffect, useCallback } from "react"
import { View, StyleSheet, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native"
import { useTheme, makeStyles } from "@rneui/themed"
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native"
import { StackNavigationProp } from "@react-navigation/stack"
import { ChatStackParamList } from "@app/navigation/stack-param-lists"
import { useChatContext } from "./chatContext"
import { Header } from "@rneui/base"
import Icon from "react-native-vector-icons/Ionicons"
import ChatIcon from "@app/assets/icons/chat.svg"
import { nip19, getPublicKey, Event } from "nostr-tools"
import { publicRelays } from "@app/utils/nostr"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"
import { Screen } from "../../components/screen"
import { useI18nContext } from "@app/i18n/i18n-react"
import { pool } from "@app/utils/nostr/pool"
import { FeedItem } from "@app/components/nostr-feed/FeedItem"
import { useBusinessMapMarkersQuery } from "@app/graphql/generated"
import ArrowUp from "@app/assets/icons/arrow-up.svg"
import { Linking } from "react-native"
import LinearGradient from "react-native-linear-gradient"

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
]

type ContactDetailsRouteProp = RouteProp<ChatStackParamList, "contactDetails">

const ContactDetailsScreen: React.FC = () => {
  const route = useRoute<ContactDetailsRouteProp>()
  const navigation =
    useNavigation<StackNavigationProp<ChatStackParamList, "contactDetails">>()
  const { theme } = useTheme()
  const colors = theme.colors
  const styles = useStyles()
  const { profileMap, contactsEvent, poolRef, setContactsEvent } = useChatContext()
  const { LL } = useI18nContext()

  const { contactPubkey, userPrivateKey } = route.params

  const profile = profileMap?.get(contactPubkey)
  const npub = nip19.npubEncode(contactPubkey)

  // State for managing Nostr posts (kind 1) and reposts (kind 6)
  const [posts, setPosts] = useState<Event[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [repostedEvents, setRepostedEvents] = useState<Map<string, Event>>(new Map())
  const [repostedProfiles, setRepostedProfiles] = useState<Map<string, any>>(new Map())

  // Detect if this contact is a business account (Level 2 or 3) by checking if their username is in businessMapMarkers
  const { data: businessMapData } = useBusinessMapMarkersQuery({
    fetchPolicy: "cache-first",
  })

  const businessUsernames = businessMapData?.businessMapMarkers.map((m) => m.username) || []
  const isBusiness = profile?.username ? businessUsernames.includes(profile.username) : false

  const userPrivateKeyHex =
    typeof userPrivateKey === "string" ? userPrivateKey : bytesToHex(userPrivateKey)

  const userPubkey = getPublicKey(
    typeof userPrivateKey === "string" ? hexToBytes(userPrivateKey) : userPrivateKey,
  )

  // Check if viewing own profile to hide message/send payment buttons
  const isOwnProfile = userPubkey === contactPubkey
  const groupId = [userPubkey, contactPubkey].sort().join(",")

  const handleUnfollow = () => {
    if (!poolRef || !contactsEvent) return

    let profiles = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1])
    let tagsWithoutProfiles = contactsEvent.tags.filter((p) => p[0] !== "p")
    let newProfiles = profiles.filter((p) => p !== contactPubkey)

    let newContactsEvent = {
      ...contactsEvent,
      tags: [...tagsWithoutProfiles, ...newProfiles.map((p) => ["p", p])],
    }
    poolRef.current.publish(publicRelays, newContactsEvent)
    setContactsEvent(newContactsEvent)
    navigation.goBack()
  }

  const handleSendPayment = () => {
    const lud16 = profile?.lud16 || ""
    navigation.navigate("sendBitcoinDestination", {
      username: lud16,
    })
  }

  const handleStartChat = () => {
    navigation.replace("messages", {
      groupId: groupId,
      userPrivateKey: userPrivateKeyHex,
    })
  }

  // Fetch Nostr posts (kind 1) and reposts (kind 6) from this contact
  // For reposts, we parse the embedded event and fetch the original author's profile
  const fetchPosts = useCallback(async () => {
    try {
      setLoadingPosts(true)
      const fetchedEvents: Event[] = []
      const repostMap = new Map<string, Event>()
      const profilesMap = new Map<string, any>()

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [1, 6],
            authors: [contactPubkey],
            limit: 10,
          },
        ],
        {
          onevent(event) {
            if (!fetchedEvents.find((e) => e.id === event.id)) {
              fetchedEvents.push(event)

              if (event.kind === 6) {
                const eTag = event.tags.find((tag) => tag[0] === "e")
                const pTag = event.tags.find((tag) => tag[0] === "p")

                if (eTag && eTag[1]) {
                  try {
                    const repostedEvent = JSON.parse(event.content)
                    repostMap.set(event.id, repostedEvent)

                    if (pTag && pTag[1]) {
                      pool.subscribeMany(
                        RELAYS,
                        [{ kinds: [0], authors: [pTag[1]], limit: 1 }],
                        {
                          onevent(profileEvent) {
                            const profileData = JSON.parse(profileEvent.content)
                            profilesMap.set(pTag[1], profileData)
                            setRepostedProfiles(new Map(profilesMap))
                          },
                        },
                      )
                    }
                  } catch (e) {
                    console.error("Error parsing reposted event", e)
                  }
                }
              }
            }
          },
          oneose() {
            fetchedEvents.sort((a, b) => b.created_at - a.created_at)
            setPosts(fetchedEvents)
            setRepostedEvents(repostMap)
            sub.close()
            setLoadingPosts(false)
          },
        },
      )

      setTimeout(() => {
        sub.close()
        setLoadingPosts(false)
      }, 5000)
    } catch (error) {
      console.error("Error fetching posts:", error)
      setLoadingPosts(false)
    }
  }, [contactPubkey])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  return (
    <Screen preset="fixed">
      <Header
        leftComponent={
          <Icon
            name="arrow-back"
            size={24}
            color={colors.black}
            onPress={() => navigation.goBack()}
          />
        }
        centerComponent={{
          text: LL.Nostr.Contacts.profile(),
          style: { color: colors.black, fontSize: 18 },
        }}
        backgroundColor={colors.background}
        containerStyle={styles.headerContainer}
      />

      <ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>
        {/* Profile header with optional banner image background */}
        <View style={[styles.profileHeaderContainer, { backgroundColor: profile?.banner ? colors.white : colors.background }]}>
          {/* Banner image as background with overlay for text readability */}
          {profile?.banner && (
            <>
              <Image
                source={{ uri: profile.banner }}
                style={styles.bannerBackground}
                resizeMode="cover"
                blurRadius={2}
              />
              <View style={styles.bannerOverlay} />
            </>
          )}
          <View style={styles.profileHeader}>
            <Image
              source={
                profile?.picture
                  ? { uri: profile.picture }
                  : {
                      uri: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwinaero.com%2Fblog%2Fwp-content%2Fuploads%2F2017%2F12%2FUser-icon-256-blue.png&f=1&nofb=1&ipt=d8f3a13e26633e5c7fb42aed4cd2ab50e1bb3d91cfead71975713af0d1ed278c",
                    }
              }
              style={styles.profileImage}
            />
            {isBusiness && (
              <View style={styles.businessBadge}>
                <Icon name="storefront" size={16} color="#FFFFFF" />
                <Text style={styles.businessBadgeText}>Business</Text>
              </View>
            )}
            <Text
              style={[
                styles.profileName,
                { color: profile?.banner ? "#FFFFFF" : colors.black },
                profile?.banner && styles.textShadow
              ]}
            >
              {profile?.name || profile?.username || LL.Nostr.Contacts.nostrUser()}
            </Text>
            <View style={styles.profileNpub}>
              <Icon name="key-outline" size={14} color={profile?.banner ? "#FFFFFF" : colors.grey3} />
              <Text
                style={[
                  styles.npubText,
                  profile?.banner && { color: "rgba(255, 255, 255, 0.95)" },
                  profile?.banner && styles.textShadow
                ]}
              >
                {npub.slice(0, 8)}...{npub.slice(-6)}
              </Text>
            </View>
            {profile?.lud16 && (
              <View style={[styles.profileLud16, profile?.banner && styles.lightBackground]}>
                <Icon name="flash" size={14} color="orange" />
                <Text style={[styles.lud16Text, { color: profile?.banner ? "#333" : colors.grey1 }]}>{profile.lud16}</Text>
              </View>
            )}
            {profile?.website && (
              <View style={styles.profileWebsite}>
                <Icon name="globe-outline" size={14} color={profile?.banner ? "#FFFFFF" : colors.grey3} />
                <Text
                  style={[
                    styles.websiteText,
                    profile?.banner && { color: "rgba(255, 255, 255, 0.95)" },
                    profile?.banner && styles.textShadow
                  ]}
                >
                  {profile.website}
                </Text>
              </View>
            )}
            {profile?.about && (
              <Text
                style={[
                  styles.aboutText,
                  profile?.banner && { color: "rgba(255, 255, 255, 0.98)" },
                  profile?.banner && styles.textShadow
                ]}
              >
                {profile.about}
              </Text>
            )}
          </View>
        </View>

        {/* Action buttons (message/send payment) - hidden when viewing own profile */}
        {!isOwnProfile && (
          <View style={styles.actionsContainer}>
            <View style={styles.iconBtnContainer}>
              <TouchableOpacity
                style={[styles.iconButton, styles.messageButton]}
                onPress={handleStartChat}
                activeOpacity={0.5}
              >
                <ChatIcon color="#FFFFFF" width={30} height={30} />
              </TouchableOpacity>
              <Text style={styles.iconBtnLabel}>{LL.Nostr.Contacts.message()}</Text>
            </View>

            <View style={styles.iconBtnContainer}>
              <TouchableOpacity
                style={[styles.iconButton, styles.sendButton]}
                onPress={handleSendPayment}
                activeOpacity={0.5}
              >
                <ArrowUp color="#FFFFFF" width={30} height={30} />
              </TouchableOpacity>
              <Text style={styles.iconBtnLabel}>{LL.Nostr.Contacts.sendPayment()}</Text>
            </View>
          </View>
        )}

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
              <Text style={[styles.loadingText, { color: colors.grey3 }]}>Loading...</Text>
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
            <>
              {posts.map((post) => (
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
              ))}
            </>
          )}
          {/* CTA button to explore full Nostr experience on Primal */}
          <TouchableOpacity
            style={[styles.primalButton]}
            onPress={() => Linking.openURL("https://primal.net")}
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
                  <Text style={styles.primalTitle}>
                    Explore more on Primal
                  </Text>
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

        <View style={[styles.dangerZoneContainer, { borderTopColor: colors.grey5 }]}>
          <Text style={[styles.dangerZoneTitle, { color: colors.black }]}>
            {LL.Nostr.Contacts.contactManagement()}
          </Text>
          <TouchableOpacity
            style={[styles.unfollowButton, { backgroundColor: colors.error }]}
            onPress={handleUnfollow}
          >
            <Icon name="remove-circle" style={[styles.icon, { color: "white" }]} />
            <Text style={[styles.actionText, { color: "white" }]}>
              {LL.Nostr.Contacts.unfollowContact()}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Action Button to create new post - only shown when user has posts */}
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
  headerContainer: {
    borderBottomWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  profileHeaderContainer: {
    position: "relative",
    minHeight: 200,
  },
  bannerBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  textShadow: {
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  lightBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    position: "relative",
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  businessBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#60aa55",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  businessBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  profileNpub: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  npubText: {
    fontSize: 13,
    color: "#888",
  },
  profileLud16: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 165, 0, 0.1)",
    borderRadius: 12,
  },
  lud16Text: {
    fontSize: 13,
    fontWeight: "500",
  },
  profileWebsite: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  websiteText: {
    fontSize: 13,
    color: "#888",
  },
  aboutText: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 20,
    marginTop: 8,
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    paddingVertical: 12,
  },
  iconBtnContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    marginHorizontal: 8,
  },
  iconButton: {
    height: 64,
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 100,
    marginBottom: 5,
  },
  messageButton: {
    backgroundColor: "#60aa55",
  },
  sendButton: {
    backgroundColor: "#FF8C42",
  },
  iconBtnLabel: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.black,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  dangerZoneContainer: {
    padding: 16,
    marginTop: 16,
    borderTopWidth: 1,
    marginBottom: 24,
  },
  dangerZoneTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  unfollowButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  postsSection: {
    padding: 12,
    marginTop: 8,
  },
  postsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  postsCount: {
    fontSize: 14,
    fontWeight: "500",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  emptyPostsContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyPostsText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
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
  makePostTextContainer: {
    flex: 1,
  },
  makePostTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  makePostDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  primalButton: {
    marginTop: 16,
    marginHorizontal: 8,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primalButtonGradient: {
    borderRadius: 16,
  },
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
  primalLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  primalTextContainer: {
    flex: 1,
  },
  primalTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
    color: "#FFFFFF",
  },
  primalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255, 255, 255, 0.85)",
  },
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
}))

export default ContactDetailsScreen
