"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnDeviceSecuritySetting = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const secureStorage_1 = __importDefault(require("@app/utils/storage/secureStorage"));
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const OnDeviceSecuritySetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const securityAction = async () => {
        const isBiometricsEnabled = await secureStorage_1.default.getIsBiometricsEnabled();
        const isPinEnabled = await secureStorage_1.default.getIsPinEnabled();
        navigate("security", {
            mIsBiometricsEnabled: isBiometricsEnabled,
            mIsPinEnabled: isPinEnabled,
        });
    };
    return (<row_1.SettingsRow title={LL.common.onDeviceSecurity()} leftIcon="shield-half-outline" action={securityAction}/>);
};
exports.OnDeviceSecuritySetting = OnDeviceSecuritySetting;
//# sourceMappingURL=sp-security.js.map