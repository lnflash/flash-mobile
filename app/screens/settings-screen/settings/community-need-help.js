"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeedHelpSetting = void 0;
const react_native_1 = require("react-native");
const react_native_device_info_1 = require("react-native-device-info");
// components
const row_1 = require("../row");
const group_1 = require("../group");
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
// utils
const helper_1 = require("@app/utils/helper");
const external_1 = require("@app/utils/external");
const config_1 = require("@app/config");
const NeedHelpSetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<group_1.SettingsGroup name={LL.support.contactUs()} items={[Discord, WhatsApp, Email]}/>);
};
exports.NeedHelpSetting = NeedHelpSetting;
const Discord = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<row_1.SettingsRow title={LL.support.discord()} leftIcon="logo-discord" action={() => react_native_1.Linking.openURL("https://discord.gg/8jCg8eCRhF")}/>);
};
const WhatsApp = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const bankName = appConfig.galoyInstance.name;
    const contactMessageBody = LL.support.defaultSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: (0, react_native_device_info_1.getReadableVersion)(),
        bankName,
    });
    return (<row_1.SettingsRow title={LL.support.whatsapp()} leftIcon="logo-whatsapp" action={() => (0, external_1.openWhatsApp)(config_1.WHATSAPP_CONTACT_NUMBER, contactMessageBody)}/>);
};
const Email = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const bankName = appConfig.galoyInstance.name;
    const contactMessageBody = LL.support.defaultSupportMessage({
        os: helper_1.isIos ? "iOS" : "Android",
        version: (0, react_native_device_info_1.getReadableVersion)(),
        bankName,
    });
    const contactMessageSubject = LL.support.defaultEmailSubject({
        bankName,
    });
    return (<row_1.SettingsRow title={LL.support.email()} leftIcon="mail-outline" action={() => react_native_1.Linking.openURL(`mailto:${config_1.CONTACT_EMAIL_ADDRESS}?subject=${encodeURIComponent(contactMessageSubject)}&body=${encodeURIComponent(contactMessageBody)}`)}/>);
};
//# sourceMappingURL=community-need-help.js.map