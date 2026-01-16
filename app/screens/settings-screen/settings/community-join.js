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
exports.JoinCommunitySetting = void 0;
const react_1 = require("react");
const react_native_device_info_1 = require("react-native-device-info");
const contact_modal_1 = __importStar(require("@app/components/contact-modal/contact-modal"));
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const helper_1 = require("@app/utils/helper");
const row_1 = require("../row");
const JoinCommunitySetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const bankName = appConfig.galoyInstance.name;
    const [isModalVisible, setIsModalVisible] = (0, react_1.useState)(false);
    const toggleModal = () => setIsModalVisible((x) => !x);
    const contactMessageBody = LL.support.defaultSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: (0, react_native_device_info_1.getReadableVersion)(),
        bankName,
    });
    const contactMessageSubject = LL.support.defaultEmailSubject({
        bankName,
    });
    return (<>
      <row_1.SettingsRow title={LL.support.joinTheCommunity()} leftIcon="people-outline" rightIcon={null} action={toggleModal}/>
      <contact_modal_1.default isVisible={isModalVisible} toggleModal={toggleModal} messageBody={contactMessageBody} messageSubject={contactMessageSubject} supportChannelsToHide={[
            contact_modal_1.SupportChannels.Email,
            contact_modal_1.SupportChannels.StatusPage,
            contact_modal_1.SupportChannels.WhatsApp,
            contact_modal_1.SupportChannels.Mattermost,
        ]}/>
    </>);
};
exports.JoinCommunitySetting = JoinCommunitySetting;
//# sourceMappingURL=community-join.js.map