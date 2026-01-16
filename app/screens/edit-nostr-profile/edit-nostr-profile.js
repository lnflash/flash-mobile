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
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const chatContext_1 = require("../chat/chatContext");
const edit_profile_ui_1 = require("./edit-profile-ui");
const themed_1 = require("@rneui/themed");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
const i18n_react_1 = require("@app/i18n/i18n-react"); // <- i18n context
const EditNostrProfileScreen = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)(); // <- use LL
    const { userProfileEvent, refreshUserProfile } = (0, chatContext_1.useChatContext)();
    const [fallbackToEmpty, setFallbackToEmpty] = (0, react_1.useState)(false);
    const [showPrompt, setShowPrompt] = (0, react_1.useState)(false);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const handleCreateProfileClick = () => {
        const pubkeyMessage = LL.Nostr.createProfilePubkeyMessage();
        react_native_1.Alert.alert(LL.Nostr.createProfileTitle(), `${LL.Nostr.createProfileWarning()} ${pubkeyMessage} ${LL.Nostr.createProfilePrompt()}`, [
            {
                text: LL.common.cancel(),
                style: "cancel",
            },
            {
                text: LL.common.ok(),
                onPress: () => {
                    setFallbackToEmpty(true);
                },
            },
        ]);
    };
    (0, react_1.useEffect)(() => {
        if (!userProfileEvent && !fallbackToEmpty) {
            refreshUserProfile();
            // Delay showing the fallback UI by 2 seconds
            const timer = setTimeout(() => {
                setShowPrompt(true);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [userProfileEvent, fallbackToEmpty]);
    if (!userProfileEvent && !fallbackToEmpty) {
        return (<react_native_1.View style={styles.loadingContainer}>
        {!showPrompt ? (<react_native_1.ActivityIndicator size="large"/>) : (<>
            <react_native_1.ActivityIndicator size="large"/>
            <react_native_1.Text style={styles.infoText}>{LL.Nostr.profileNotFound()}</react_native_1.Text>
            <react_native_1.Text style={[styles.infoText, { fontSize: 14 }]}>
              {LL.Nostr.promptToCreateProfile()}
            </react_native_1.Text>

            <galoy_secondary_button_1.GaloySecondaryButton title={LL.Nostr.createProfileButton()} onPress={handleCreateProfileClick} style={styles.createButton}/>
          </>)}
      </react_native_1.View>);
    }
    const profileData = userProfileEvent;
    return (<react_native_1.View style={styles.container}>
      <edit_profile_ui_1.EditProfileUI profileEvent={profileData}/>
    </react_native_1.View>);
};
const styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    infoText: {
        fontSize: 16,
        fontWeight: "600",
        marginTop: 20,
        textAlign: "center",
    },
    createButton: {
        margin: 10,
    },
});
exports.default = EditNostrProfileScreen;
//# sourceMappingURL=edit-nostr-profile.js.map