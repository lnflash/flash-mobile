"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountPOS = void 0;
const react_native_1 = require("react-native");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const row_1 = require("../row");
const AccountPOS = () => {
    var _a;
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const posUrl = appConfig.galoyInstance.posUrl;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    if (!((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username))
        return <></>;
    const pos = `${posUrl}/${data.me.username}`;
    return (<row_1.SettingsRow loading={loading} title={LL.SettingsScreen.pos()} subtitle={pos} subtitleShorter={data.me.username.length > 22} leftIcon="calculator" rightIcon={<galoy_icon_1.GaloyIcon name="link" size={24}/>} action={() => {
            clipboard_1.default.setString(pos);
            (0, toast_1.toastShow)({
                type: "success",
                message: (translations) => translations.GaloyAddressScreen.copiedCashRegisterLinkToClipboard(),
                currentTranslation: LL,
            });
            react_native_1.Linking.openURL(pos);
        }}/>);
};
exports.AccountPOS = AccountPOS;
//# sourceMappingURL=account-pos.js.map