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
exports.FeedItem = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const nostr_tools_1 = require("nostr-tools");
const react_native_linear_gradient_1 = __importDefault(require("react-native-linear-gradient"));
const react_native_video_1 = __importDefault(require("react-native-video"));
const CARIBBEAN_COLORS = {
    sunsetOrange: "#FF6B35",
    oceanBlue: "#00B4D8",
    tropicalGreen: "#06D6A0",
    coralPink: "#FF8FAB",
    sunYellow: "#FFD23F",
    deepSea: "#023E8A",
    sandBeige: "#F4E8C1",
    palmGreen: "#2D6A4F",
};
// Component for rendering individual Nostr posts with support for text, media, reposts, and invoices
const FeedItem = ({ event, profile, compact = false, repostedEvent, repostedProfile, }) => {
    const styles = useStyles();
    const { theme } = (0, themed_1.useTheme)();
    const [selectedImage, setSelectedImage] = (0, react_1.useState)(null);
    const [selectedVideo, setSelectedVideo] = (0, react_1.useState)(null);
    // Safety check for required event properties
    if (!event || !event.pubkey || !event.created_at || !event.content) {
        console.error("FeedItem: Invalid event object", event);
        return null;
    }
    // Handle reposts (kind 6) by displaying the embedded event and original author's profile
    const isRepost = event.kind === 6;
    const displayEvent = isRepost && repostedEvent ? repostedEvent : event;
    const displayProfile = isRepost && repostedProfile ? repostedProfile : profile;
    const formatTimestamp = (timestamp) => {
        try {
            const now = Math.floor(Date.now() / 1000);
            const diff = now - timestamp;
            if (diff < 60)
                return "just now";
            if (diff < 3600)
                return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400)
                return `${Math.floor(diff / 3600)}h ago`;
            if (diff < 604800)
                return `${Math.floor(diff / 86400)}d ago`;
            return new Date(timestamp * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            });
        }
        catch (e) {
            console.error("Error formatting timestamp:", e);
            return "recently";
        }
    };
    const displayName = (() => {
        try {
            return ((displayProfile === null || displayProfile === void 0 ? void 0 : displayProfile.name) || nostr_tools_1.nip19.npubEncode(displayEvent.pubkey).slice(0, 12) + "...");
        }
        catch (e) {
            console.error("Error encoding displayName:", e);
            return "Nostr User";
        }
    })();
    const reposterName = (() => {
        if (!isRepost)
            return null;
        try {
            return (profile === null || profile === void 0 ? void 0 : profile.name) || nostr_tools_1.nip19.npubEncode(event.pubkey).slice(0, 12) + "...";
        }
        catch (e) {
            console.error("Error encoding reposterName:", e);
            return "Nostr User";
        }
    })();
    const gradients = [
        [CARIBBEAN_COLORS.sunsetOrange, CARIBBEAN_COLORS.coralPink],
        [CARIBBEAN_COLORS.oceanBlue, CARIBBEAN_COLORS.tropicalGreen],
        [CARIBBEAN_COLORS.sunYellow, CARIBBEAN_COLORS.sunsetOrange],
        [CARIBBEAN_COLORS.deepSea, CARIBBEAN_COLORS.oceanBlue],
        [CARIBBEAN_COLORS.palmGreen, CARIBBEAN_COLORS.tropicalGreen],
    ];
    const gradientIndex = (() => {
        try {
            const idSlice = displayEvent.id.slice(0, 8);
            const parsed = parseInt(idSlice, 16);
            if (isNaN(parsed)) {
                console.log("Invalid hex in event id, using default gradient");
                return 0;
            }
            return parsed % gradients.length;
        }
        catch (e) {
            console.error("Error calculating gradientIndex:", e);
            return 0;
        }
    })();
    const selectedGradient = gradients[gradientIndex] || gradients[0];
    // Extract media URLs (images/videos) and lightning invoices (LNURL/lnbc) from post content
    const extractMediaAndInvoices = (content) => {
        try {
            const imageRegex = /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?[^\s]*)?/gi;
            const videoRegex = /https?:\/\/\S+\.(mp4|mov|webm|avi)(\?[^\s]*)?/gi;
            const imageHostRegex = /https?:\/\/(i\.)?nostr\.build\/\S+|https?:\/\/image\.nostr\.build\/\S+|https?:\/\/void\.cat\/\S+|https?:\/\/i\.imgur\.com\/\S+/gi;
            const lnurlRegex = /(lnurl[a-zA-Z0-9]+)/gi;
            const lightningInvoiceRegex = /(lnbc[a-zA-Z0-9]+)/gi;
            let images = content.match(imageRegex) || [];
            const imageHosts = content.match(imageHostRegex) || [];
            images = [...images, ...imageHosts];
            const videos = content.match(videoRegex) || [];
            const lnurls = content.match(lnurlRegex) || [];
            const invoices = content.match(lightningInvoiceRegex) || [];
            let textContent = content;
            images.forEach((img) => (textContent = textContent.replace(img, "")));
            videos.forEach((vid) => (textContent = textContent.replace(vid, "")));
            lnurls.forEach((lnurl) => (textContent = textContent.replace(lnurl, "")));
            invoices.forEach((inv) => (textContent = textContent.replace(inv, "")));
            return {
                text: textContent.trim(),
                images: [...new Set(images)],
                videos,
                lnurls,
                invoices,
            };
        }
        catch (e) {
            console.error("Error extracting media and invoices:", e);
            return {
                text: content,
                images: [],
                videos: [],
                lnurls: [],
                invoices: [],
            };
        }
    };
    const media = extractMediaAndInvoices(displayEvent.content);
    // Parse Nostr references (npub, note, nevent, nprofile) found in post content
    const parseNostrReference = (ref) => {
        try {
            const cleanRef = ref.replace("nostr:", "");
            const decoded = nostr_tools_1.nip19.decode(cleanRef);
            if (decoded.type === "npub") {
                return { type: "user", id: decoded.data };
            }
            else if (decoded.type === "note") {
                return { type: "note", id: decoded.data };
            }
            else if (decoded.type === "nevent") {
                const data = decoded.data;
                return { type: "event", id: data.id, author: data.author, relays: data.relays };
            }
            else if (decoded.type === "nprofile") {
                const data = decoded.data;
                return { type: "profile", pubkey: data.pubkey, relays: data.relays };
            }
        }
        catch (e) {
            console.error("Error parsing nostr reference", e);
        }
        return null;
    };
    const linkifyText = (text) => {
        try {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const nostrMentionRegex = /(nostr:)?(npub1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+|nprofile1[a-zA-Z0-9]+)/g;
            const combinedRegex = new RegExp(`${urlRegex.source}|${nostrMentionRegex.source}`, "g");
            const parts = text.split(combinedRegex).filter(Boolean);
            return parts.map((part, index) => {
                try {
                    if (part === "nostr:") {
                        return null;
                    }
                    if (urlRegex.test(part) && !part.match(/^(npub|note|nevent|nprofile)/)) {
                        return (<themed_1.Text key={index} style={{ color: theme.colors.primary }} onPress={() => react_native_1.Linking.openURL(part)}>
                {part}
              </themed_1.Text>);
                    }
                    else if (part.match(/^(npub1|note1|nevent1|nprofile1)/)) {
                        const refData = parseNostrReference(part);
                        const displayText = part.slice(0, 8) + "..." + part.slice(-4);
                        return (<themed_1.Text key={index} style={{ color: "#60aa55", fontWeight: "600" }}>
                @{displayText}
              </themed_1.Text>);
                    }
                    return <themed_1.Text key={index}>{part}</themed_1.Text>;
                }
                catch (e) {
                    console.error("Error in linkifyText map for part:", part, e);
                    return <themed_1.Text key={index}>{part}</themed_1.Text>;
                }
            });
        }
        catch (e) {
            console.error("Error in linkifyText:", e);
            return <themed_1.Text>{text}</themed_1.Text>;
        }
    };
    const handleInvoicePress = (invoice) => {
        react_native_1.Linking.openURL(`lightning:${invoice}`);
    };
    try {
        return (<react_native_1.View style={styles.containerWrapper}>
        <react_native_linear_gradient_1.default colors={selectedGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.accentBar}/>

        <react_native_1.View style={styles.container}>
          {isRepost && reposterName && (<react_native_1.View style={styles.repostHeader}>
              <Ionicons_1.default name="repeat" size={14} color="#60aa55"/>
              <themed_1.Text style={styles.repostText}>{reposterName} reposted</themed_1.Text>
            </react_native_1.View>)}

          <react_native_1.View style={styles.header}>
            <react_native_linear_gradient_1.default colors={selectedGradient} style={styles.avatarGradientBorder}>
              <react_native_1.View style={styles.avatarInner}>
                <themed_1.Avatar size={36} rounded source={(displayProfile === null || displayProfile === void 0 ? void 0 : displayProfile.picture) ? { uri: displayProfile.picture } : undefined} title={!(displayProfile === null || displayProfile === void 0 ? void 0 : displayProfile.picture)
                ? displayName.charAt(0).toUpperCase()
                : undefined} containerStyle={!(displayProfile === null || displayProfile === void 0 ? void 0 : displayProfile.picture)
                ? { backgroundColor: selectedGradient[0] }
                : undefined}/>
              </react_native_1.View>
            </react_native_linear_gradient_1.default>
            <react_native_1.View style={styles.userInfo}>
              <themed_1.Text style={styles.username}>{displayName}</themed_1.Text>
              <react_native_1.View style={styles.timestampContainer}>
                <Ionicons_1.default name="time-outline" size={12} color={CARIBBEAN_COLORS.oceanBlue} style={{ marginRight: 4 }}/>
                <themed_1.Text style={styles.timestamp}>
                  {formatTimestamp(displayEvent.created_at)}
                </themed_1.Text>
              </react_native_1.View>
            </react_native_1.View>
          </react_native_1.View>

          <react_native_1.View style={compact ? styles.contentCompact : styles.content}>
            {media.text && (<themed_1.Text style={styles.contentText} numberOfLines={compact ? 3 : undefined}>
                {linkifyText(media.text)}
              </themed_1.Text>)}

            {media.images.length > 0 && (<react_native_1.View style={styles.mediaContainer}>
                {media.images.slice(0, compact ? 1 : 4).map((imageUrl, index) => (<react_native_1.TouchableOpacity key={index} onPress={() => setSelectedImage(imageUrl)} style={styles.imageWrapper}>
                    <react_native_1.Image source={{ uri: imageUrl }} style={compact ? styles.mediaImageCompact : styles.mediaImage} resizeMode="cover"/>
                  </react_native_1.TouchableOpacity>))}
                {compact && media.images.length > 1 && (<themed_1.Text style={styles.moreImagesText}>
                    +{media.images.length - 1} more
                  </themed_1.Text>)}
              </react_native_1.View>)}

            {media.videos.length > 0 && (<react_native_1.View style={styles.mediaContainer}>
                {media.videos
                    .slice(0, compact ? 1 : media.videos.length)
                    .map((videoUrl, index) => (<react_native_1.TouchableOpacity key={index} onPress={() => setSelectedVideo(videoUrl)} style={styles.videoWrapper}>
                      <react_native_1.View style={compact
                        ? styles.videoPlaceholderCompact
                        : styles.videoPlaceholder}>
                        <Ionicons_1.default name="play-circle" size={compact ? 32 : 48} color={theme.colors.grey3}/>
                        {!compact && <themed_1.Text style={styles.videoText}>Video</themed_1.Text>}
                      </react_native_1.View>
                    </react_native_1.TouchableOpacity>))}
              </react_native_1.View>)}

            {!compact && (media.invoices.length > 0 || media.lnurls.length > 0) && (<react_native_1.View style={styles.invoiceContainer}>
                {media.invoices.map((invoice, index) => (<react_native_1.TouchableOpacity key={index} style={styles.invoiceButton} onPress={() => handleInvoicePress(invoice)}>
                    <Ionicons_1.default name="flash" size={20} color="#FF8C42"/>
                    <themed_1.Text style={styles.invoiceText}>Pay Lightning Invoice</themed_1.Text>
                    <Ionicons_1.default name="open-outline" size={16} color={theme.colors.grey3}/>
                  </react_native_1.TouchableOpacity>))}
                {media.lnurls.map((lnurl, index) => (<react_native_1.TouchableOpacity key={index} style={styles.invoiceButton} onPress={() => react_native_1.Linking.openURL(`lightning:${lnurl}`)}>
                    <Ionicons_1.default name="flash" size={20} color="#60aa55"/>
                    <themed_1.Text style={styles.invoiceText}>Zap Request</themed_1.Text>
                    <Ionicons_1.default name="open-outline" size={16} color={theme.colors.grey3}/>
                  </react_native_1.TouchableOpacity>))}
              </react_native_1.View>)}
          </react_native_1.View>
        </react_native_1.View>

        {/* Image Modal */}
        <react_native_1.Modal visible={selectedImage !== null} transparent={true} onRequestClose={() => setSelectedImage(null)} animationType="fade">
          <react_native_1.View style={styles.modalContainer}>
            <react_native_1.TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedImage(null)}>
              <Ionicons_1.default name="close" size={32} color="#FFFFFF"/>
            </react_native_1.TouchableOpacity>
            <react_native_1.ScrollView contentContainerStyle={styles.modalScrollContent} maximumZoomScale={3} minimumZoomScale={1}>
              {selectedImage && (<react_native_1.Image source={{ uri: selectedImage }} style={styles.modalImage} resizeMode="contain"/>)}
            </react_native_1.ScrollView>
          </react_native_1.View>
        </react_native_1.Modal>

        {/* Video Modal */}
        <react_native_1.Modal visible={selectedVideo !== null} transparent={true} onRequestClose={() => setSelectedVideo(null)} animationType="fade">
          <react_native_1.View style={styles.modalContainer}>
            <react_native_1.TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedVideo(null)}>
              <Ionicons_1.default name="close" size={32} color="#FFFFFF"/>
            </react_native_1.TouchableOpacity>
            {selectedVideo && (<react_native_1.View style={styles.videoPlayerContainer}>
                <react_native_video_1.default source={{ uri: selectedVideo }} style={styles.videoPlayer} controls={true} resizeMode="contain" paused={false} onError={(error) => console.error("Video error:", error)}/>
              </react_native_1.View>)}
          </react_native_1.View>
        </react_native_1.Modal>
      </react_native_1.View>);
    }
    catch (e) {
        console.error("Error rendering FeedItem:", e);
        console.error("Error stack:", e.stack);
        return (<react_native_1.View style={styles.containerWrapper}>
        <themed_1.Text style={{ padding: 20, color: "red" }}>Error displaying post</themed_1.Text>
      </react_native_1.View>);
    }
};
exports.FeedItem = FeedItem;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
        width: react_native_1.Dimensions.get("window").width,
        height: react_native_1.Dimensions.get("window").height,
    },
    videoPlayerContainer: {
        width: react_native_1.Dimensions.get("window").width,
        height: react_native_1.Dimensions.get("window").height * 0.6,
        justifyContent: "center",
        alignItems: "center",
    },
    videoPlayer: {
        width: "100%",
        height: "100%",
    },
}));
//# sourceMappingURL=FeedItem.js.map