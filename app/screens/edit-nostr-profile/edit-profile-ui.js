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
exports.EditProfileUI = void 0;
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
const themed_1 = require("@rneui/themed");
const nostr_tools_1 = require("nostr-tools");
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_2 = require("react-native");
const EditProfileUI = ({ profileEvent }) => {
    const styles = useStyles();
    const { theme } = (0, themed_1.useTheme)();
    const [formData, setFormData] = (0, react_1.useState)({
        username: "",
        name: "",
        nip05: "",
        picture: "",
        lud16: "",
        about: "",
        website: "",
        banner: "",
    });
    let { updateNostrProfile, generateProfileImages } = (0, use_nostr_profile_1.default)();
    const [isFormVisible, setIsFormVisible] = (0, react_1.useState)(false);
    const [updating, setUpdating] = (0, react_1.useState)(false);
    const [generatingImages, setGeneratingImages] = (0, react_1.useState)(false);
    const [imageProgressMessage, setImageProgressMessage] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        var _a, _b, _c, _d, _e, _f;
        if (profileEvent === null || profileEvent === void 0 ? void 0 : profileEvent.content) {
            try {
                const parsedContent = JSON.parse(profileEvent.content);
                setFormData({
                    username: (_a = parsedContent.username) !== null && _a !== void 0 ? _a : "",
                    name: (_b = parsedContent.name) !== null && _b !== void 0 ? _b : "",
                    nip05: (_c = parsedContent.nip05) !== null && _c !== void 0 ? _c : "",
                    picture: (_d = parsedContent.picture) !== null && _d !== void 0 ? _d : "",
                    lud16: (_e = parsedContent.lud16) !== null && _e !== void 0 ? _e : "",
                    banner: (_f = parsedContent.banner) !== null && _f !== void 0 ? _f : "",
                });
                setIsFormVisible(true);
            }
            catch (error) {
                console.error("Error parsing content:", error);
            }
        }
    }, [profileEvent]);
    const handleInputChange = (field, value) => {
        setFormData(Object.assign(Object.assign({}, formData), { [field]: value }));
    };
    const copyToClipboard = async () => {
        if (profileEvent === null || profileEvent === void 0 ? void 0 : profileEvent.pubkey) {
            await react_native_1.Clipboard.setString(profileEvent.pubkey);
            react_native_1.Alert.alert("Copied to Clipboard", "The pubkey has been copied to your clipboard.");
        }
    };
    const handleGenerateImages = async () => {
        try {
            setGeneratingImages(true);
            setImageProgressMessage("Starting image generation...");
            const result = await generateProfileImages(formData, (message) => {
                setImageProgressMessage(message);
            });
            if (result) {
                // Update form data with generated image URLs
                setFormData(Object.assign(Object.assign({}, formData), { picture: result.picture || formData.picture, banner: result.banner }));
                react_native_1.Alert.alert("Success!", "Profile picture and banner generated successfully!");
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to generate images";
            react_native_1.Alert.alert("Error", message);
        }
        finally {
            setGeneratingImages(false);
            setImageProgressMessage("");
        }
    };
    return (<react_native_1.ScrollView contentContainerStyle={styles.container}>
      <>
        {(profileEvent === null || profileEvent === void 0 ? void 0 : profileEvent.pubkey) && (<react_native_1.TouchableOpacity onPress={copyToClipboard}>
            <react_native_1.View style={styles.pubkeyContainer}>
              <react_native_1.Text style={styles.pubkeyText}>
                {(profileEvent === null || profileEvent === void 0 ? void 0 : profileEvent.pubkey) ? nostr_tools_1.nip19.npubEncode(profileEvent.pubkey) : null}
              </react_native_1.Text>
            </react_native_1.View>
          </react_native_1.TouchableOpacity>)}

        <ProfileForm formData={formData} handleInputChange={handleInputChange} updating={updating} generatingImages={generatingImages} imageProgressMessage={imageProgressMessage} onSubmit={async () => {
            setUpdating(true);
            await updateNostrProfile({ content: formData });
            setUpdating(false);
        }} onGenerateImages={handleGenerateImages}/>
      </>
    </react_native_1.ScrollView>);
};
exports.EditProfileUI = EditProfileUI;
const ProfileForm = ({ formData, handleInputChange, updating, generatingImages, imageProgressMessage, onSubmit, onGenerateImages, }) => {
    const styles = useStyles();
    const { theme } = (0, themed_1.useTheme)();
    return (<react_native_1.View style={styles.formContainer}>
      <react_native_2.Image source={{
            uri: formData.picture ||
                "https://pfp.nostr.build/520649f789e06c2a3912765c0081584951e91e3b5f3366d2ae08501162a5083b.jpg",
        }} style={styles.profileImage} resizeMode="cover"/>
      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>Username</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="Username" value={formData.username} onChangeText={(text) => handleInputChange("username", text)}/>
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>Name</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="Name" value={formData.name} onChangeText={(text) => handleInputChange("name", text)}/>
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>NIP-05</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="NIP-05" value={formData.nip05} onChangeText={(text) => handleInputChange("nip05", text)}/>
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>Picture URL</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="Picture URL" value={formData.picture} onChangeText={(text) => handleInputChange("picture", text)}/>
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>Banner URL</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="Banner URL" value={formData.banner} onChangeText={(text) => handleInputChange("banner", text)}/>
      </react_native_1.View>

      {/* Generate Images Button */}
      <react_native_1.View style={styles.inputGroup}>
        {generatingImages ? (<react_native_1.View style={styles.generatingContainer}>
            <react_native_1.ActivityIndicator size="small" color={theme.colors.primary}/>
            <react_native_1.Text style={styles.generatingText}>{imageProgressMessage}</react_native_1.Text>
          </react_native_1.View>) : (<themed_1.Button title="Generate Profile Images" onPress={onGenerateImages} type="outline" containerStyle={styles.generateButton} icon={{
                name: "image",
                type: "ionicon",
                size: 18,
                color: theme.colors.primary,
            }}/>)}
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>LUD-16</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="LUD-16" value={formData.lud16} onChangeText={(text) => handleInputChange("lud16", text)}/>
      </react_native_1.View>

      <react_native_1.View style={styles.inputGroup}>
        <react_native_1.Text style={styles.label}>Website</react_native_1.Text>
        <themed_1.Input style={styles.input} placeholder="Website" value={formData.website} onChangeText={(text) => handleInputChange("website", text)}/>
      </react_native_1.View>

      {updating ? (<react_native_1.ActivityIndicator size="large" color={theme.colors.primary}/>) : (<themed_1.Button title="Save Changes" onPress={onSubmit} color={theme.colors.primary} containerStyle={styles.saveButton}/>)}
    </react_native_1.View>);
};
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
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
    generateButton: {
        marginBottom: 10,
    },
    generatingContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        backgroundColor: colors.grey5,
        borderRadius: 8,
    },
    generatingText: {
        marginLeft: 10,
        fontSize: 14,
        color: colors.grey1,
    },
}));
//# sourceMappingURL=edit-profile-ui.js.map