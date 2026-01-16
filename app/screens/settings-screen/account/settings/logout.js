"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogOut = void 0;
const react_native_1 = require("react-native");
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const button_1 = require("../../button");
const login_methods_hook_1 = require("../login-methods-hook");
const LogOut = () => {
    const navigation = (0, native_1.useNavigation)();
    const { phone, bothEmailAndPhoneVerified, email, emailVerified } = (0, login_methods_hook_1.useLoginMethods)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { logout } = (0, use_logout_1.default)();
    const logoutAlert = () => {
        const logAlertContent = () => {
            if (phone && email && bothEmailAndPhoneVerified) {
                return LL.AccountScreen.logoutAlertContentPhoneEmail({
                    phoneNumber: phone,
                    email,
                });
            }
            else if (email && emailVerified) {
                return LL.AccountScreen.logoutAlertContentEmail({ email });
            }
            // phone verified
            if (phone)
                return LL.AccountScreen.logoutAlertContentPhone({ phoneNumber: phone });
            console.error("Phone and email both not verified - Impossible to reach");
        };
        react_native_1.Alert.alert(LL.AccountScreen.logoutAlertTitle(), logAlertContent(), [
            {
                text: LL.common.cancel(),
                style: "cancel",
            },
            {
                text: LL.AccountScreen.IUnderstand(),
                onPress: logoutAction,
            },
        ]);
    };
    const logoutAction = async () => {
        await logout();
        navigation.reset({
            index: 0,
            routes: [{ name: "getStarted" }],
        });
        react_native_1.Alert.alert(LL.common.loggedOut(), "", [
            {
                text: LL.common.ok(),
                onPress: () => { },
            },
        ]);
    };
    return (<button_1.SettingsButton title={LL.AccountScreen.logOutAndDeleteLocalData()} variant="warning" onPress={logoutAlert}/>);
};
exports.LogOut = LogOut;
//# sourceMappingURL=logout.js.map