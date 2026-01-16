"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_native_fingerprint_scanner_1 = __importDefault(require("react-native-fingerprint-scanner"));
const crashlytics_1 = require("@react-native-firebase/crashlytics");
class BiometricWrapper {
    static async isSensorAvailable() {
        try {
            const biometryType = await react_native_fingerprint_scanner_1.default.isSensorAvailable();
            return biometryType !== null;
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
            }
            return false;
        }
    }
    static async authenticate(description, handleSuccess, handleFailure) {
        if (this.isHandlingAuthenticate)
            return;
        this.isHandlingAuthenticate = true;
        try {
            react_native_fingerprint_scanner_1.default.release();
            await react_native_fingerprint_scanner_1.default.authenticate({
                description,
                fallbackEnabled: true,
            });
            handleSuccess();
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
            }
            console.debug({ err }, "error during biometric authentication");
            handleFailure();
        }
        finally {
            react_native_fingerprint_scanner_1.default.release();
            this.isHandlingAuthenticate = false;
        }
    }
}
exports.default = BiometricWrapper;
BiometricWrapper.isHandlingAuthenticate = false;
//# sourceMappingURL=biometricAuthentication.js.map