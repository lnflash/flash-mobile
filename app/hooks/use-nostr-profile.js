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
const Keychain = __importStar(require("react-native-keychain"));
const nostr_tools_1 = require("nostr-tools");
const nostr_1 = require("@app/utils/nostr");
const publish_helpers_1 = require("@app/utils/nostr/publish-helpers");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const use_app_config_1 = require("./use-app-config");
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const pool_1 = require("@app/utils/nostr/pool");
const image_generation_1 = require("@app/utils/nostr/image-generation");
const media_upload_1 = require("@app/utils/nostr/media-upload");
const useNostrProfile = () => {
    const KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key";
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataAuthed } = (0, generated_1.useHomeAuthedQuery)({
        skip: !isAuthed,
        fetchPolicy: "network-only",
        errorPolicy: "all",
    });
    const { appConfig: { galoyInstance: { lnAddressHostname: lnDomain }, }, } = (0, use_app_config_1.useAppConfig)();
    const relays = [
        "wss://relay.flashapp.me",
        "wss://relay.islandbitcoin.com",
        "wss://relay.damus.io",
    ];
    const [userUpdateNpubMutation] = (0, generated_1.useUserUpdateNpubMutation)();
    const deleteNostrKeys = async () => {
        await Keychain.resetInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY);
    };
    const deleteNostrData = async () => {
        await deleteNostrKeys();
        const keys = await async_storage_1.default.getAllKeys();
        const lastSeenKeys = keys.filter((key) => key.startsWith("lastSeen_"));
        async_storage_1.default.multiRemove(lastSeenKeys);
        async_storage_1.default.removeItem("giftwraps");
    };
    const saveNewNostrKey = async (progressCallback, additionalContent) => {
        var _a;
        const username = ((_a = dataAuthed === null || dataAuthed === void 0 ? void 0 : dataAuthed.me) === null || _a === void 0 ? void 0 : _a.username) || undefined;
        let lud16;
        if (username)
            lud16 = `${username}@${lnDomain}`;
        let secretKey = (0, nostr_tools_1.generateSecretKey)();
        const nostrSecret = nostr_tools_1.nip19.nsecEncode(secretKey);
        let newNpub = nostr_tools_1.nip19.npubEncode((0, nostr_tools_1.getPublicKey)(secretKey));
        console.log("🔑 Creating new Nostr key...");
        console.log("Username:", username || "(no username yet)");
        console.log("NPub:", newNpub);
        progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Creating Nostr profile...");
        const { data } = await userUpdateNpubMutation({
            variables: {
                input: {
                    npub: newNpub,
                },
            },
        });
        await Keychain.setInternetCredentials(KEYCHAIN_NOSTRCREDS_KEY, KEYCHAIN_NOSTRCREDS_KEY, nostrSecret);
        await (0, nostr_1.setPreferredRelay)(secretKey);
        await (0, nostr_1.createContactListEvent)(secretKey);
        // Generate profile images automatically
        let pictureUrl;
        let bannerUrl;
        console.log("\n🎨 Generating profile images...");
        progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Generating profile picture...");
        try {
            const pubKey = (0, nostr_tools_1.getPublicKey)(secretKey);
            // Generate avatar
            console.log("Generating RoboHash avatar...");
            const avatarUri = await (0, image_generation_1.generateRoboHashAvatar)(pubKey);
            // Generate banner
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Generating banner image...");
            console.log("Generating gradient banner...");
            const bannerUri = await (0, image_generation_1.generateGradientBanner)(pubKey);
            // Upload avatar
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Uploading profile picture...");
            console.log("Uploading avatar to nostr.build...");
            pictureUrl = await (0, media_upload_1.uploadToNostrBuild)(avatarUri, nostrSecret, false);
            console.log("Avatar uploaded:", pictureUrl);
            // Upload banner
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Uploading banner image...");
            console.log("Uploading banner to nostr.build...");
            bannerUrl = await (0, media_upload_1.uploadToNostrBuild)(bannerUri, nostrSecret, false);
            console.log("Banner uploaded:", bannerUrl);
        }
        catch (error) {
            console.error("Failed to generate/upload images, continuing with text-only profile:", error);
            // Silently continue without images
        }
        // Always publish a profile, even if minimal
        console.log("\n📝 Publishing initial profile...");
        progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Publishing profile to relays...");
        try {
            const baseProfileContent = username
                ? Object.assign(Object.assign({ name: username, username: username, flash_username: username, lud16: lud16, nip05: `${username}@${lnDomain}` }, (pictureUrl && { picture: pictureUrl })), (bannerUrl && { banner: bannerUrl })) : Object.assign(Object.assign({ name: "Flash User", about: "Flash wallet user" }, (pictureUrl && { picture: pictureUrl })), (bannerUrl && { banner: bannerUrl }));
            // Merge with any additional content passed in (e.g., from username screen)
            const profileContent = Object.assign(Object.assign(Object.assign(Object.assign({}, baseProfileContent), additionalContent), (pictureUrl && { picture: pictureUrl })), (bannerUrl && { banner: bannerUrl }));
            console.log("Final profile content with images:", JSON.stringify(profileContent, null, 2));
            // Create and publish the profile event
            const pubKey = (0, nostr_tools_1.getPublicKey)(secretKey);
            const kind0Event = {
                kind: 0,
                pubkey: pubKey,
                content: JSON.stringify(profileContent),
                tags: [],
                created_at: Math.floor(Date.now() / 1000),
            };
            const signedKind0Event = (0, nostr_tools_1.finalizeEvent)(kind0Event, secretKey);
            console.log("Profile event signed with ID:", signedKind0Event.id);
            // Get appropriate relays and publish
            const publicRelays = (0, publish_helpers_1.getPublishingRelays)("profile");
            const publishResult = await (0, publish_helpers_1.publishEventToRelays)(pool_1.pool, signedKind0Event, publicRelays, "Initial Profile (kind-0)");
            if (publishResult.successCount === 0) {
                console.error("❌ CRITICAL: Failed to publish initial profile to ANY relay");
            }
            else {
                console.log(`✅ Initial profile successfully published to ${publishResult.successCount} relays`);
            }
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Profile created successfully!");
            // Verify after a short delay
            setTimeout(async () => {
                const verification = await (0, publish_helpers_1.verifyEventOnRelays)(pool_1.pool, signedKind0Event.id, [
                    "wss://relay.damus.io",
                    "wss://relay.primal.net",
                    "wss://relay.islandbitcoin.com",
                ], 0);
                if (verification.found) {
                    console.log("✅ Initial profile verified on major relays");
                }
                else {
                    console.log("⚠️ Initial profile verification failed - may need to republish");
                }
            }, 3000);
        }
        catch (error) {
            console.error("Failed to publish initial profile:", error);
            // Don't throw - key creation succeeded even if profile publishing failed
        }
        return secretKey;
    };
    const generateProfileImages = async (existingProfileContent, progressCallback) => {
        try {
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Generating profile picture...");
            const secret = await (0, nostr_1.getSecretKey)();
            if (!secret) {
                throw new Error("No Nostr profile found. Please create a Nostr profile first.");
            }
            const pubKey = (0, nostr_tools_1.getPublicKey)(secret);
            // Generate images
            console.log("Generating RoboHash avatar...");
            const avatarUri = await (0, image_generation_1.generateRoboHashAvatar)(pubKey);
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Generating banner image...");
            console.log("Generating gradient banner...");
            const bannerUri = await (0, image_generation_1.generateGradientBanner)(pubKey);
            // Upload to nostr.build
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Uploading profile picture...");
            console.log("Uploading avatar to nostr.build...");
            const pictureUrl = await (0, media_upload_1.uploadToNostrBuild)(avatarUri, nostr_tools_1.nip19.nsecEncode(secret), false);
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Uploading banner image...");
            console.log("Uploading banner to nostr.build...");
            const bannerUrl = await (0, media_upload_1.uploadToNostrBuild)(bannerUri, nostr_tools_1.nip19.nsecEncode(secret), false);
            // Update profile with new images
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Updating profile...");
            const updatedProfile = Object.assign(Object.assign({}, existingProfileContent), { picture: pictureUrl, banner: bannerUrl });
            await updateNostrProfile({ content: updatedProfile });
            progressCallback === null || progressCallback === void 0 ? void 0 : progressCallback("Images generated successfully!");
            return { picture: pictureUrl, banner: bannerUrl };
        }
        catch (error) {
            console.error("Error generating profile images:", error);
            throw error;
        }
    };
    const fetchNostrUser = async (npub) => {
        const nostrProfile = await pool_1.pool.get(relays, {
            kinds: [0],
            authors: [nostr_tools_1.nip19.decode(npub).data],
        });
        if (!(nostrProfile === null || nostrProfile === void 0 ? void 0 : nostrProfile.content)) {
            return { pubkey: npub };
        }
        try {
            return Object.assign(Object.assign({}, JSON.parse(nostrProfile.content)), { pubkey: nostrProfile.pubkey });
        }
        catch (error) {
            console.error("Error parsing nostr profile: ", error);
            throw error;
        }
    };
    // Retry mechanism for failed relay publishing
    const retryFailedRelays = async (event, failedRelays) => {
        if (failedRelays.length === 0)
            return { successCount: 0, successfulRelays: [] };
        const successfulRelays = [];
        const retryPromises = failedRelays.map(async (relay) => {
            try {
                // pool.publish returns an array of promises
                const publishResults = pool_1.pool.publish([relay], event);
                await Promise.all(publishResults);
                successfulRelays.push(relay);
                return { relay, success: true };
            }
            catch (error) {
                return { relay, success: false };
            }
        });
        await Promise.allSettled(retryPromises);
        return { successCount: successfulRelays.length, successfulRelays };
    };
    // Verify profile propagation across critical relays
    const verifyProfile = async (pubkey) => {
        const criticalRelays = [
            "wss://relay.flashapp.me",
            "wss://relay.islandbitcoin.com",
            "wss://relay.damus.io",
        ];
        const verificationPromises = criticalRelays.map(async (relay) => {
            try {
                const profile = await pool_1.pool.get([relay], {
                    kinds: [0],
                    authors: [pubkey],
                });
                return { relay, found: !!profile };
            }
            catch (error) {
                return { relay, found: false };
            }
        });
        const results = await Promise.all(verificationPromises);
        const foundCount = results.filter((r) => r.found).length;
        return foundCount;
    };
    const updateNostrProfile = async ({ content, }) => {
        console.log("\n🚀 Starting Nostr profile update...");
        console.log("Profile content to publish:", JSON.stringify(content, null, 2));
        // Get appropriate relays for profile publishing
        const publicRelays = (0, publish_helpers_1.getPublishingRelays)("profile");
        console.log(`📡 Will publish to ${publicRelays.length} relays`);
        let secret = await (0, nostr_1.getSecretKey)();
        if (!secret) {
            if (dataAuthed && dataAuthed.me && !dataAuthed.me.npub) {
                console.log("No secret key found, creating new profile with provided content...");
                await saveNewNostrKey(undefined, content);
                console.log("Profile created with images and content, returning early");
                // Return early - saveNewNostrKey already published the profile with images
                return { successCount: 1, totalRelays: 1, successfulRelays: [] };
            }
            else {
                throw Error("Could not verify npub");
            }
        }
        let pubKey = (0, nostr_tools_1.getPublicKey)(secret);
        console.log(`🔑 Publishing with pubkey: ${pubKey}`);
        const kind0Event = {
            kind: 0,
            pubkey: pubKey,
            content: JSON.stringify(content),
            tags: [],
            created_at: Math.floor(Date.now() / 1000),
        };
        const signedKind0Event = (0, nostr_tools_1.finalizeEvent)(kind0Event, secret);
        console.log(`✍️ Event signed with id: ${signedKind0Event.id}`);
        // Use the new helper function for publishing
        const publishResult = await (0, publish_helpers_1.publishEventToRelays)(pool_1.pool, signedKind0Event, publicRelays, "Profile (kind-0)");
        const successfulRelays = publishResult.successfulRelays;
        const failedRelays = publishResult.failedRelays;
        const successCount = publishResult.successCount;
        // Ensure at least one core relay succeeded
        const coreRelays = ["wss://relay.flashapp.me", "wss://relay.islandbitcoin.com"];
        const coreSuccess = successfulRelays.some((relay) => coreRelays.includes(relay));
        console.log(`\n🎯 Core relay status: ${coreSuccess
            ? "✅ At least one core relay succeeded"
            : "⚠️ No core relays succeeded"}`);
        if (!coreSuccess && failedRelays.length > 0) {
            // Retry core relays if none succeeded
            const coreRelaysToRetry = coreRelays.filter((r) => failedRelays.includes(r));
            console.log(`🔄 Retrying ${coreRelaysToRetry.length} core relays...`);
            const retryResults = await retryFailedRelays(signedKind0Event, coreRelaysToRetry);
            if (retryResults.successCount > 0) {
                successfulRelays.push(...retryResults.successfulRelays);
                console.log(`✅ Core relay retry successful! Added ${retryResults.successCount} relays`);
            }
            else {
                console.log("⚠️ Core relay retry failed");
            }
        }
        if (successfulRelays.length === 0) {
            console.error("❌ CRITICAL: Failed to publish profile to ANY relays!");
            throw new Error("Failed to publish profile to any relays");
        }
        console.log(`\n✨ Profile update completed with ${successCount} successful publishes`);
        // Background retry for remaining failed relays
        if (failedRelays.length > 0) {
            console.log(`⏰ Scheduling background retry for ${failedRelays.length} failed relays in 5 seconds...`);
            setTimeout(() => {
                console.log("🔄 Starting background retry for failed relays...");
                retryFailedRelays(signedKind0Event, failedRelays);
            }, 5000);
        }
        // Verify profile propagation after 3 seconds
        if (successfulRelays.length > 0) {
            setTimeout(async () => {
                console.log("\n🔍 Starting profile propagation verification...");
                // Use the new verification helper
                const verifyRelays = [
                    "wss://relay.flashapp.me",
                    "wss://relay.islandbitcoin.com",
                    "wss://relay.damus.io",
                    "wss://relay.primal.net",
                ];
                const verification = await (0, publish_helpers_1.verifyEventOnRelays)(pool_1.pool, signedKind0Event.id, verifyRelays, 0);
                if (verification.found) {
                    console.log(`✅ Profile verified on ${verification.foundOnRelays.length} critical relays`);
                    console.log("Profile available on:", verification.foundOnRelays.join(", "));
                }
                else {
                    console.log("⚠️ WARNING: Profile verification failed - not found on any critical relay");
                }
            }, 3000);
        }
        return { successCount, totalRelays: publicRelays.length, successfulRelays };
    };
    return {
        fetchNostrUser,
        updateNostrProfile,
        saveNewNostrKey,
        deleteNostrKeys,
        deleteNostrData,
        verifyProfile,
        generateProfileImages,
    };
};
exports.default = useNostrProfile;
//# sourceMappingURL=use-nostr-profile.js.map