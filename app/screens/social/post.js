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
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const react_native_image_picker_1 = require("react-native-image-picker");
const native_1 = require("@react-navigation/native");
const buttons_1 = require("@app/components/buttons");
const i18n_react_1 = require("@app/i18n/i18n-react");
const persistent_state_1 = require("@app/store/persistent-state");
const explainer_video_1 = require("@app/components/explainer-video");
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const pool_1 = require("@app/utils/nostr/pool");
const publish_helpers_1 = require("@app/utils/nostr/publish-helpers");
// Get appropriate relays for note publishing
const RELAYS = (0, publish_helpers_1.getPublishingRelays)("note");
const FIXED_TEXT_LINE = "This is your first post using Flash! For only your first post, we add this to the end: \n\n";
const FIXED_TEXT_LINE_2 = "#introductions";
const FIXED_TEXT_LINE_3 = "If you would like to remove the Flash credit from this post, uncheck the box below.";
const MakeNostrPost = ({ privateKey }) => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { theme } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [userText, setUserText] = (0, react_1.useState)("");
    const [inputHeight, setInputHeight] = (0, react_1.useState)(40);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [selectedImages, setSelectedImages] = (0, react_1.useState)([]);
    const [selectedVideo, setSelectedVideo] = (0, react_1.useState)(null);
    const [uploadingImages, setUploadingImages] = (0, react_1.useState)(false);
    const [includeFlashCredit, setIncludeFlashCredit] = (0, react_1.useState)(true);
    const FIXED_TEXT_LINE_1 = LL.Social.flashAppCredit();
    const isFirstPost = !persistentState.hasPostedToNostr;
    const onContentSizeChange = (event) => {
        setInputHeight(event.nativeEvent.contentSize.height);
    };
    // Generate NIP-98 auth header
    const generateNIP98AuthHeader = async (url, method) => {
        try {
            const privateKey = await (0, nostr_1.getSecretKey)();
            if (!privateKey)
                throw Error;
            const publicKey = (0, nostr_tools_1.getPublicKey)(privateKey);
            const authEvent = {
                kind: 27235,
                pubkey: publicKey,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ["u", url],
                    ["method", method],
                ],
                content: "",
            };
            const signedAuthEvent = await (0, nostr_tools_1.finalizeEvent)(authEvent, privateKey);
            const encodedAuth = btoa(JSON.stringify(signedAuthEvent));
            return `Nostr ${encodedAuth}`;
        }
        catch (error) {
            console.error("Error generating NIP-98 auth:", error);
            throw error;
        }
    };
    // Upload media to nostr.build with NIP-98 authentication
    const uploadMediaToNostrBuild = async (mediaUri, isVideo = false) => {
        try {
            console.log("Uploading media to nostr.build:", mediaUri, "isVideo:", isVideo);
            const uploadUrl = "https://nostr.build/api/v2/upload/files";
            const authHeader = await generateNIP98AuthHeader(uploadUrl, "POST");
            const formData = new FormData();
            formData.append("file", {
                uri: mediaUri,
                type: isVideo ? "video/mp4" : "image/jpeg",
                name: isVideo ? "video.mp4" : "photo.jpg",
            });
            const response = await fetch(uploadUrl, {
                method: "POST",
                body: formData,
                headers: {
                    Authorization: authHeader,
                },
            });
            console.log("Upload response status:", response.status);
            const data = await response.json();
            console.log("Upload response data:", JSON.stringify(data, null, 2));
            if (data.status === "success" && data.data && data.data.length > 0) {
                // nostr.build API v2 returns an array of objects with url property
                const uploadedUrl = data.data[0].url;
                console.log("Extracted URL:", uploadedUrl);
                return uploadedUrl;
            }
            console.log("Upload failed: no URL found in response");
            return null;
        }
        catch (error) {
            console.error("Error uploading media:", error);
            react_native_1.Alert.alert("Upload Error", "Failed to upload media. Please try again.");
            return null;
        }
    };
    const handleAddImage = () => {
        (0, react_native_image_picker_1.launchImageLibrary)({
            mediaType: "photo",
            selectionLimit: 4,
            quality: 0.8,
        }, async (response) => {
            if (response.didCancel) {
                return;
            }
            if (response.errorCode) {
                react_native_1.Alert.alert("Error", response.errorMessage || "Failed to select image");
                return;
            }
            if (response.assets && response.assets.length > 0) {
                const uris = response.assets
                    .map((asset) => asset.uri)
                    .filter(Boolean);
                setSelectedImages(uris);
            }
        });
    };
    const handleRemoveImage = (index) => {
        setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    };
    const handleRecordVideo = () => {
        (0, react_native_image_picker_1.launchCamera)({
            mediaType: "video",
            videoQuality: "medium",
            durationLimit: 60, // 60 seconds max
        }, async (response) => {
            if (response.didCancel) {
                return;
            }
            if (response.errorCode) {
                react_native_1.Alert.alert("Error", response.errorMessage || "Failed to record video");
                return;
            }
            if (response.assets && response.assets.length > 0 && response.assets[0].uri) {
                setSelectedVideo(response.assets[0].uri);
                // Clear images when video is selected
                setSelectedImages([]);
            }
        });
    };
    const handleRemoveVideo = () => {
        setSelectedVideo(null);
    };
    const handleTakePicture = () => {
        (0, react_native_image_picker_1.launchCamera)({
            mediaType: "photo",
            quality: 0.8,
            saveToPhotos: false,
        }, async (response) => {
            if (response.didCancel) {
                return;
            }
            if (response.errorCode) {
                react_native_1.Alert.alert("Error", response.errorMessage || "Failed to take picture");
                return;
            }
            if (response.assets && response.assets.length > 0 && response.assets[0].uri) {
                // Clear video if any
                setSelectedVideo(null);
            }
        });
    };
    // Extract hashtags from content and create t tags
    const extractHashtags = (content) => {
        // Match hashtags: #word including at start of string, after space, or after newline
        // But not inside URLs
        const hashtags = new Set();
        const regex = /(^|\s)#([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            // Add the hashtag without the # symbol, converted to lowercase
            hashtags.add(match[2].toLowerCase());
        }
        return Array.from(hashtags);
    };
    const publishNostrNote = async (content) => {
        try {
            setLoading(true);
            const privateKey = await (0, nostr_1.getSecretKey)();
            if (!privateKey) {
                react_native_1.Alert.alert("Your nostr key is not yet set.");
                setLoading(false);
                return;
            }
            let finalContent = content;
            // Upload media if any are selected
            if (selectedImages.length > 0 || selectedVideo) {
                setUploadingImages(true);
                try {
                    const uploadedUrls = [];
                    console.log("Starting media upload. Images:", selectedImages.length, "Video:", !!selectedVideo);
                    // Upload images
                    for (const imageUri of selectedImages) {
                        console.log("Uploading image:", imageUri);
                        const url = await uploadMediaToNostrBuild(imageUri, false);
                        if (url) {
                            console.log("Image uploaded successfully:", url);
                            uploadedUrls.push(url);
                        }
                        else {
                            console.log("Image upload failed");
                        }
                    }
                    // Upload video
                    if (selectedVideo) {
                        console.log("Uploading video:", selectedVideo);
                        const url = await uploadMediaToNostrBuild(selectedVideo, true);
                        if (url) {
                            console.log("Video uploaded successfully:", url);
                            uploadedUrls.push(url);
                        }
                        else {
                            console.log("Video upload failed");
                        }
                    }
                    console.log("Total uploaded URLs:", uploadedUrls.length);
                    if (uploadedUrls.length > 0) {
                        finalContent = content + "\n\n" + uploadedUrls.join("\n");
                        console.log("Final content with media:", finalContent);
                    }
                    else if (selectedImages.length > 0 || selectedVideo) {
                        // Only show alert if we actually tried to upload media
                        react_native_1.Alert.alert("Upload Failed", "Media upload failed. Posting without media.");
                    }
                }
                catch (uploadError) {
                    console.error("Error during media upload:", uploadError);
                    react_native_1.Alert.alert("Upload Error", "Failed to upload media. Posting without media.");
                }
                finally {
                    setUploadingImages(false);
                }
            }
            const pubkey = (0, nostr_tools_1.getPublicKey)(privateKey);
            // Extract hashtags and create t tags
            const hashtags = extractHashtags(finalContent);
            const tags = hashtags.map((tag) => ["t", tag]);
            console.log("Extracted hashtags:", hashtags);
            console.log("Created tags:", tags);
            const event = {
                kind: 1,
                pubkey,
                created_at: Math.floor(Date.now() / 1000),
                tags: tags,
                content: finalContent,
            };
            const signedEvent = await (0, nostr_tools_1.finalizeEvent)(event, privateKey);
            console.log("Publishing kind-1 note to relays...");
            console.log("Author pubkey:", pubkey);
            console.log("Event ID:", signedEvent.id);
            // Use the new helper for reliable publishing
            const publishResult = await (0, publish_helpers_1.publishEventToRelays)(pool_1.pool, signedEvent, RELAYS, "Note (kind-1)");
            if (publishResult.successCount === 0) {
                throw new Error("Failed to publish note to any relay");
            }
            console.log(`✅ Note successfully published to ${publishResult.successCount}/${RELAYS.length} relays`);
            // Mark that user has posted to Nostr
            updateState((state) => {
                if (state) {
                    return Object.assign(Object.assign({}, state), { hasPostedToNostr: true });
                }
                return undefined;
            });
            // Navigate to success screen
            const npub = nostr_tools_1.nip19.npubEncode(pubkey);
            navigation.replace("postSuccess", {
                postContent: finalContent,
                userNpub: npub,
                event: signedEvent,
            });
        }
        catch (e) {
            console.error("Error posting Nostr note:", e);
            react_native_1.Alert.alert(LL.Social.errorPostFailed());
            setLoading(false);
        }
    };
    const onPost = async () => {
        if (loading) {
            console.log("Already posting, ignoring duplicate press");
            return;
        }
        // Only add #introductions hashtag on first post and if checkbox is checked
        const shouldIncludeCredit = isFirstPost && includeFlashCredit;
        const finalText = shouldIncludeCredit
            ? `${userText}\n\n${FIXED_TEXT_LINE_1}\n${FIXED_TEXT_LINE_2}`
            : `${userText}`;
        if (!finalText.trim()) {
            react_native_1.Alert.alert(LL.Social.errorEmptyNote());
            return;
        }
        await publishNostrNote(finalText);
    };
    return (<react_native_1.ScrollView style={[styles.container]} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.textInputContainer}>
        <react_native_1.TextInput style={[
            styles.textInput,
            {
                borderColor: theme.colors.black,
                height: Math.max(inputHeight, 100),
                color: theme.colors.black,
            },
        ]} multiline value={userText} onChangeText={setUserText} onContentSizeChange={onContentSizeChange} textAlignVertical="top" placeholder="Type here to share something cool, funny, or interesting! Add a vlog or meme, you may just get paid and even go viral ⚡" placeholderTextColor={theme.colors.grey3}/>
      </react_native_1.View>

      {/* Image previews */}
      {selectedImages.length > 0 && (<react_native_1.View style={styles.imagePreviewContainer}>
          {selectedImages.map((uri, index) => (<react_native_1.View key={index} style={styles.imagePreviewWrapper}>
              <react_native_1.Image source={{ uri }} style={styles.imagePreview}/>
              <react_native_1.TouchableOpacity style={styles.removeImageButton} onPress={() => handleRemoveImage(index)}>
                <Ionicons_1.default name="close-circle" size={24} color="#FF6B35"/>
              </react_native_1.TouchableOpacity>
            </react_native_1.View>))}
        </react_native_1.View>)}

      {/* Video preview */}
      {selectedVideo && (<react_native_1.View style={styles.videoPreviewContainer}>
          <react_native_1.View style={styles.videoPreviewWrapper}>
            <react_native_1.View style={styles.videoPlaceholder}>
              <Ionicons_1.default name="videocam" size={48} color={theme.colors.primary}/>
              <themed_1.Text style={[styles.videoText, { color: theme.colors.grey3 }]}>
                Video selected
              </themed_1.Text>
            </react_native_1.View>
            <react_native_1.TouchableOpacity style={styles.removeImageButton} onPress={handleRemoveVideo}>
              <Ionicons_1.default name="close-circle" size={24} color="#FF6B35"/>
            </react_native_1.TouchableOpacity>
          </react_native_1.View>
        </react_native_1.View>)}

      {/* Media buttons */}
      <react_native_1.View style={styles.mediaButtonsContainer}>
        <react_native_1.TouchableOpacity style={[styles.mediaButton, selectedVideo ? styles.mediaButtonDisabled : null]} onPress={handleAddImage} disabled={loading || uploadingImages || !!selectedVideo}>
          <Ionicons_1.default name="image-outline" size={20} color={selectedVideo ? theme.colors.grey3 : theme.colors.primary}/>
          <themed_1.Text style={[
            styles.mediaButtonText,
            { color: selectedVideo ? theme.colors.grey3 : theme.colors.primary },
        ]}>
            Gallery
          </themed_1.Text>
        </react_native_1.TouchableOpacity>

        <react_native_1.TouchableOpacity style={[styles.mediaButton, selectedVideo ? styles.mediaButtonDisabled : null]} onPress={handleTakePicture} disabled={loading || uploadingImages || !!selectedVideo}>
          <Ionicons_1.default name="camera-outline" size={20} color={selectedVideo ? theme.colors.grey3 : theme.colors.primary}/>
          <themed_1.Text style={[
            styles.mediaButtonText,
            { color: selectedVideo ? theme.colors.grey3 : theme.colors.primary },
        ]}>
            Camera
          </themed_1.Text>
        </react_native_1.TouchableOpacity>

        <react_native_1.TouchableOpacity style={[
            styles.mediaButton,
            selectedImages.length > 0 && styles.mediaButtonDisabled,
        ]} onPress={handleRecordVideo} disabled={loading || uploadingImages || selectedImages.length > 0}>
          <Ionicons_1.default name="videocam-outline" size={20} color={selectedImages.length > 0 ? theme.colors.grey3 : theme.colors.primary}/>
          <themed_1.Text style={[
            styles.mediaButtonText,
            {
                color: selectedImages.length > 0 ? theme.colors.grey3 : theme.colors.primary,
            },
        ]}>
            Video
          </themed_1.Text>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>

      {isFirstPost && (<react_native_1.View style={styles.fixedTextContainer}>
          {includeFlashCredit ? (<react_native_1.View>
              <themed_1.Text style={[styles.fixedText, { color: theme.colors.grey3 }]}>
                {FIXED_TEXT_LINE}
              </themed_1.Text>
              <themed_1.Text style={[styles.fixedTextBold, { color: theme.colors.grey2 }]}>
                {FIXED_TEXT_LINE_1}
              </themed_1.Text>
              <themed_1.Text style={[styles.fixedTextBold, { color: theme.colors.grey2 }]}>
                {FIXED_TEXT_LINE_2}
              </themed_1.Text>
            </react_native_1.View>) : null}

          <react_native_1.View style={styles.checkboxContainer}>
            <react_native_1.TouchableOpacity style={styles.checkbox} onPress={() => setIncludeFlashCredit(!includeFlashCredit)}>
              {includeFlashCredit && (<Ionicons_1.default name="checkmark" size={16} color={theme.colors.primary}/>)}
            </react_native_1.TouchableOpacity>
            <themed_1.Text style={[styles.checkboxText, { color: theme.colors.grey3 }]}>
              {FIXED_TEXT_LINE_3}
            </themed_1.Text>
          </react_native_1.View>
        </react_native_1.View>)}

      {uploadingImages && (<react_native_1.View style={styles.uploadingContainer}>
          <react_native_1.ActivityIndicator size="small" color={theme.colors.primary}/>
          <themed_1.Text style={[styles.uploadingText, { color: theme.colors.grey3 }]}>
            Uploading media...
          </themed_1.Text>
        </react_native_1.View>)}

      {/* Explainer video */}
      <explainer_video_1.ExplainerVideo videoUrl="https://v.nostr.build/2TNtuYh8WLpWBHXV.mp4" title="How to make a great post (Video Tutorial)" style={styles.explainerVideo}/>

      <buttons_1.PrimaryBtn label={loading ? LL.Social.posting() : LL.Social.postButton()} onPress={onPost} btnStyle={styles.buttonContainer} disabled={loading || uploadingImages}/>
    </react_native_1.ScrollView>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
}));
exports.default = MakeNostrPost;
//# sourceMappingURL=post.js.map