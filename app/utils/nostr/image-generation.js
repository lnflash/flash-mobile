"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGradientBanner = exports.generateRoboHashAvatar = void 0;
const react_native_fs_1 = __importDefault(require("react-native-fs"));
/**
 * Mulberry32 PRNG - deterministic random number generator
 * Takes a seed and returns a function that generates random numbers
 */
function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/**
 * Generate a seed number from a string (pubkey)
 */
function hashStringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}
/**
 * Generate HSL color from random values
 */
function generateHSLColor(random) {
    const hue = Math.floor(random() * 360);
    const saturation = 60 + Math.floor(random() * 30); // 60-90%
    const lightness = 45 + Math.floor(random() * 20); // 45-65%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
/**
 * Convert HSL to RGB hex color
 */
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(255 * f(0));
    const g = Math.round(255 * f(8));
    const b = Math.round(255 * f(4));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
/**
 * Fetch RoboHash avatar for a given pubkey
 * Downloads the image and returns the local file URI
 */
async function generateRoboHashAvatar(pubkey) {
    try {
        const url = `https://robohash.org/${pubkey}?set=set1&size=400x400`;
        console.log("Fetching RoboHash avatar from:", url);
        const tempPath = `${react_native_fs_1.default.CachesDirectoryPath}/robohash_${Date.now()}.png`;
        const download = await react_native_fs_1.default.downloadFile({
            fromUrl: url,
            toFile: tempPath,
            connectionTimeout: 30000,
            readTimeout: 60000, // 60 seconds to download the image
        }).promise;
        if (download.statusCode !== 200) {
            throw new Error(`Failed to download RoboHash avatar: HTTP ${download.statusCode}`);
        }
        console.log("RoboHash avatar downloaded to:", tempPath);
        return `file://${tempPath}`;
    }
    catch (error) {
        console.error("Error generating RoboHash avatar:", error);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate avatar: ${message}`);
    }
}
exports.generateRoboHashAvatar = generateRoboHashAvatar;
/**
 * Generate a deterministic gradient banner based on pubkey
 * Uses RoboHash banner API which returns PNG images
 */
async function generateGradientBanner(pubkey) {
    return Promise.resolve("https://image.nostr.build/14a735fb84b0d794c786086222b258c045b00b28321de802b54211bbe6701d1a.jpg");
}
exports.generateGradientBanner = generateGradientBanner;
//# sourceMappingURL=image-generation.js.map