"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToNostrBuild = void 0;
const nostr_tools_1 = require("nostr-tools");
/**
 * Generate NIP-98 HTTP Auth header for nostr.build API
 */
async function generateNIP98AuthHeader(url, method, nsec) {
    try {
        const decoded = nostr_tools_1.nip19.decode(nsec);
        const privateKey = decoded.data;
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
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate auth header: ${message}`);
    }
}
/**
 * Upload media file to nostr.build using NIP-98 authentication
 * @param mediaUri - Local file URI (file://...)
 * @param flashNostrNsec - FLASH_NOSTR_NSEC from env config
 * @param isVideo - Whether the file is a video (default: false)
 * @returns Uploaded media URL
 */
async function uploadToNostrBuild(mediaUri, flashNostrNsec, isVideo = false) {
    try {
        console.log("Uploading media to nostr.build:", mediaUri, "isVideo:", isVideo);
        const uploadUrl = "https://nostr.build/api/v2/upload/files";
        const authHeader = await generateNIP98AuthHeader(uploadUrl, "POST", flashNostrNsec);
        const formData = new FormData();
        formData.append("file", {
            uri: mediaUri,
            type: isVideo ? "video/mp4" : "image/jpeg",
            name: isVideo ? "video.mp4" : mediaUri.endsWith(".svg") ? "image.svg" : "photo.jpg",
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
            const uploadedUrl = data.data[0].url;
            console.log("Extracted URL:", uploadedUrl);
            return uploadedUrl;
        }
        throw new Error("Upload failed: no URL found in response");
    }
    catch (error) {
        console.error("Error uploading media to nostr.build:", error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to upload media: ${message}`);
    }
}
exports.uploadToNostrBuild = uploadToNostrBuild;
//# sourceMappingURL=media-upload.js.map