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
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const messaging_1 = require("@react-native-firebase/messaging");
const Keychain = __importStar(require("react-native-keychain"));
// store
const userSlice_1 = require("@app/store/redux/slices/userSlice");
// hooks
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const persistent_state_1 = require("@app/store/persistent-state");
const redux_1 = require("@app/store/redux");
const useFlashcard_1 = require("./useFlashcard");
// utils
const secureStorage_1 = __importDefault(require("../utils/storage/secureStorage"));
const config_1 = require("@app/config");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const DEVICE_ACCOUNT_CREDENTIALS_KEY = "device-account";
const useLogout = () => {
    const client = (0, client_1.useApolloClient)();
    const dispatch = (0, redux_1.useAppDispatch)();
    const { resetState } = (0, persistent_state_1.usePersistentStateContext)();
    const { resetFlashcard } = (0, useFlashcard_1.useFlashcard)();
    const [userLogoutMutation] = (0, generated_1.useUserLogoutMutation)({
        fetchPolicy: "no-cache",
    });
    const logout = async (clearDeviceCred) => {
        try {
            const deviceToken = await (0, messaging_1.getMessaging)().getToken();
            userLogoutMutation({ variables: { input: { deviceToken } } })
                .then(async (res) => {
                var _a, _b;
                console.log("USER LOGOUT MUTATION RES: ", (_a = res.data) === null || _a === void 0 ? void 0 : _a.userLogout);
                if ((_b = res.data) === null || _b === void 0 ? void 0 : _b.userLogout.success) {
                    await cleanUp(clearDeviceCred);
                }
            })
                .catch((err) => {
                console.log("USER LOGOUT MUTATION ERR: ", err);
            });
        }
        catch (err) {
            console.log("USER LOGOUT MUTATION ERR CATCH: ", err);
        }
    };
    const cleanUp = async (clearDeviceCred) => {
        await (0, breez_sdk_liquid_1.disconnectToSDK)();
        await client.cache.reset();
        await async_storage_1.default.multiRemove([config_1.SCHEMA_VERSION_KEY]);
        await secureStorage_1.default.removeIsBiometricsEnabled();
        await secureStorage_1.default.removePin();
        await secureStorage_1.default.removePinAttempts();
        dispatch((0, userSlice_1.resetUserSlice)());
        resetState();
        resetFlashcard();
        if (clearDeviceCred) {
            await Keychain.resetInternetCredentials(DEVICE_ACCOUNT_CREDENTIALS_KEY);
        }
    };
    return {
        logout,
        cleanUp,
    };
};
exports.default = useLogout;
//# sourceMappingURL=use-logout.js.map