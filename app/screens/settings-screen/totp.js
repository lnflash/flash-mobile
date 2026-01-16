"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TotpSetting = void 0;
const react_1 = require("react");
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const row_1 = require("./row");
(0, client_1.gql) `
  mutation userTotpDeleteA($input: UserTotpDeleteInput!) {
    userTotpDelete(input: $input) {
      errors {
        message
      }
      me {
        id
        phone
        totpEnabled
        email {
          address
          verified
        }
      }
    }
  }
`;
const TotpSetting = () => {
    var _a;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const [spinner, setSpinner] = (0, react_1.useState)(false);
    const { data, loading, refetch: refetchTotpSettings, } = (0, generated_1.useSettingsScreenQuery)({ fetchPolicy: "cache-only" });
    const [totpDeleteMutation] = (0, generated_1.useUserTotpDeleteMutation)();
    const totpEnabled = Boolean((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.totpEnabled);
    const totpDelete = async () => {
        react_native_1.Alert.alert(LL.AccountScreen.totpDeleteAlertTitle(), LL.AccountScreen.totpDeleteAlertContent(), [
            { text: LL.common.cancel(), onPress: () => { } },
            {
                text: LL.common.ok(),
                onPress: async () => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    setSpinner(true);
                    try {
                        const res = await totpDeleteMutation();
                        await refetchTotpSettings();
                        setSpinner(false);
                        if (((_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.userTotpDelete) === null || _b === void 0 ? void 0 : _b.me) === null || _c === void 0 ? void 0 : _c.totpEnabled) === false) {
                            react_native_1.Alert.alert(LL.AccountScreen.totpDeactivated());
                        }
                        else {
                            console.log((_d = res.data) === null || _d === void 0 ? void 0 : _d.userTotpDelete.errors);
                            react_native_1.Alert.alert(LL.common.error(), (_g = (_f = (_e = res.data) === null || _e === void 0 ? void 0 : _e.userTotpDelete) === null || _f === void 0 ? void 0 : _f.errors[0]) === null || _g === void 0 ? void 0 : _g.message);
                        }
                    }
                    catch (_h) {
                        react_native_1.Alert.alert(LL.common.error());
                    }
                },
            },
        ]);
    };
    return (<row_1.SettingsRow loading={loading} spinner={spinner} title={LL.AccountScreen.totp()} subtitle={totpEnabled ? LL.common.enabled() : undefined} leftIcon="lock-closed-outline" action={totpEnabled
            ? null
            : () => {
                navigate("totpRegistrationInitiate");
            }} rightIcon={totpEnabled ? (<galoy_icon_button_1.GaloyIconButton name="close" size="medium" onPress={totpDelete}/>) : undefined}/>);
};
exports.TotpSetting = TotpSetting;
//# sourceMappingURL=totp.js.map