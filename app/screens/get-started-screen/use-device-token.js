"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppCheckToken = void 0;
const react_1 = require("react");
const app_check_1 = require("@react-native-firebase/app-check");
const react_native_config_1 = __importDefault(require("react-native-config"));
const rnfbProvider = new app_check_1.ReactNativeFirebaseAppCheckProvider();
rnfbProvider.configure({
    android: {
        provider: __DEV__ ? "debug" : "playIntegrity",
        debugToken: react_native_config_1.default.APP_CHECK_ANDROID_DEBUG_TOKEN,
    },
    apple: {
        provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback",
        debugToken: react_native_config_1.default.APP_CHECK_IOS_DEBUG_TOKEN,
    },
});
const getAppCheckToken = async () => {
    try {
        const appCheck = await (0, app_check_1.initializeAppCheck)(undefined, {
            provider: rnfbProvider,
            isTokenAutoRefreshEnabled: true,
        });
        const result = await appCheck.getToken(true);
        const token = result.token;
        return token;
    }
    catch (err) {
        console.log("getDeviceToken error", err);
        return undefined;
    }
};
exports.getAppCheckToken = getAppCheckToken;
const useAppCheckToken = ({ skip = false, }) => {
    const [token, setToken] = (0, react_1.useState)(undefined);
    const [loading, setLoading] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (skip) {
            return;
        }
        ;
        (async () => {
            setLoading(true);
            const result = await (0, exports.getAppCheckToken)();
            setToken(result);
            setLoading(false);
        })();
    }, [skip]);
    return [token, loading];
};
exports.default = useAppCheckToken;
//# sourceMappingURL=use-device-token.js.map