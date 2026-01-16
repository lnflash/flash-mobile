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
exports.importNsec = exports.validateNsec = exports.KEYCHAIN_NOSTRCREDS_KEY = void 0;
const Keychain = __importStar(require("react-native-keychain"));
exports.KEYCHAIN_NOSTRCREDS_KEY = "nostr_creds_key";
const validateNsec = (nsec) => {
    const bech32Pattern = /^nsec1[a-z0-9]{58}$/;
    return bech32Pattern.test(nsec);
};
exports.validateNsec = validateNsec;
const importNsec = async (nsec, onError, updateFlashBackend) => {
    if (!nsec) {
        onError("nsec cannot be empty");
        return false;
    }
    if (!(0, exports.validateNsec)(nsec)) {
        onError("Invalid nsec format. Please check the key and try again.");
        return false;
    }
    try {
        // Save the nsec key to the keychain
        await Keychain.setInternetCredentials(exports.KEYCHAIN_NOSTRCREDS_KEY, exports.KEYCHAIN_NOSTRCREDS_KEY, nsec);
        await updateFlashBackend();
        return true;
    }
    catch (error) {
        console.error("Failed to save nsec to keychain", error);
        onError("Failed to import nsec. Please try again.");
        return false;
    }
};
exports.importNsec = importNsec;
//# sourceMappingURL=utils.js.map