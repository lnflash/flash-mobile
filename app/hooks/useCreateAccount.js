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
exports.useCreateAccount = void 0;
const uuid_1 = require("uuid");
const Keychain = __importStar(require("react-native-keychain"));
const analytics_1 = require("@react-native-firebase/analytics");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const react_native_securerandom_1 = require("react-native-securerandom");
// utils
const analytics_2 = require("@app/utils/analytics");
// hooks
const use_app_config_1 = require("./use-app-config");
const use_device_token_1 = __importDefault(require("@app/screens/get-started-screen/use-device-token"));
const feature_flags_context_1 = require("@app/config/feature-flags-context");
const DEVICE_ACCOUNT_CREDENTIALS_KEY = "device-account";
const useCreateAccount = () => {
    const { deviceAccountEnabled } = (0, feature_flags_context_1.useFeatureFlags)();
    const [appCheckToken, loading] = (0, use_device_token_1.default)({ skip: !deviceAccountEnabled });
    const { appConfig: { galoyInstance: { authUrl }, }, } = (0, use_app_config_1.useAppConfig)();
    const createDeviceAccountAndLogin = async () => {
        try {
            const credentials = await Keychain.getInternetCredentials(DEVICE_ACCOUNT_CREDENTIALS_KEY);
            let username;
            let password;
            if (credentials) {
                username = credentials.username;
                password = credentials.password;
            }
            else {
                username = await generateSecureRandomUUID();
                password = await generateSecureRandomUUID();
                const setPasswordResult = await Keychain.setInternetCredentials(DEVICE_ACCOUNT_CREDENTIALS_KEY, username, password);
                if (!setPasswordResult) {
                    throw new Error("Error setting device account credentials");
                }
            }
            (0, analytics_2.logAttemptCreateDeviceAccount)();
            const auth = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
            const res = await fetch(authUrl + "/auth/create/device-account", {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                    Appcheck: `${appCheckToken}` || "undefined",
                },
            });
            if (!res.ok) {
                console.error(`Error fetching from server: ${res.status} ${res.statusText}`);
                return; // Or handle this error appropriately
            }
            const data = await res.json();
            // alert("SUCCESS")
            const authToken = data.result;
            if (!authToken) {
                throw new Error("Error getting session token");
            }
            (0, analytics_2.logCreatedDeviceAccount)();
            (0, analytics_1.getAnalytics)().logLogin({ method: "device" });
            return authToken;
        }
        catch (error) {
            (0, analytics_2.logCreateDeviceAccountFailure)();
            if (error instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(error);
            }
            return false;
        }
    };
    const generateSecureRandomUUID = async () => {
        const randomBytes = await (0, react_native_securerandom_1.generateSecureRandom)(16); // Generate 16 random bytes
        const uuid = (0, uuid_1.v4)({ random: randomBytes }); // Use the random seed to generate a UUID
        return uuid;
    };
    return {
        createDeviceAccountAndLogin,
        appcheckTokenLoading: loading,
    };
};
exports.useCreateAccount = useCreateAccount;
//# sourceMappingURL=useCreateAccount.js.map