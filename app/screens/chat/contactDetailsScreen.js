"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
const chatContext_1 = require("./chatContext");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const chat_svg_1 = __importDefault(require("@app/assets/icons/chat.svg"));
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const utils_1 = require("@noble/hashes/utils");
const screen_1 = require("../../components/screen");
const i18n_react_1 = require("@app/i18n/i18n-react");
const pool_1 = require("@app/utils/nostr/pool");
const FeedItem_1 = require("@app/components/nostr-feed/FeedItem");
const generated_1 = require("@app/graphql/generated");
const arrow_up_svg_1 = __importDefault(require("@app/assets/icons/arrow-up.svg"));
const react_native_2 = require("react-native");
const react_native_linear_gradient_1 = __importDefault(require("react-native-linear-gradient"));
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const toast_1 = require("@app/utils/toast");
const react_native_3 = require("react-native");
const react_native_svg_1 = require("react-native-svg");
const explainer_video_1 = require("@app/components/explainer-video");
const RELAYS = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
    "wss://relay.snort.social",
];
const ContactDetailsScreen = () => {
    const route = (0, native_1.useRoute)();
    const navigation = (0, native_1.useNavigation)();
    const { theme } = (0, themed_1.useTheme)();
    const colors = theme.colors;
    const styles = useStyles();
    const { profileMap, contactsEvent, poolRef, setContactsEvent } = (0, chatContext_1.useChatContext)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { contactPubkey, userPrivateKey } = route.params;
    const profile = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(contactPubkey);
    const npub = nostr_tools_1.nip19.npubEncode(contactPubkey);
    // State for managing Nostr posts (kind 1) and reposts (kind 6)
    const [posts, setPosts] = (0, react_1.useState)([]);
    const [loadingPosts, setLoadingPosts] = (0, react_1.useState)(true);
    const [repostedEvents, setRepostedEvents] = (0, react_1.useState)(new Map());
    const [repostedProfiles, setRepostedProfiles] = (0, react_1.useState)(new Map());
    react_1.default.useEffect(() => {
        navigation.setOptions({
            title: (profile === null || profile === void 0 ? void 0 : profile.name) || (profile === null || profile === void 0 ? void 0 : profile.username) || (profile === null || profile === void 0 ? void 0 : profile.nip05) || "Nostr User",
        });
    }, [profile, navigation]);
    // Detect if this contact is a business account (Level 2 or 3) by checking if their username is in businessMapMarkers
    const { data: businessMapData } = (0, generated_1.useBusinessMapMarkersQuery)({
        fetchPolicy: "cache-first",
    });
    const businessUsernames = (businessMapData === null || businessMapData === void 0 ? void 0 : businessMapData.businessMapMarkers.map((m) => m.username)) || [];
    const isBusiness = (profile === null || profile === void 0 ? void 0 : profile.username)
        ? businessUsernames.includes(profile.username)
        : false;
    const userPrivateKeyHex = typeof userPrivateKey === "string" ? userPrivateKey : (0, utils_1.bytesToHex)(userPrivateKey);
    // Check if viewing own profile
    const selfPubkey = userPrivateKey ? (0, nostr_tools_1.getPublicKey)((0, utils_1.hexToBytes)(userPrivateKeyHex)) : null;
    const isSelf = contactPubkey === selfPubkey;
    const userPubkey = (0, nostr_tools_1.getPublicKey)(typeof userPrivateKey === "string" ? (0, utils_1.hexToBytes)(userPrivateKey) : userPrivateKey);
    // Check if viewing own profile to hide message/send payment buttons
    const isOwnProfile = userPubkey === contactPubkey;
    const groupId = [userPubkey, contactPubkey].sort().join(",");
    const handleUnfollow = () => {
        if (!poolRef || !contactsEvent)
            return;
        let profiles = contactsEvent.tags.filter((p) => p[0] === "p").map((p) => p[1]);
        let tagsWithoutProfiles = contactsEvent.tags.filter((p) => p[0] !== "p");
        let newProfiles = profiles.filter((p) => p !== contactPubkey);
        let newContactsEvent = Object.assign(Object.assign({}, contactsEvent), { tags: [...tagsWithoutProfiles, ...newProfiles.map((p) => ["p", p])] });
        poolRef.current.publish(nostr_1.publicRelays, newContactsEvent);
        setContactsEvent(newContactsEvent);
        navigation.goBack();
    };
    const handleSendPayment = () => {
        const lud16 = (profile === null || profile === void 0 ? void 0 : profile.lud16) || "";
        navigation.navigate("sendBitcoinDestination", {
            username: lud16,
        });
    };
    const handleStartChat = () => {
        navigation.replace("messages", {
            groupId: groupId,
            userPrivateKey: userPrivateKeyHex,
        });
    };
    const handleCopy = () => {
        if (!npub)
            return;
        clipboard_1.default.setString(npub);
        (0, toast_1.toastShow)({ type: "success", message: "npub copied to clipboard", autoHide: true });
    };
    // Fetch Nostr posts (kind 1) and reposts (kind 6) from this contact
    // For reposts, we parse the embedded event and fetch the original author's profile
    const fetchPosts = (0, react_1.useCallback)(async () => {
        try {
            setLoadingPosts(true);
            const fetchedEvents = [];
            const repostMap = new Map();
            const profilesMap = new Map();
            const sub = pool_1.pool.subscribeMany(RELAYS, [
                {
                    kinds: [1, 6],
                    authors: [contactPubkey],
                    limit: 10,
                },
            ], {
                onevent(event) {
                    if (!fetchedEvents.find((e) => e.id === event.id)) {
                        fetchedEvents.push(event);
                        if (event.kind === 6) {
                            const eTag = event.tags.find((tag) => tag[0] === "e");
                            const pTag = event.tags.find((tag) => tag[0] === "p");
                            if (eTag && eTag[1]) {
                                try {
                                    const repostedEvent = JSON.parse(event.content);
                                    repostMap.set(event.id, repostedEvent);
                                    if (pTag && pTag[1]) {
                                        pool_1.pool.subscribeMany(RELAYS, [{ kinds: [0], authors: [pTag[1]], limit: 1 }], {
                                            onevent(profileEvent) {
                                                const profileData = JSON.parse(profileEvent.content);
                                                profilesMap.set(pTag[1], profileData);
                                                setRepostedProfiles(new Map(profilesMap));
                                            },
                                        });
                                    }
                                }
                                catch (e) {
                                    console.error("Error parsing reposted event", e);
                                }
                            }
                        }
                    }
                },
                oneose() {
                    fetchedEvents.sort((a, b) => b.created_at - a.created_at);
                    setPosts(fetchedEvents);
                    setRepostedEvents(repostMap);
                    sub.close();
                    setLoadingPosts(false);
                },
            });
            setTimeout(() => {
                sub.close();
                setLoadingPosts(false);
            }, 5000);
        }
        catch (error) {
            console.error("Error fetching posts:", error);
            setLoadingPosts(false);
        }
    }, [contactPubkey]);
    (0, native_1.useFocusEffect)(react_1.default.useCallback(() => {
        console.log("fetching post");
        const sub = fetchPosts();
    }, [fetchPosts]));
    return (<screen_1.Screen preset="fixed">
      <react_native_1.ScrollView style={[styles.scrollView, { backgroundColor: colors.background }]}>
        {/* Banner section - Primal style */}
        {(profile === null || profile === void 0 ? void 0 : profile.banner) &&
            (profile.banner.endsWith(".svg") ? (<react_native_svg_1.SvgUri uri={profile.banner} width="100%" height={150} style={styles.bannerImage}/>) : (<react_native_1.Image source={{ uri: profile.banner }} style={styles.bannerImage} resizeMode="cover"/>))}

        {/* Profile section with overlapping profile picture */}
        <react_native_1.View style={[
            styles.profileContainer,
            !(profile === null || profile === void 0 ? void 0 : profile.banner) && { marginTop: 40 }, // only add spacing if no banner
        ]}>
          {/* Profile picture overlaps the banner */}
          <react_native_1.View style={styles.profileImageWrapper}>
            <react_native_1.Image source={(profile === null || profile === void 0 ? void 0 : profile.picture)
            ? { uri: profile.picture }
            : {
                uri: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwinaero.com%2Fblog%2Fwp-content%2Fuploads%2F2017%2F12%2FUser-icon-256-blue.png&f=1&nofb=1&ipt=d8f3a13e26633e5c7fb42aed4cd2ab50e1bb3d91cfead71975713af0d1ed278c",
            }} style={styles.profileImage}/>
          </react_native_1.View>

          {/* Profile info section */}
          <react_native_1.View style={styles.profileInfoSection}>
            <react_native_1.View style={styles.nameRow}>
              <react_native_1.Text style={styles.profileName}>
                {(profile === null || profile === void 0 ? void 0 : profile.name) || (profile === null || profile === void 0 ? void 0 : profile.username) || LL.Nostr.Contacts.nostrUser()}
              </react_native_1.Text>
              {isOwnProfile && (<react_native_1.TouchableOpacity onPress={() => navigation.navigate("EditNostrProfile")} hitSlop={8} style={styles.editIconButton}>
                  <Ionicons_1.default name="create-outline" size={16} color={colors.primary}/>
                </react_native_1.TouchableOpacity>)}
              {isBusiness && (<react_native_1.View style={styles.businessBadge}>
                  <Ionicons_1.default name="storefront" size={12} color="#FFFFFF"/>
                  <react_native_1.Text style={styles.businessBadgeText}>Business</react_native_1.Text>
                </react_native_1.View>)}
            </react_native_1.View>

            <react_native_3.Pressable onPress={handleCopy} android_ripple={{ color: "#ddd" }} accessibilityRole="button" accessibilityLabel="Copy npub to clipboard" style={() => [styles.profileNpub]} hitSlop={8}>
              <Ionicons_1.default name="key-outline" size={12} color={colors.grey3}/>
              <react_native_1.Text style={styles.npubText}>
                {npub === null || npub === void 0 ? void 0 : npub.slice(0, 8)}...{npub === null || npub === void 0 ? void 0 : npub.slice(-6)}
              </react_native_1.Text>
            </react_native_3.Pressable>

            {(profile === null || profile === void 0 ? void 0 : profile.lud16) && (<react_native_1.View style={[styles.profileLud16]}>
                <Ionicons_1.default name="flash" size={12} color="orange"/>
                <react_native_1.Text style={styles.lud16Text}>{profile.lud16}</react_native_1.Text>
              </react_native_1.View>)}

            {(profile === null || profile === void 0 ? void 0 : profile.website) && (<react_native_1.View style={styles.profileWebsite}>
                <Ionicons_1.default name="globe-outline" size={12} color={colors.grey3}/>
                <react_native_1.Text style={styles.websiteText}>{profile.website}</react_native_1.Text>
              </react_native_1.View>)}

            {(profile === null || profile === void 0 ? void 0 : profile.about) && <react_native_1.Text style={styles.aboutText}>{profile.about}</react_native_1.Text>}
          </react_native_1.View>
        </react_native_1.View>

        {/* Action buttons (message/send payment) - hidden when viewing own profile */}
        {!isOwnProfile && (<react_native_1.View style={styles.actionsContainer}>
            <react_native_1.View style={styles.iconBtnContainer}>
              <react_native_1.TouchableOpacity style={[styles.iconButton, styles.messageButton]} onPress={handleStartChat} activeOpacity={0.5}>
                <chat_svg_1.default color="#FFFFFF" width={30} height={30}/>
              </react_native_1.TouchableOpacity>
              <react_native_1.Text style={styles.iconBtnLabel}>{LL.Nostr.Contacts.message()}</react_native_1.Text>
            </react_native_1.View>

            <react_native_1.View style={styles.iconBtnContainer}>
              <react_native_1.TouchableOpacity style={[styles.iconButton, styles.sendButton]} onPress={handleSendPayment} activeOpacity={0.5}>
                <arrow_up_svg_1.default color="#FFFFFF" width={30} height={30}/>
              </react_native_1.TouchableOpacity>
              <react_native_1.Text style={styles.iconBtnLabel}>{LL.Nostr.Contacts.sendPayment()}</react_native_1.Text>
            </react_native_1.View>
          </react_native_1.View>)}
        <react_native_1.View style={styles.postsSection}>
          <react_native_1.View style={styles.postsSectionHeader}>
            <react_native_1.Text style={[styles.sectionTitle, { color: colors.black }]}>
              {isBusiness ? "Business Updates" : "Recent Posts"}
            </react_native_1.Text>
            {posts.length > 0 && (<react_native_1.Text style={[styles.postsCount, { color: colors.grey3 }]}>
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </react_native_1.Text>)}
          </react_native_1.View>
          {loadingPosts ? (<react_native_1.View style={styles.loadingContainer}>
              <react_native_1.ActivityIndicator size="small" color={colors.primary}/>
              <react_native_1.Text style={[styles.loadingText, { color: colors.grey3 }]}>
                Loading...
              </react_native_1.Text>
            </react_native_1.View>) : posts.length === 0 ? (<react_native_1.View style={styles.emptyPostsContainer}>
              <Ionicons_1.default name={isBusiness ? "storefront-outline" : "chatbubble-outline"} size={48} color={colors.grey3} style={{ marginBottom: 8 }}/>
              <react_native_1.Text style={[styles.emptyPostsText, { color: colors.grey3 }]}>
                {isBusiness ? "No business updates yet" : "No posts yet"}
              </react_native_1.Text>
              <react_native_1.TouchableOpacity style={[styles.makePostCTA, { backgroundColor: colors.grey5 }]} onPress={() => navigation.navigate("makeNostrPost")} activeOpacity={0.7}>
                <Ionicons_1.default name="create-outline" size={24} color={colors.primary} style={{ marginRight: 12 }}/>
                <react_native_1.View style={styles.makePostTextContainer}>
                  <react_native_1.Text style={[styles.makePostTitle, { color: colors.black }]}>
                    {LL.NostrQuickStart.postHeading()}
                  </react_native_1.Text>
                  <react_native_1.Text style={[styles.makePostDesc, { color: colors.grey3 }]}>
                    {LL.NostrQuickStart.postDesc()}
                  </react_native_1.Text>
                </react_native_1.View>
                <Ionicons_1.default name="chevron-forward" size={20} color={colors.grey3}/>
              </react_native_1.TouchableOpacity>
            </react_native_1.View>) : (<>
              {posts.map((post) => {
                var _a;
                return (<FeedItem_1.FeedItem key={post.id} event={post} profile={profile} compact repostedEvent={post.kind === 6 ? repostedEvents.get(post.id) : undefined} repostedProfile={post.kind === 6
                        ? repostedProfiles.get(((_a = post.tags.find((tag) => tag[0] === "p")) === null || _a === void 0 ? void 0 : _a[1]) || "")
                        : undefined}/>);
            })}
            </>)}

          {/* Explainer video */}
          <explainer_video_1.ExplainerVideo videoUrl="https://blossom.primal.net/f0d613b379e9855f32822a7286605b0fad32d79ea5b81ed23cf9cdda1da461ef.mp4 " title="What is nostr?" style={styles.explainerVideo}/>

          {/* CTA button to explore full Nostr experience on Primal */}
          <react_native_1.TouchableOpacity style={[styles.primalButton]} onPress={() => react_native_2.Linking.openURL(`https://primal.net/p/${userPubkey}`)} activeOpacity={0.8}>
            <react_native_linear_gradient_1.default colors={["#FF6154", "#FE9F41"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primalButtonGradient}>
              <react_native_1.View style={styles.primalButtonContent}>
                <react_native_1.View style={styles.primalLogoContainer}>
                  <react_native_1.Image source={require("@app/assets/images/primal-logo-large.png")} style={styles.primalLogo} resizeMode="contain"/>
                </react_native_1.View>
                <react_native_1.View style={styles.primalTextContainer}>
                  <react_native_1.Text style={styles.primalTitle}>Explore more on Primal</react_native_1.Text>
                  <react_native_1.Text style={styles.primalSubtitle}>
                    Full Nostr experience with feeds, notifications & more
                  </react_native_1.Text>
                </react_native_1.View>
                <react_native_1.View style={styles.primalArrowContainer}>
                  <Ionicons_1.default name="arrow-forward" size={22} color="#FFFFFF"/>
                </react_native_1.View>
              </react_native_1.View>
            </react_native_linear_gradient_1.default>
          </react_native_1.TouchableOpacity>
        </react_native_1.View>
        {selfPubkey !== contactPubkey ? (<react_native_1.View style={[styles.dangerZoneContainer, { borderTopColor: colors.grey5 }]}>
            <react_native_1.Text style={[styles.dangerZoneTitle, { color: colors.black }]}>
              {LL.Nostr.Contacts.contactManagement()}
            </react_native_1.Text>
            <react_native_1.TouchableOpacity style={[styles.unfollowButton, { backgroundColor: colors.error }]} onPress={handleUnfollow}>
              <Ionicons_1.default name="remove-circle" style={[styles.icon, { color: "white" }]}/>
              <react_native_1.Text style={[{ color: "white" }]}>
                {LL.Nostr.Contacts.unfollowContact()}
              </react_native_1.Text>
            </react_native_1.TouchableOpacity>
          </react_native_1.View>) : null}
      </react_native_1.ScrollView>

      {/* Floating Action Button to create new post - only shown when user has posts */}
      {posts.length > 0 && (<react_native_1.TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate("makeNostrPost")} activeOpacity={0.8}>
          <Ionicons_1.default name="create" size={24} color="#FFFFFF"/>
        </react_native_1.TouchableOpacity>)}
    </screen_1.Screen>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    headerContainer: {
        borderBottomWidth: 2,
        shadowColor: colors.grey5,
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    scrollView: {
        flex: 1,
    },
    bannerImage: {
        width: "100%",
        height: 150,
        backgroundColor: colors.grey5,
    },
    profileContainer: {
        paddingHorizontal: 16,
    },
    profileImageWrapper: {
        marginTop: -40,
        marginBottom: 12,
    },
    profileImage: {
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 4,
        borderColor: colors.background,
        backgroundColor: colors.grey5,
    },
    profileInfoSection: {
        paddingBottom: 12,
    },
    nameRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
    },
    businessBadge: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#60aa55",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 3,
    },
    businessBadgeText: {
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: "600",
    },
    profileName: {
        fontSize: 20,
        fontWeight: "bold",
        color: colors.black,
    },
    profileNpub: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginBottom: 3,
    },
    npubText: {
        fontSize: 12,
        color: "#888",
    },
    profileLud16: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        marginBottom: 3,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: "rgba(255, 165, 0, 0.1)",
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    lud16Text: {
        fontSize: 12,
        fontWeight: "500",
        color: colors.grey1,
    },
    profileWebsite: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    websiteText: {
        fontSize: 12,
        color: colors.grey3,
    },
    aboutText: {
        fontSize: 14,
        paddingTop: 8,
        lineHeight: 20,
        color: colors.grey1,
    },
    actionsContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 12,
        paddingVertical: 8,
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
    editIconButton: {
        marginLeft: 6,
        padding: 2,
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
    explainerVideo: {
        marginTop: 16,
        marginHorizontal: 8,
        marginBottom: 8,
    },
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
}));
exports.default = ContactDetailsScreen;
//# sourceMappingURL=contactDetailsScreen.js.map