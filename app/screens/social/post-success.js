"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const redux_1 = require("@app/store/redux");
const react_native_linear_gradient_1 = __importDefault(require("react-native-linear-gradient"));
const FeedItem_1 = require("@app/components/nostr-feed/FeedItem");
const nostr_tools_1 = require("nostr-tools");
const utils_1 = require("@noble/hashes/utils");
const nostr_1 = require("@app/utils/nostr");
const chatContext_1 = require("../chat/chatContext");
const PostSuccess = () => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const route = (0, native_1.useRoute)();
    const { theme } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { userData } = (0, redux_1.useAppSelector)((state) => state.user);
    const { postContent, userNpub, event } = route.params;
    const handleViewProfile = async () => {
        const privateKey = await (0, nostr_1.getSecretKey)();
        if (!privateKey)
            return;
        const pubkey = extractPubkey(userNpub);
        navigation.navigate("contactDetails", {
            contactPubkey: pubkey,
            userPrivateKey: (0, utils_1.bytesToHex)(privateKey),
        });
    };
    const { profileMap } = (0, chatContext_1.useChatContext)();
    // Extract npub from userNpub string if it's in nip19 format
    const extractPubkey = (npubString) => {
        try {
            if (npubString.startsWith("npub")) {
                const decoded = nostr_tools_1.nip19.decode(npubString);
                return decoded.data;
            }
            return npubString;
        }
        catch (e) {
            return npubString;
        }
    };
    const profile = profileMap === null || profileMap === void 0 ? void 0 : profileMap.get(extractPubkey(userNpub));
    const handlePrimalClick = () => {
        react_native_1.Linking.openURL(`https://primal.net/e/${nostr_tools_1.nip19.neventEncode(Object.assign(Object.assign({}, event), { relays: [
                "wss://relay.damus.io",
                "wss://relay.primal.net",
                "wss://relay.snort.social",
            ] }))}`);
    };
    return (<react_native_1.View style={[styles.container, { backgroundColor: theme.colors.grey5 }]}>
      <react_native_linear_gradient_1.default colors={["#60aa55", "#4a9044", "#357233"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerGradient}>
        <react_native_1.View style={styles.headerContent}>
          <react_native_1.View style={styles.successIconContainer}>
            <Ionicons_1.default name="checkmark-circle" size={60} color="#FFFFFF"/>
          </react_native_1.View>
          <themed_1.Text style={styles.headerTitle}>{LL.Social.postSuccessTitle()}</themed_1.Text>
          <themed_1.Text style={styles.headerSubtitle}>{LL.Social.postSuccessSubtitle()}</themed_1.Text>
        </react_native_1.View>
      </react_native_linear_gradient_1.default>

      <react_native_1.ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Post Preview using FeedItem */}
        <react_native_1.View style={styles.postCardWrapper}>
          <FeedItem_1.FeedItem event={event} profile={profile} compact={false}/>
        </react_native_1.View>

        {/* Primal CTA Button */}
        <react_native_1.TouchableOpacity style={styles.primalButton} onPress={handlePrimalClick} activeOpacity={0.8}>
          <react_native_linear_gradient_1.default colors={["#FF6154", "#FE9F41"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primalButtonGradient}>
            <react_native_1.View style={styles.primalButtonContent}>
              <react_native_1.View style={styles.primalLogoContainer}>
                <react_native_1.Image source={require("@app/assets/images/primal-logo-large.png")} style={styles.primalLogo} resizeMode="contain"/>
              </react_native_1.View>
              <react_native_1.View style={styles.primalTextContainer}>
                <themed_1.Text style={styles.primalTitle}>Explore more on Primal</themed_1.Text>
                <themed_1.Text style={styles.primalSubtitle}>
                  Full Nostr experience with feeds, notifications & more
                </themed_1.Text>
              </react_native_1.View>
              <react_native_1.View style={styles.primalArrowContainer}>
                <Ionicons_1.default name="arrow-forward" size={22} color="#FFFFFF"/>
              </react_native_1.View>
            </react_native_1.View>
          </react_native_linear_gradient_1.default>
        </react_native_1.TouchableOpacity>

        {/* View Profile Button */}
        <react_native_1.TouchableOpacity style={[styles.viewProfileButton, { backgroundColor: theme.colors.grey5 }]} onPress={handleViewProfile} activeOpacity={0.8}>
          <Ionicons_1.default name="person-outline" size={20} color={theme.colors.primary}/>
          <themed_1.Text style={[styles.viewProfileText, { color: theme.colors.black }]}>
            Show Recent Posts
          </themed_1.Text>
          <Ionicons_1.default name="chevron-forward" size={20} color={theme.colors.grey3}/>
        </react_native_1.TouchableOpacity>

        <react_native_1.TouchableOpacity onPress={() => navigation.navigate("Primary", { screen: "Home" })} style={styles.backHomeButton}>
          <themed_1.Text style={[styles.backHomeText, { color: theme.colors.grey3 }]}>
            {LL.common.backHome()}
          </themed_1.Text>
        </react_native_1.TouchableOpacity>
      </react_native_1.ScrollView>
    </react_native_1.View>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flex: 1,
    },
    headerGradient: {
        paddingTop: 60,
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    headerContent: {
        alignItems: "center",
    },
    successIconContainer: {
        marginBottom: 16,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: "bold",
        color: "#FFFFFF",
        marginBottom: 8,
        textAlign: "center",
    },
    headerSubtitle: {
        fontSize: 16,
        color: "rgba(255, 255, 255, 0.9)",
        textAlign: "center",
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 30,
    },
    postCardWrapper: {
        marginBottom: 24,
    },
    primalButton: {
        borderRadius: 16,
        overflow: "hidden",
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
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
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#FFFFFF",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
    },
    primalLogo: {
        width: 50,
        height: 50,
        borderRadius: 20,
    },
    primalTextContainer: {
        flex: 1,
    },
    primalTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: "#FFFFFF",
        marginBottom: 4,
    },
    primalSubtitle: {
        fontSize: 13,
        color: "rgba(255, 255, 255, 0.95)",
        lineHeight: 18,
    },
    primalArrowContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    viewProfileButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    viewProfileText: {
        flex: 1,
        fontSize: 16,
        fontWeight: "600",
        marginLeft: 12,
    },
    backHomeButton: {
        paddingVertical: 12,
        alignItems: "center",
    },
    backHomeText: {
        fontSize: 16,
        textDecorationLine: "underline",
    },
}));
exports.default = PostSuccess;
//# sourceMappingURL=post-success.js.map