"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountScreen = void 0;
const client_1 = require("@apollo/client");
const screen_1 = require("@app/components/screen");
const generated_1 = require("@app/graphql/generated");
const level_context_1 = require("@app/graphql/level-context");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const use_logout_1 = __importDefault(require("@app/hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const amounts_1 = require("@app/types/amounts");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const settings_row_1 = require("./settings-row");
const themed_1 = require("@rneui/themed");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const config_1 = require("@app/config");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
const wallets_utils_1 = require("@app/graphql/wallets-utils");
const native_1 = require("@react-navigation/native");
const hooks_1 = require("@app/hooks");
const use_nostr_profile_1 = __importDefault(require("@app/hooks/use-nostr-profile"));
(0, client_1.gql) `
  query accountScreen {
    me {
      id
      phone
      totpEnabled
      email {
        address
        verified
      }
      defaultAccount {
        id
        level
        wallets {
          id
          balance
          walletCurrency
        }
      }
    }
  }

  mutation accountDelete {
    accountDelete {
      errors {
        message
      }
      success
    }
  }

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

  mutation userTotpDelete($input: UserTotpDeleteInput!) {
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
const AccountScreen = () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const navigation = (0, native_1.useNavigation)();
    const { btcWallet } = (0, hooks_1.useBreez)();
    const { logout } = (0, use_logout_1.default)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const styles = useStyles();
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const { deleteNostrData } = (0, use_nostr_profile_1.default)();
    const authToken = appConfig.token;
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { isAtLeastLevelZero, currentLevel, isAtLeastLevelOne } = (0, level_context_1.useLevel)();
    const [deleteAccount] = (0, generated_1.useAccountDeleteMutation)();
    const [emailDeleteMutation] = (0, generated_1.useUserEmailDeleteMutation)();
    const [phoneDeleteMutation] = (0, generated_1.useUserPhoneDeleteMutation)();
    const [totpDeleteMutation] = (0, generated_1.useUserTotpDeleteMutation)();
    const [text, setText] = react_1.default.useState("");
    const [modalVisible, setModalVisible] = react_1.default.useState(false);
    const { data } = (0, generated_1.useAccountScreenQuery)({
        fetchPolicy: "cache-and-network",
        skip: !isAtLeastLevelZero,
    });
    const email = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.email) === null || _b === void 0 ? void 0 : _b.address;
    const emailVerified = Boolean(email) && Boolean((_d = (_c = data === null || data === void 0 ? void 0 : data.me) === null || _c === void 0 ? void 0 : _c.email) === null || _d === void 0 ? void 0 : _d.verified);
    const emailUnverified = Boolean(email) && !((_f = (_e = data === null || data === void 0 ? void 0 : data.me) === null || _e === void 0 ? void 0 : _e.email) === null || _f === void 0 ? void 0 : _f.verified);
    const phoneVerified = Boolean((_g = data === null || data === void 0 ? void 0 : data.me) === null || _g === void 0 ? void 0 : _g.phone);
    const phoneAndEmailVerified = phoneVerified && emailVerified;
    const emailString = String(email);
    const totpEnabled = Boolean((_h = data === null || data === void 0 ? void 0 : data.me) === null || _h === void 0 ? void 0 : _h.totpEnabled);
    const [setEmailMutation] = (0, generated_1.useUserEmailRegistrationInitiateMutation)();
    const usdWallet = (0, wallets_utils_1.getUsdWallet)((_k = (_j = data === null || data === void 0 ? void 0 : data.me) === null || _j === void 0 ? void 0 : _j.defaultAccount) === null || _k === void 0 ? void 0 : _k.wallets);
    const usdWalletBalance = (0, amounts_1.toUsdMoneyAmount)(usdWallet === null || usdWallet === void 0 ? void 0 : usdWallet.balance);
    const btcWalletBalance = (0, amounts_1.toBtcMoneyAmount)(btcWallet === null || btcWallet === void 0 ? void 0 : btcWallet.balance);
    const { formatMoneyAmount } = (0, use_display_currency_1.useDisplayCurrency)();
    let usdBalanceWarning = "";
    let btcBalanceWarning = "";
    let balancePositive = false;
    if (usdWalletBalance.amount > 0) {
        const balance = formatMoneyAmount && formatMoneyAmount({ moneyAmount: usdWalletBalance });
        usdBalanceWarning = LL.AccountScreen.usdBalanceWarning({ balance });
        balancePositive = true;
    }
    if (btcWalletBalance.amount > 0) {
        const balance = formatMoneyAmount && formatMoneyAmount({ moneyAmount: btcWalletBalance });
        btcBalanceWarning = LL.AccountScreen.btcBalanceWarning({ balance });
        balancePositive = true;
    }
    const dataBeta = (0, generated_1.useBetaQuery)();
    const beta = (_m = (_l = dataBeta.data) === null || _l === void 0 ? void 0 : _l.beta) !== null && _m !== void 0 ? _m : false;
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
    const deletePhone = async () => {
        try {
            await phoneDeleteMutation();
        }
        catch (err) {
            let message = "";
            if (err instanceof Error) {
                message = err === null || err === void 0 ? void 0 : err.message;
            }
            react_native_1.Alert.alert(LL.common.error(), message);
        }
    };
    const deleteEmail = async () => {
        try {
            await emailDeleteMutation();
        }
        catch (err) {
            let message = "";
            if (err instanceof Error) {
                message = err === null || err === void 0 ? void 0 : err.message;
            }
            react_native_1.Alert.alert(LL.common.error(), message);
        }
    };
    const logoutAlert = () => {
        const logAlertContent = () => {
            var _a;
            const phoneNumber = String((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.phone);
            if (phoneAndEmailVerified) {
                return LL.AccountScreen.logoutAlertContentPhoneEmail({
                    phoneNumber,
                    email: emailString,
                });
            }
            else if (emailVerified) {
                return LL.AccountScreen.logoutAlertContentEmail({ email: emailString });
            }
            // phone verified
            return LL.AccountScreen.logoutAlertContentPhone({ phoneNumber });
        };
        react_native_1.Alert.alert(LL.AccountScreen.logoutAlertTitle(), logAlertContent(), [
            {
                text: LL.common.cancel(),
                onPress: () => console.log("Cancel Pressed"),
                style: "cancel",
            },
            {
                text: LL.AccountScreen.IUnderstand(),
                onPress: logoutAction,
            },
        ]);
    };
    const logoutAction = async () => {
        try {
            await logout();
            react_native_1.Alert.alert(LL.common.loggedOut(), "", [
                {
                    text: LL.common.ok(),
                    onPress: () => navigation.reset({
                        index: 0,
                        routes: [{ name: "getStarted" }],
                    }),
                },
            ]);
        }
        catch (err) {
            // TODO: figure out why ListItem onPress is swallowing errors
            console.error(err);
        }
    };
    const deleteAccountAction = async () => {
        if (balancePositive) {
            const fullMessage = usdBalanceWarning +
                "\n" +
                btcBalanceWarning +
                "\n" +
                LL.support.deleteAccountBalanceWarning();
            react_native_1.Alert.alert(LL.common.warning(), fullMessage, [
                { text: LL.common.cancel(), onPress: () => { } },
                {
                    text: LL.common.yes(),
                    onPress: async () => setModalVisible(true),
                },
            ]);
        }
        else {
            setModalVisible(true);
        }
    };
    const deleteUserAccount = async () => {
        var _a, _b, _c, _d;
        try {
            const res = await deleteAccount();
            if ((_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.accountDelete) === null || _b === void 0 ? void 0 : _b.success) {
                await deleteNostrData();
                await logout();
                react_native_1.Alert.alert(LL.support.bye(), LL.support.deleteAccountConfirmation(), [
                    {
                        text: LL.common.ok(),
                        onPress: () => navigation.reset({
                            index: 0,
                            routes: [{ name: "getStarted" }],
                        }),
                    },
                ]);
            }
            else {
                react_native_1.Alert.alert(LL.common.error(), LL.support.deleteAccountError({ email: config_1.CONTACT_EMAIL_ADDRESS }) +
                    "\n\n" +
                    ((_d = (_c = res.data) === null || _c === void 0 ? void 0 : _c.accountDelete) === null || _d === void 0 ? void 0 : _d.errors[0].message));
            }
        }
        catch (err) {
            console.error(err);
            react_native_1.Alert.alert(LL.common.error(), LL.support.deleteAccountError({ email: config_1.CONTACT_EMAIL_ADDRESS }));
        }
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
                navigation.navigate("emailRegistrationValidate", {
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
        finally {
            // setLoading(false)
        }
    };
    const confirmEmailAgain = async () => {
        if (email) {
            react_native_1.Alert.alert(LL.AccountScreen.emailUnverified(), LL.AccountScreen.emailUnverifiedContent(), [
                { text: LL.common.cancel(), onPress: () => { } },
                {
                    text: LL.common.ok(),
                    onPress: () => tryConfirmEmailAgain(email),
                },
            ]);
        }
        else {
            console.error("email not set, wrong flow");
        }
    };
    const totpDelete = async () => {
        react_native_1.Alert.alert(LL.AccountScreen.totpDeleteAlertTitle(), LL.AccountScreen.totpDeleteAlertContent(), [
            { text: LL.common.cancel(), onPress: () => { } },
            {
                text: LL.common.ok(),
                onPress: async () => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    const res = await totpDeleteMutation({ variables: { input: { authToken } } });
                    if (((_c = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.userTotpDelete) === null || _b === void 0 ? void 0 : _b.me) === null || _c === void 0 ? void 0 : _c.totpEnabled) === false) {
                        react_native_1.Alert.alert(LL.AccountScreen.totpDeactivated());
                    }
                    else {
                        console.log((_d = res.data) === null || _d === void 0 ? void 0 : _d.userTotpDelete.errors);
                        react_native_1.Alert.alert(LL.common.error(), (_g = (_f = (_e = res.data) === null || _e === void 0 ? void 0 : _e.userTotpDelete) === null || _f === void 0 ? void 0 : _f.errors[0]) === null || _g === void 0 ? void 0 : _g.message);
                    }
                },
            },
        ]);
    };
    const accountSettingsList = [
        {
            category: LL.AccountScreen.accountLevel(),
            id: "level",
            icon: "flash",
            subTitleText: currentLevel,
            enabled: false,
            greyed: true,
        },
        {
            category: LL.common.transactionLimits(),
            id: "limits",
            icon: "custom-info-icon",
            action: () => navigation.navigate("transactionLimitsScreen"),
            enabled: isAtLeastLevelZero,
            greyed: !isAtLeastLevelZero,
            styleDivider: true,
        },
        {
            category: LL.AccountScreen.phoneNumberAuthentication(),
            id: "phone",
            icon: "call-outline",
            subTitleText: (_o = data === null || data === void 0 ? void 0 : data.me) === null || _o === void 0 ? void 0 : _o.phone,
            action: phoneVerified
                ? deletePhonePrompt
                : () => navigation.navigate("phoneRegistrationInitiate"),
            enabled: phoneAndEmailVerified || !phoneVerified,
            chevronLogo: phoneAndEmailVerified ? "close-circle-outline" : undefined,
            chevronColor: phoneAndEmailVerified ? colors.red : undefined,
            chevronSize: phoneAndEmailVerified ? 28 : undefined,
            hidden: !isAtLeastLevelOne,
        },
        {
            category: LL.AccountScreen.emailAuthentication(),
            id: "email",
            icon: "mail-outline",
            subTitleText: email !== null && email !== void 0 ? email : LL.AccountScreen.tapToAdd(),
            action: phoneAndEmailVerified
                ? deleteEmailPrompt
                : () => navigation.navigate("emailRegistrationInitiate"),
            enabled: phoneAndEmailVerified || !emailUnverified,
            chevronLogo: phoneAndEmailVerified ? "close-circle-outline" : undefined,
            chevronColor: phoneAndEmailVerified ? colors.red : undefined,
            chevronSize: phoneAndEmailVerified ? 28 : undefined,
            styleDivider: !emailUnverified,
        },
        {
            category: LL.AccountScreen.unverified(),
            id: "confirm-email",
            icon: "checkmark-circle-outline",
            subTitleText: LL.AccountScreen.unverifiedContent(),
            action: confirmEmailAgain,
            enabled: Boolean(emailUnverified),
            chevron: false,
            dangerous: true,
            hidden: !emailUnverified,
        },
        {
            category: LL.AccountScreen.removeEmail(),
            id: "remove-email",
            icon: "trash-outline",
            action: deleteEmailPrompt,
            enabled: Boolean(emailUnverified),
            chevron: false,
            styleDivider: true,
            hidden: !emailUnverified,
        },
        {
            category: LL.AccountScreen.totp(),
            id: "totp",
            icon: "lock-closed-outline",
            action: totpEnabled
                ? totpDelete
                : () => navigation.navigate("totpRegistrationInitiate"),
            enabled: true,
            chevronLogo: totpEnabled ? "close-circle-outline" : undefined,
            chevronColor: totpEnabled ? colors.red : undefined,
            chevronSize: totpEnabled ? 28 : undefined,
            styleDivider: true,
            hidden: !beta,
        },
    ];
    if (isAtLeastLevelOne) {
        accountSettingsList.push({
            category: LL.AccountScreen.logOutAndDeleteLocalData(),
            id: "logout",
            icon: "log-out",
            action: logoutAlert,
            enabled: true,
            greyed: false,
            chevron: false,
            styleDivider: true,
        });
    }
    if (currentLevel !== level_context_1.AccountLevel.NonAuth) {
        accountSettingsList.push({
            category: LL.support.deleteAccount(),
            id: "deleteAccount",
            icon: "trash-outline",
            dangerous: true,
            action: deleteAccountAction,
            chevron: false,
            enabled: true,
            greyed: false,
            styleDivider: true,
        });
    }
    const AccountDeletionModal = (<react_native_modal_1.default isVisible={modalVisible} onBackdropPress={() => setModalVisible(false)} backdropOpacity={0.3} backdropColor={colors.grey3} avoidKeyboard={true}>
      <react_native_1.View style={styles.view}>
        <themed_1.Text type="h1">{LL.support.typeDelete({ delete: LL.support.delete() })}</themed_1.Text>
        <react_native_1.TextInput style={styles.textInput} onChangeText={setText} value={text}/>
        <galoy_primary_button_1.GaloyPrimaryButton title="Confirm" disabled={text.toLowerCase().trim() !== LL.support.delete()} onPress={() => {
            setModalVisible(false);
            react_native_1.Alert.alert(LL.support.finalConfirmationAccountDeletionTitle(), LL.support.finalConfirmationAccountDeletionMessage(), [
                { text: LL.common.cancel(), onPress: () => { } },
                { text: LL.common.ok(), onPress: () => deleteUserAccount() },
            ]);
        }} containerStyle={styles.mainButton}/>
        <galoy_secondary_button_1.GaloySecondaryButton title="Cancel" onPress={() => setModalVisible(false)}/>
      </react_native_1.View>
    </react_native_modal_1.default>);
    return (<screen_1.Screen preset="scroll" keyboardShouldPersistTaps="handled" keyboardOffset="navigationHeader">
      {accountSettingsList.map((setting) => (<settings_row_1.SettingsRow setting={setting} key={setting.id}/>))}
      {AccountDeletionModal}
    </screen_1.Screen>);
};
exports.AccountScreen = AccountScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    view: {
        marginHorizontal: 20,
        backgroundColor: colors.white,
        padding: 20,
        borderRadius: 20,
    },
    textInput: {
        height: 40,
        borderColor: colors.grey3,
        borderWidth: 1,
        paddingVertical: 12,
        color: colors.black,
    },
    mainButton: { marginVertical: 20 },
}));
//# sourceMappingURL=account-screen.js.map