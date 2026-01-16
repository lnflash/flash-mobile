"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationSetting = void 0;
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("../row");
const NotificationSetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    return (<row_1.SettingsRow title={LL.common.notifications()} leftIcon="notifications-outline" action={() => navigate("notificationSettingsScreen")}/>);
};
exports.NotificationSetting = NotificationSetting;
//# sourceMappingURL=sp-notifications.js.map