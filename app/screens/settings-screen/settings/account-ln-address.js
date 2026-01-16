"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountLNAddress = void 0;
const react_1 = require("react");
const set_lightning_address_modal_1 = require("@app/components/set-lightning-address-modal");
const generated_1 = require("@app/graphql/generated");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const row_1 = require("../row");
const AccountLNAddress = () => {
    var _a, _b, _c;
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const hostName = appConfig.galoyInstance.lnAddressHostname;
    const [isModalShown, setModalShown] = (0, react_1.useState)(false);
    const toggleModalVisibility = () => setModalShown((x) => !x);
    const { data, loading } = (0, generated_1.useSettingsScreenQuery)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const hasUsername = Boolean((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username);
    const lnAddress = `${(_b = data === null || data === void 0 ? void 0 : data.me) === null || _b === void 0 ? void 0 : _b.username}@${hostName}`;
    return (<>
      <row_1.SettingsRow loading={loading} title={hasUsername
            ? LL.GaloyAddressScreen.yourLightningAddress()
            : LL.SettingsScreen.setYourLightningAddress()} subtitle={hasUsername ? lnAddress : undefined} subtitleShorter={(((_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.username) || "").length > 22} leftIcon="at-outline" rightIcon={hasUsername ? "copy-outline" : undefined} action={() => {
            if (hasUsername) {
                clipboard_1.default.setString(lnAddress);
                (0, toast_1.toastShow)({
                    type: "success",
                    message: (translations) => translations.GaloyAddressScreen.copiedLightningAddressToClipboard(),
                    currentTranslation: LL,
                });
            }
            else {
                toggleModalVisibility();
            }
        }}/>
      <set_lightning_address_modal_1.SetLightningAddressModal isVisible={isModalShown} toggleModal={toggleModalVisibility}/>
    </>);
};
exports.AccountLNAddress = AccountLNAddress;
//# sourceMappingURL=account-ln-address.js.map