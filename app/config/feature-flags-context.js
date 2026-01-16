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
exports.useFeatureFlags = exports.FeatureFlagContextProvider = exports.FeatureFlagContext = void 0;
const react_1 = __importStar(require("react"));
const remote_config_1 = require("@react-native-firebase/remote-config");
const hooks_1 = require("@app/hooks");
const level_context_1 = require("@app/graphql/level-context");
const DeviceAccountEnabledKey = "deviceAccountEnabledRestAuth";
const defaultRemoteConfig = {
    deviceAccountEnabledRestAuth: true,
};
const defaultFeatureFlags = {
    deviceAccountEnabled: false,
};
(0, remote_config_1.getRemoteConfig)().setDefaults(defaultRemoteConfig);
(0, remote_config_1.getRemoteConfig)().setConfigSettings({
    minimumFetchIntervalMillis: 0,
});
exports.FeatureFlagContext = (0, react_1.createContext)(defaultFeatureFlags);
const FeatureFlagContextProvider = ({ children, }) => {
    const [remoteConfig, setRemoteConfig] = (0, react_1.useState)(defaultRemoteConfig);
    const { currentLevel } = (0, level_context_1.useLevel)();
    const [remoteConfigReady, setRemoteConfigReady] = (0, react_1.useState)(false);
    const { appConfig: { galoyInstance }, } = (0, hooks_1.useAppConfig)();
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            try {
                await (0, remote_config_1.getRemoteConfig)().fetchAndActivate();
                const deviceAccountEnabledRestAuth = (0, remote_config_1.getRemoteConfig)()
                    .getValue(DeviceAccountEnabledKey)
                    .asBoolean();
                setRemoteConfig({ deviceAccountEnabledRestAuth });
            }
            catch (err) {
                console.error("Error fetching remote config: ", err);
            }
            finally {
                setRemoteConfigReady(true);
            }
        })();
    }, []);
    const featureFlags = {
        deviceAccountEnabled: remoteConfig.deviceAccountEnabledRestAuth || galoyInstance.id === "Local",
    };
    if (!remoteConfigReady && currentLevel === "NonAuth") {
        return null;
    }
    return (<exports.FeatureFlagContext.Provider value={featureFlags}>
      {children}
    </exports.FeatureFlagContext.Provider>);
};
exports.FeatureFlagContextProvider = FeatureFlagContextProvider;
const useFeatureFlags = () => (0, react_1.useContext)(exports.FeatureFlagContext);
exports.useFeatureFlags = useFeatureFlags;
//# sourceMappingURL=feature-flags-context.js.map