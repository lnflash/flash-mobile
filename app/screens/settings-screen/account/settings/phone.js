"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhoneSetting = void 0;
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const native_1 = require("@react-navigation/native");
const row_1 = require("../../row");
const login_methods_hook_1 = require("../login-methods-hook");
(0, client_1.gql) `
  mutation userPhoneDelete {
    userPhoneDelete {
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
const PhoneSetting = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { loading, phone, emailVerified, phoneVerified } = (0, login_methods_hook_1.useLoginMethods)();
    const [phoneDeleteMutation, { loading: phoneDeleteLoading }] = (0, generated_1.useUserPhoneDeleteMutation)();
    const deletePhone = async () => {
        try {
            await phoneDeleteMutation();
            (0, toast_1.toastShow)({
                message: LL.AccountScreen.phoneDeletedSuccessfully(),
                currentTranslation: LL,
                type: "success",
            });
        }
        catch (err) {
            react_native_1.Alert.alert(LL.common.error(), err instanceof Error ? err.message : "");
        }
    };
    const deletePhonePrompt = async () => {
        react_native_1.Alert.alert(LL.AccountScreen.deletePhonePromptTitle(), LL.AccountScreen.deletePhonePromptContent(), [
            { text: LL.common.cancel(), onPress: () => { } },
            {
                text: LL.common.yes(),
                onPress: async () => {
                    deletePhone();
                },
            },
        ]);
    };
    return (<row_1.SettingsRow loading={loading} title={phoneVerified
            ? LL.AccountScreen.phoneNumber()
            : LL.AccountScreen.tapToAddPhoneNumber()} subtitle={phone || undefined} leftIcon="call-outline" action={phoneVerified ? null : () => navigate("phoneRegistrationInitiate")} spinner={phoneDeleteLoading} rightIcon={phoneVerified ? (emailVerified ? (<galoy_icon_button_1.GaloyIconButton name="close" size="medium" onPress={deletePhonePrompt}/>) : null) : ("chevron-forward")}/>);
};
exports.PhoneSetting = PhoneSetting;
//# sourceMappingURL=phone.js.map