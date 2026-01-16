"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountStaticQR = void 0;
const react_native_1 = require("react-native");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const row_1 = require("../row");
const AccountStaticQR = () => {
    var _a;
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const posUrl = appConfig.galoyInstance.posUrl;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    if (!((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username))
        return <></>;
    const qrUrl = `${posUrl}/${data.me.username}/print`;
    return (<row_1.SettingsRow loading={loading} title={LL.SettingsScreen.staticQr()} subtitle={qrUrl} subtitleShorter={true} leftIcon="qr-code-outline" rightIcon={<galoy_icon_1.GaloyIcon name="link" size={24}/>} action={() => {
            react_native_1.Linking.openURL(qrUrl);
        }}/>);
};
exports.AccountStaticQR = AccountStaticQR;
//# sourceMappingURL=account-static-qr.js.map