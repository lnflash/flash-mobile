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
exports.ContactSupportButton = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_1 = __importStar(require("react"));
const galoy_tertiary_button_1 = require("../atomic/galoy-tertiary-button");
const contact_modal_1 = __importStar(require("../contact-modal/contact-modal"));
const react_native_device_info_1 = require("react-native-device-info");
const helper_1 = require("@app/utils/helper");
const hooks_1 = require("@app/hooks");
const ContactSupportButton = ({ containerStyle, }) => {
    const [showContactSupport, setShowContactSupport] = (0, react_1.useState)(false);
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { name: bankName } = appConfig.galoyInstance;
    const messageBody = LL.support.defaultSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: (0, react_native_device_info_1.getReadableVersion)(),
        bankName,
    });
    const messageSubject = LL.support.defaultEmailSubject({
        bankName,
    });
    return (<>
      <contact_modal_1.default messageBody={messageBody} messageSubject={messageSubject} isVisible={showContactSupport} toggleModal={() => setShowContactSupport(!showContactSupport)} 
    // Assuming the support button is always used for 1:1 support I'm excluding community channels
    supportChannelsToHide={[contact_modal_1.SupportChannels.Mattermost, contact_modal_1.SupportChannels.Telegram]}/>
      <galoy_tertiary_button_1.GaloyTertiaryButton containerStyle={containerStyle} title={LL.support.contactUs()} onPress={() => setShowContactSupport(true)}/>
    </>);
};
exports.ContactSupportButton = ContactSupportButton;
//# sourceMappingURL=contact-support-button.js.map