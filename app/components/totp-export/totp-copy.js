"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopySecretComponent = void 0;
const react_1 = __importDefault(require("react"));
const clipboard_1 = __importDefault(require("@react-native-clipboard/clipboard"));
const toast_1 = require("@app/utils/toast");
const galoy_secondary_button_1 = require("../atomic/galoy-secondary-button");
const i18n_react_1 = require("@app/i18n/i18n-react");
const CopySecretComponent = ({ secret }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const copyToClipboard = () => {
        clipboard_1.default.setString(secret);
        (0, toast_1.toastShow)({
            type: "success",
            message: LL.CopySecretComponent.toastMessage(),
        });
    };
    return (<galoy_secondary_button_1.GaloySecondaryButton title={LL.CopySecretComponent.button()} onPress={copyToClipboard}/>);
};
exports.CopySecretComponent = CopySecretComponent;
//# sourceMappingURL=totp-copy.js.map