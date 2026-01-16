"use strict";
/**
 * Boltcard API Service
 *
 * Handles REST API calls to BTCPayServer Flash Plugin for Boltcard settings management.
 * These endpoints manage card PIN, max withdrawal limits, and enable/disable status.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoltcardApi = exports.unlockCard = exports.getPinStatus = exports.removePin = exports.setPin = exports.getCardBalance = exports.updateSettings = exports.getSettings = exports.BoltcardApiError = void 0;
const axios_1 = __importDefault(require("axios"));
// API Error class
class BoltcardApiError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "BoltcardApiError";
        this.statusCode = statusCode;
    }
}
exports.BoltcardApiError = BoltcardApiError;
/**
 * Build the full API URL for a BTCPayServer endpoint
 */
const buildUrl = (baseUrl, storeId, path) => {
    // Ensure baseUrl doesn't have trailing slash
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    return `${cleanBaseUrl}/plugins/${storeId}/flash/${path}`;
};
/**
 * Handle API errors consistently
 */
const handleApiError = (error) => {
    var _a, _b, _c, _d, _e;
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        const message = ((_b = (_a = axiosError.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) ||
            ((_d = (_c = axiosError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.reason) ||
            axiosError.message ||
            "Network error";
        throw new BoltcardApiError(message, (_e = axiosError.response) === null || _e === void 0 ? void 0 : _e.status);
    }
    throw new BoltcardApiError(error instanceof Error ? error.message : "Unknown error");
};
/**
 * Get current Boltcard withdrawal settings for a store
 */
const getSettings = async (baseUrl, storeId) => {
    try {
        const url = buildUrl(baseUrl, storeId, "boltcard/settings");
        const response = await axios_1.default.get(url, {
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.getSettings = getSettings;
/**
 * Update Boltcard withdrawal settings for a store
 */
const updateSettings = async (baseUrl, storeId, settings) => {
    try {
        const url = buildUrl(baseUrl, storeId, "boltcard/settings");
        const response = await axios_1.default.post(url, settings, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.updateSettings = updateSettings;
/**
 * Get card balance and limits
 */
const getCardBalance = async (baseUrl, storeId, cardId) => {
    try {
        const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/balance`);
        const response = await axios_1.default.get(url, {
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.getCardBalance = getCardBalance;
/**
 * Set or update PIN for a Boltcard (4-8 digits)
 */
const setPin = async (baseUrl, storeId, cardId, pin) => {
    // Client-side validation
    if (!pin || pin.length < 4 || pin.length > 8) {
        throw new BoltcardApiError("PIN must be 4-8 digits");
    }
    if (!/^\d+$/.test(pin)) {
        throw new BoltcardApiError("PIN must contain only digits");
    }
    try {
        const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin`);
        const response = await axios_1.default.post(url, { pin }, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.setPin = setPin;
/**
 * Remove PIN from a Boltcard
 */
const removePin = async (baseUrl, storeId, cardId) => {
    try {
        const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin`);
        const response = await axios_1.default.delete(url, {
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.removePin = removePin;
/**
 * Get PIN status for a Boltcard (enabled, locked out, etc.)
 */
const getPinStatus = async (baseUrl, storeId, cardId) => {
    try {
        const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin/status`);
        const response = await axios_1.default.get(url, {
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.getPinStatus = getPinStatus;
/**
 * Unlock a locked Boltcard (admin function)
 */
const unlockCard = async (baseUrl, storeId, cardId) => {
    try {
        const url = buildUrl(baseUrl, storeId, `boltcard/${cardId}/pin/unlock`);
        const response = await axios_1.default.post(url, {}, {
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        handleApiError(error);
    }
};
exports.unlockCard = unlockCard;
// Export all functions as a service object for convenience
exports.BoltcardApi = {
    getSettings: exports.getSettings,
    updateSettings: exports.updateSettings,
    getCardBalance: exports.getCardBalance,
    setPin: exports.setPin,
    removePin: exports.removePin,
    getPinStatus: exports.getPinStatus,
    unlockCard: exports.unlockCard,
};
exports.default = exports.BoltcardApi;
//# sourceMappingURL=boltcard-api.js.map