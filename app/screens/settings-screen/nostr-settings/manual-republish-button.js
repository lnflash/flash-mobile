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
exports.ManualRepublishButton = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const nostr_1 = require("@app/utils/nostr");
const nostr_tools_1 = require("nostr-tools");
const pool_1 = require("@app/utils/nostr/pool");
const publish_helpers_1 = require("@app/utils/nostr/publish-helpers");
const i18n_react_1 = require("@app/i18n/i18n-react");
const ManualRepublishButton = ({ username, lnDomain = "flashapp.me", onSuccess, }) => {
    const { theme: { colors } } = (0, themed_1.useTheme)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [isPublishing, setIsPublishing] = (0, react_1.useState)(false);
    const handleRepublishProfile = async () => {
        if (!username) {
            react_native_1.Alert.alert("Error", "Username not found. Please set your username first.");
            return;
        }
        setIsPublishing(true);
        try {
            const secretKey = await (0, nostr_1.getSecretKey)();
            if (!secretKey) {
                react_native_1.Alert.alert("Error", "No Nostr key found. Please create a profile first.");
                return;
            }
            const pubKey = (0, nostr_tools_1.getPublicKey)(secretKey);
            const lud16 = `${username}@${lnDomain}`;
            const nip05 = `${username}@${lnDomain}`;
            console.log("\n🔄 MANUAL PROFILE REPUBLISH");
            console.log("=".repeat(60));
            console.log("Username:", username);
            console.log("Lightning address:", lud16);
            console.log("NIP-05:", nip05);
            console.log("Pubkey:", pubKey);
            // Create profile content
            const profileContent = {
                name: username,
                username: username,
                flash_username: username,
                lud16: lud16,
                nip05: nip05,
                about: `Flash user - ${username}`,
            };
            // Create kind-0 event
            const kind0Event = {
                kind: 0,
                pubkey: pubKey,
                content: JSON.stringify(profileContent),
                tags: [],
                created_at: Math.floor(Date.now() / 1000),
            };
            const signedEvent = (0, nostr_tools_1.finalizeEvent)(kind0Event, secretKey);
            console.log("Event signed with ID:", signedEvent.id);
            // Get relays and publish
            const relays = (0, publish_helpers_1.getPublishingRelays)("profile");
            console.log(`Will publish to ${relays.length} relays`);
            const result = await (0, publish_helpers_1.publishEventToRelays)(pool_1.pool, signedEvent, relays, "Manual Profile Republish");
            console.log(`\n✅ Published to ${result.successCount}/${relays.length} relays`);
            // Verify after 2 seconds
            setTimeout(async () => {
                const verification = await (0, publish_helpers_1.verifyEventOnRelays)(pool_1.pool, signedEvent.id, ["wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.islandbitcoin.com"], 0);
                if (verification.found) {
                    react_native_1.Alert.alert("Success!", `Profile republished to ${result.successCount} relays and verified on major relays.\n\nLightning address: ${lud16}`, [{ text: "OK", onPress: onSuccess }]);
                }
                else {
                    react_native_1.Alert.alert("Partial Success", `Profile published to ${result.successCount} relays but verification failed. You may need to try again.`, [{ text: "OK" }]);
                }
            }, 2000);
        }
        catch (error) {
            console.error("Failed to republish profile:", error);
            react_native_1.Alert.alert("Error", "Failed to republish profile. Please try again.");
        }
        finally {
            setIsPublishing(false);
        }
    };
    return (<react_native_1.Pressable style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.warning,
            borderRadius: 16,
            marginTop: 10,
            marginHorizontal: 16,
            opacity: isPublishing ? 0.7 : 1,
        }} onPress={handleRepublishProfile} disabled={isPublishing}>
      {isPublishing ? (<react_native_1.ActivityIndicator size="small" color={colors.white} style={{ marginRight: 10 }}/>) : (<Ionicons_1.default name="refresh-outline" size={20} color={colors.white} style={{ marginRight: 10 }}/>)}
      <themed_1.Text style={{ color: colors.white, fontWeight: "bold" }}>
        {isPublishing ? "Publishing..." : "🔧 DEBUG: Republish Profile to Relays"}
      </themed_1.Text>
    </react_native_1.Pressable>);
};
exports.ManualRepublishButton = ManualRepublishButton;
//# sourceMappingURL=manual-republish-button.js.map