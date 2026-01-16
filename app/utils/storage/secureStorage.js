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
const react_native_secure_key_store_1 = __importStar(require("react-native-secure-key-store"));
class KeyStoreWrapper {
    static async getIsBiometricsEnabled() {
        try {
            await react_native_secure_key_store_1.default.get(KeyStoreWrapper.IS_BIOMETRICS_ENABLED);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async setIsBiometricsEnabled() {
        try {
            await react_native_secure_key_store_1.default.set(KeyStoreWrapper.IS_BIOMETRICS_ENABLED, "1", {
                accessible: react_native_secure_key_store_1.ACCESSIBLE.ALWAYS_THIS_DEVICE_ONLY,
            });
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async removeIsBiometricsEnabled() {
        try {
            await react_native_secure_key_store_1.default.remove(KeyStoreWrapper.IS_BIOMETRICS_ENABLED);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async getIsPinEnabled() {
        try {
            await react_native_secure_key_store_1.default.get(KeyStoreWrapper.PIN);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async getPinOrEmptyString() {
        try {
            return await react_native_secure_key_store_1.default.get(KeyStoreWrapper.PIN);
        }
        catch (_a) {
            return "";
        }
    }
    static async setPin(pin) {
        try {
            await react_native_secure_key_store_1.default.set(KeyStoreWrapper.PIN, pin, {
                accessible: react_native_secure_key_store_1.ACCESSIBLE.ALWAYS_THIS_DEVICE_ONLY,
            });
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async removePin() {
        try {
            await react_native_secure_key_store_1.default.remove(KeyStoreWrapper.PIN);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async getPinAttemptsOrZero() {
        try {
            return Number(await react_native_secure_key_store_1.default.get(KeyStoreWrapper.PIN_ATTEMPTS));
        }
        catch (_a) {
            return 0;
        }
    }
    static async setPinAttempts(pinAttempts) {
        try {
            await react_native_secure_key_store_1.default.set(KeyStoreWrapper.PIN_ATTEMPTS, pinAttempts, {
                accessible: react_native_secure_key_store_1.ACCESSIBLE.ALWAYS_THIS_DEVICE_ONLY,
            });
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    static async resetPinAttempts() {
        return KeyStoreWrapper.setPinAttempts("0");
    }
    static async removePinAttempts() {
        try {
            await react_native_secure_key_store_1.default.remove(KeyStoreWrapper.PIN_ATTEMPTS);
            return true;
        }
        catch (_a) {
            return false;
        }
    }
}
exports.default = KeyStoreWrapper;
KeyStoreWrapper.IS_BIOMETRICS_ENABLED = "isBiometricsEnabled";
KeyStoreWrapper.PIN = "PIN";
KeyStoreWrapper.PIN_ATTEMPTS = "pinAttempts";
//# sourceMappingURL=secureStorage.js.map