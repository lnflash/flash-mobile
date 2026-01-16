"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NostrSettingsScreen = void 0;
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const react_1 = require("react");
const nostr_tools_1 = require("nostr-tools");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const nostr_1 = require("@app/utils/nostr");
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
const native_1 = require("@react-navigation/native");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const chatContext_1 = require("../../chat/chatContext");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const screen_1 = require("../../../components/screen");
const i18n_react_1 = require("@app/i18n/i18n-react");
const styles_1 = require("./styles");
const profile_header_1 = require("./profile-header");
const advanced_settings_1 = require("./advanced-settings");
const utils_1 = require("@noble/curves/abstract/utils");
const persistent_state_1 = require("@app/store/persistent-state");
const use_app_config_1 = require("@app/hooks/use-app-config");
const manual_republish_button_1 = require("./manual-republish-button");
const NostrSettingsScreen = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [secretKey, setSecretKey] = (0, react_1.useState)(null);
    const [linked, setLinked] = (0, react_1.useState)(null);
    const [expandAdvanced, setExpandAdvanced] = (0, react_1.useState)(false);
    const { persistentState, updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const { appConfig: { galoyInstance: { lnAddressHostname: lnDomain }, }, } = (0, use_app_config_1.useAppConfig)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = (0, styles_1.useStyles)();
    const { data: dataAuthed, refetch } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        errorPolicy: "all",
        nextFetchPolicy: "network-only",
    });
    const { userProfileEvent } = (0, chatContext_1.useChatContext)();
    let userProfile = userProfileEvent
        ? JSON.parse(userProfileEvent.content)
        : null;
    console.log("USER PROFILE IS", userProfile);
    (0, react_1.useEffect)(() => {
        const initialize = async () => {
            var _a;
            let secret;
            if (!secretKey) {
                secret = await (0, nostr_1.getSecretKey)();
                setSecretKey(secret);
            }
            else {
                secret = secretKey;
            }
            if (secret && ((_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.npub) === nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secret))) {
                setLinked(true);
            }
            else {
                setLinked(false);
            }
        };
        initialize();
    }, [secretKey, dataAuthed]);
    const { saveNewNostrKey } = (0, use_nostr_profile_1.default)();
    let nostrPubKey = "";
    if (secretKey) {
        nostrPubKey = nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secretKey));
    }
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const [isGenerating, setIsGenerating] = (0, react_1.useState)(false);
    const [progressMessage, setProgressMessage] = (0, react_1.useState)("");
    const copyToClipboard = (copyText, handler) => {
        clipboard_1.default.setString(copyText);
        handler === null || handler === void 0 ? void 0 : handler(true);
    };
    const navigation = (0, native_1.useNavigation)();
    const handleEditProfile = () => {
        navigation.navigate("EditNostrProfile");
    };
    const toggleAdvancedSettings = () => {
        setExpandAdvanced(!expandAdvanced);
    };
    const renderEmptyContent = () => {
        var _a;
        if (!secretKey) {
            return (<react_native_1.View style={[
                    styles.container,
                    { flex: 1, justifyContent: "center", alignItems: "center" },
                ]}>
          <Ionicons_1.default name="person-circle-outline" size={80} color={colors.grey3}/>
          <themed_1.Text style={{ fontSize: 18, fontWeight: "600", marginTop: 20, marginBottom: 8 }}>
            {LL.Nostr.noProfileFound()}
          </themed_1.Text>
          <themed_1.Text style={{
                    fontSize: 14,
                    color: colors.grey3,
                    textAlign: "center",
                    marginBottom: 20,
                }}>
            {LL.Nostr.noProfileDescription()}
          </themed_1.Text>

          <react_native_1.Pressable style={[
                    styles.generateButton,
                    {
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: colors.black,
                        borderRadius: 16,
                    },
                ]} onPress={async () => {
                    if (isGenerating)
                        return;
                    setIsGenerating(true);
                    setProgressMessage("Creating Nostr profile...");
                    let newSecret = await saveNewNostrKey((message) => {
                        setProgressMessage(message);
                    });
                    setSecretKey(newSecret);
                    setIsGenerating(false);
                    setProgressMessage("");
                }} disabled={isGenerating}>
            <Ionicons_1.default name="person-add-outline" size={20} color={colors.white} style={{ marginRight: 10, opacity: isGenerating ? 0.5 : 1 }}/>
            <themed_1.Text style={{ color: colors.white, fontWeight: "bold" }}>
              {isGenerating ? progressMessage || LL.Nostr.creatingProfile() : LL.Nostr.createNewProfile()}
            </themed_1.Text>
          </react_native_1.Pressable>
        </react_native_1.View>);
        }
        return (<react_native_1.View style={styles.container}>
        {/* Profile Header */}
        <profile_header_1.ProfileHeader userProfile={userProfile} copyToClipboard={copyToClipboard}/>

        {/* Manual Republish Button - DEBUG TOOL */}
        {true ? null : (<manual_republish_button_1.ManualRepublishButton username={(_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.username} lnDomain={lnDomain} onSuccess={() => {
                    refetch();
                    console.log("Profile republished successfully");
                }}/>)}

        {/* Main Menu Items */}
        <react_native_1.View style={styles.menuContainer}>
          {/* Edit Profile */}
          <react_native_1.Pressable style={styles.menuItem} onPress={handleEditProfile}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="person-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{LL.Nostr.editProfile()}</themed_1.Text>
            <Ionicons_1.default name="chevron-forward" size={24} color={colors.grey3}/>
          </react_native_1.Pressable>

          {/* Advanced Settings Toggle */}
          <react_native_1.Pressable style={styles.menuItem} onPress={toggleAdvancedSettings}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="settings-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>{LL.Nostr.advancedSettings()}</themed_1.Text>
            <Ionicons_1.default name={expandAdvanced ? "chevron-down" : "chevron-forward"} size={24} color={colors.grey3}/>
          </react_native_1.Pressable>
          <advanced_settings_1.AdvancedSettings expandAdvanced={expandAdvanced} secretKeyHex={(0, utils_1.bytesToHex)(secretKey)} onReconnect={async () => {
                await refetch();
            }} copyToClipboard={copyToClipboard} accountLinked={linked}/>
          <react_native_1.View style={styles.menuItem}>
            <react_native_1.View style={styles.menuIconContainer}>
              <Ionicons_1.default name="chatbubbles-outline" size={24} color={colors.black}/>
            </react_native_1.View>
            <themed_1.Text style={styles.menuText}>Enable Chat</themed_1.Text>
            <themed_1.Switch value={!!persistentState.chatEnabled} onValueChange={(enabled) => {
                updateState((state) => {
                    if (state)
                        return Object.assign(Object.assign({}, state), { chatEnabled: enabled });
                    return undefined;
                });
            }}/>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>);
    };
    return (<screen_1.Screen preset="scroll" keyboardShouldPersistTaps="handled">
      {renderEmptyContent()}
    </screen_1.Screen>);
};
exports.NostrSettingsScreen = NostrSettingsScreen;
//# sourceMappingURL=nostr-settings-screen.js.map