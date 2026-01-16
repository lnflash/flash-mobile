"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailSetting = void 0;
const react_native_1 = require("react-native");
const client_1 = require("@apollo/client");
const galoy_icon_button_1 = require("@app/components/atomic/galoy-icon-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const toast_1 = require("@app/utils/toast");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const row_1 = require("../../row");
const login_methods_hook_1 = require("../login-methods-hook");
(0, client_1.gql) `
  mutation userEmailDelete {
    userEmailDelete {
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

  mutation userEmailRegistrationInitiate($input: UserEmailRegistrationInitiateInput!) {
    userEmailRegistrationInitiate(input: $input) {
      errors {
        message
      }
      emailRegistrationId
      me {
        id
        email {
          address
          verified
        }
      }
    }
  }
`;
const title = (email, emailVerified, LL) => {
    if (email) {
        if (emailVerified)
            return LL.AccountScreen.email();
        return LL.AccountScreen.unverifiedEmail();
    }
    return LL.AccountScreen.tapToAddEmail();
};
const EmailSetting = () => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { navigate } = (0, native_1.useNavigation)();
    const { loading, email, emailVerified, bothEmailAndPhoneVerified } = (0, login_methods_hook_1.useLoginMethods)();
    const [emailDeleteMutation, { loading: emDelLoading }] = (0, generated_1.useUserEmailDeleteMutation)();
    const [setEmailMutation, { loading: emRegLoading }] = (0, generated_1.useUserEmailRegistrationInitiateMutation)();
    const deleteEmail = async () => {
        try {
            await emailDeleteMutation();
            (0, toast_1.toastShow)({
                type: "success",
                message: LL.AccountScreen.emailDeletedSuccessfully(),
                currentTranslation: LL,
            });
        }
        catch (err) {
            react_native_1.Alert.alert(LL.common.error(), err instanceof Error ? err.message : "");
        }
    };
    const deleteEmailPrompt = async () => {
        react_native_1.Alert.alert(LL.AccountScreen.deleteEmailPromptTitle(), LL.AccountScreen.deleteEmailPromptContent(), [
            { text: LL.common.cancel(), onPress: () => { } },
            {
                text: LL.common.yes(),
                onPress: async () => {
                    deleteEmail();
                },
            },
        ]);
    };
    const tryConfirmEmailAgain = async (email) => {
        try {
            await emailDeleteMutation({
                // to avoid flacky behavior
                // this could lead to inconsistent state if delete works but set fails
                fetchPolicy: "no-cache",
            });
            const { data } = await setEmailMutation({
                variables: { input: { email } },
            });
            const errors = data === null || data === void 0 ? void 0 : data.userEmailRegistrationInitiate.errors;
            if (errors && errors.length > 0) {
                react_native_1.Alert.alert(errors[0].message);
            }
            const emailRegistrationId = data === null || data === void 0 ? void 0 : data.userEmailRegistrationInitiate.emailRegistrationId;
            if (emailRegistrationId) {
                navigate("emailRegistrationValidate", {
                    emailRegistrationId,
                    email,
                });
            }
            else {
                console.warn("no flow returned");
            }
        }
        catch (err) {
            console.error(err, "error in setEmailMutation");
        }
    };
    const reVerifyEmailPrompt = () => {
        if (!email)
            return;
        react_native_1.Alert.alert(LL.AccountScreen.emailUnverified(), LL.AccountScreen.emailUnverifiedContent(), [
            { text: LL.common.cancel(), onPress: () => { } },
            {
                text: LL.common.ok(),
                onPress: () => tryConfirmEmailAgain(email),
            },
        ]);
    };
    const RightIcon = email ? (<react_native_1.View style={styles.sidetoside}>
      {!emailVerified && (<galoy_icon_button_1.GaloyIconButton name="refresh" size="medium" onPress={reVerifyEmailPrompt}/>)}
      {(bothEmailAndPhoneVerified || (email && !emailVerified)) && (<galoy_icon_button_1.GaloyIconButton name="close" size="medium" onPress={deleteEmailPrompt}/>)}
    </react_native_1.View>) : undefined;
    return (<row_1.SettingsRow loading={loading} spinner={emDelLoading || emRegLoading} title={title(email, emailVerified, LL)} subtitle={emailVerified ? email === null || email === void 0 ? void 0 : email.toString() : email} leftIcon="mail-outline" action={email ? null : () => navigate("emailRegistrationInitiate")} rightIcon={RightIcon}/>);
};
exports.EmailSetting = EmailSetting;
const useStyles = (0, themed_1.makeStyles)(() => ({
    sidetoside: {
        display: "flex",
        flexDirection: "row",
        columnGap: 10,
    },
}));
//# sourceMappingURL=email.js.map