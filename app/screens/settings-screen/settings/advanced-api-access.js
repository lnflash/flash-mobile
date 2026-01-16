"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiAccessSetting = void 0;
const react_native_1 = require("react-native");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const i18n_react_1 = require("@app/i18n/i18n-react");
const row_1 = require("../row");
const DASHBOARD_LINK = "https://dashboard.blink.sv";
const ApiAccessSetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<row_1.SettingsRow title={LL.SettingsScreen.apiAcess()} subtitle={DASHBOARD_LINK} subtitleShorter={true} leftIcon="code" rightIcon={<galoy_icon_1.GaloyIcon name="link" size={24}/>} action={() => {
            react_native_1.Linking.openURL(DASHBOARD_LINK);
        }}/>);
};
exports.ApiAccessSetting = ApiAccessSetting;
//# sourceMappingURL=advanced-api-access.js.map