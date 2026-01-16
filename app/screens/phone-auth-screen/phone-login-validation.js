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
exports.PhoneLoginValidationScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const analytics_1 = require("@react-native-firebase/analytics");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const themed_1 = require("@rneui/themed");
const utils_1 = require("@noble/curves/abstract/utils");
const Keychain = __importStar(require("react-native-keychain"));
const client_1 = require("@apollo/client");
const nostr_tools_1 = require("nostr-tools");
// components
const screen_1 = require("../../components/screen");
const galoy_info_1 = require("@app/components/atomic/galoy-info");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
// gql
const generated_1 = require("@app/graphql/generated");
const level_context_1 = require("@app/graphql/level-context");
// hooks
const persistent_state_1 = require("@app/store/persistent-state");
const i18n_react_1 = require("@app/i18n/i18n-react");
const hooks_1 = require("../../hooks");
const request_phone_code_login_1 = require("./request-phone-code-login");
// utils
const analytics_2 = require("@app/utils/analytics");
const timer_1 = require("../../utils/timer");
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const utils_2 = require("@app/components/import-nsec/utils");
(0, client_1.gql) `
  mutation userLogin($input: UserLoginInput!) {
    userLogin(input: $input) {
      errors {
        message
        code
      }
      authToken
      totpRequired
    }
  }

  mutation userLoginUpgrade($input: UserLoginUpgradeInput!) {
    userLoginUpgrade(input: $input) {
      errors {
        message
        code
      }
      success
      authToken
    }
  }
`;
const ValidatePhoneCodeStatus = {
    WaitingForCode: "WaitingForCode",
    LoadingAuthResult: "LoadingAuthResult",
    ReadyToRegenerate: "ReadyToRegenerate",
};
const ValidatePhoneCodeErrors = {
    InvalidCode: "InvalidCode",
    TooManyAttempts: "TooManyAttempts",
    CannotUpgradeToExistingAccount: "CannotUpgradeToExistingAccount",
    UnknownError: "UnknownError",
};
const mapGqlErrorsToValidatePhoneCodeErrors = (errors) => {
    if (errors.some((error) => error.code === "PHONE_CODE_ERROR")) {
        return ValidatePhoneCodeErrors.InvalidCode;
    }
    if (errors.some((error) => error.code === "TOO_MANY_REQUEST")) {
        return ValidatePhoneCodeErrors.TooManyAttempts;
    }
    if (errors.some((error) => error.code === "PHONE_ACCOUNT_ALREADY_EXISTS_ERROR" ||
        error.code === "PHONE_ACCOUNT_ALREADY_EXISTS_NEED_TO_SWEEP_FUNDS_ERROR")) {
        return ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount;
    }
    if (errors.length > 0) {
        return ValidatePhoneCodeErrors.UnknownError;
    }
    return undefined;
};
const mapValidatePhoneCodeErrorsToMessage = (error, LL) => {
    switch (error) {
        case ValidatePhoneCodeErrors.InvalidCode:
            return LL.PhoneLoginValidationScreen.errorLoggingIn();
        case ValidatePhoneCodeErrors.TooManyAttempts:
            return LL.PhoneLoginValidationScreen.errorTooManyAttempts();
        case ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount:
            return LL.PhoneLoginValidationScreen.errorCannotUpgradeToExistingAccount();
        case ValidatePhoneCodeErrors.UnknownError:
        default:
            return LL.errors.generic();
    }
};
const PhoneLoginValidationScreen = ({ navigation, route }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { currentLevel } = (0, level_context_1.useLevel)();
    const { saveToken } = (0, hooks_1.useAppConfig)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const [code, _setCode] = (0, react_1.useState)("");
    const [secondsRemaining, setSecondsRemaining] = (0, react_1.useState)(30);
    const [error, setError] = (0, react_1.useState)();
    const [status, setStatus] = (0, react_1.useState)(ValidatePhoneCodeStatus.WaitingForCode);
    const [userLoginMutation] = (0, generated_1.useUserLoginMutation)({
        fetchPolicy: "no-cache",
    });
    const [userLoginUpgradeMutation] = (0, generated_1.useUserLoginUpgradeMutation)({
        fetchPolicy: "no-cache",
    });
    const isUpgradeFlow = currentLevel === level_context_1.AccountLevel.Zero;
    const { phone, channel, mnemonicKey, nsec } = route.params;
    const send = (0, react_1.useCallback)(async (code) => {
        var _a, _b, _c, _d, _e, _f;
        if (status === ValidatePhoneCodeStatus.LoadingAuthResult) {
            return;
        }
        try {
            let errors;
            setStatus(ValidatePhoneCodeStatus.LoadingAuthResult);
            if (isUpgradeFlow) {
                (0, analytics_2.logUpgradeLoginAttempt)();
                const { data } = await userLoginUpgradeMutation({
                    variables: { input: { phone, code } },
                });
                const success = (_a = data === null || data === void 0 ? void 0 : data.userLoginUpgrade) === null || _a === void 0 ? void 0 : _a.success;
                const authToken = (_b = data === null || data === void 0 ? void 0 : data.userLoginUpgrade) === null || _b === void 0 ? void 0 : _b.authToken;
                if (success) {
                    (0, analytics_2.logUpgradeLoginSuccess)();
                    if (authToken) {
                        saveToken(authToken);
                    }
                    navigation.replace("Primary");
                    return;
                }
                errors = (_c = data === null || data === void 0 ? void 0 : data.userLoginUpgrade) === null || _c === void 0 ? void 0 : _c.errors;
            }
            else {
                const { data } = await userLoginMutation({
                    variables: { input: { phone, code } },
                });
                const authToken = (_d = data === null || data === void 0 ? void 0 : data.userLogin) === null || _d === void 0 ? void 0 : _d.authToken;
                const totpRequired = (_e = data === null || data === void 0 ? void 0 : data.userLogin) === null || _e === void 0 ? void 0 : _e.totpRequired;
                if (authToken) {
                    if (totpRequired) {
                        navigation.navigate("totpLoginValidate", {
                            authToken,
                        });
                        return;
                    }
                    (0, analytics_1.getAnalytics)().logLogin({ method: "phone" });
                    saveToken(authToken);
                    // enable breez btc wallet
                    if (mnemonicKey) {
                        await Keychain.setInternetCredentials(breez_sdk_liquid_1.KEYCHAIN_MNEMONIC_KEY, breez_sdk_liquid_1.KEYCHAIN_MNEMONIC_KEY, mnemonicKey);
                        updateState((state) => {
                            if (state)
                                return Object.assign(Object.assign({}, state), { isAdvanceMode: true });
                            return undefined;
                        });
                    }
                    // enbale nostr chat
                    if (nsec) {
                        const secretKey = (0, utils_1.hexToBytes)(nsec);
                        await Keychain.setInternetCredentials(utils_2.KEYCHAIN_NOSTRCREDS_KEY, utils_2.KEYCHAIN_NOSTRCREDS_KEY, nostr_tools_1.nip19.nsecEncode(secretKey));
                    }
                    navigation.reset({
                        index: 0,
                        routes: [{ name: "authenticationCheck" }],
                    });
                    return;
                }
                errors = (_f = data === null || data === void 0 ? void 0 : data.userLogin) === null || _f === void 0 ? void 0 : _f.errors;
            }
            const error = mapGqlErrorsToValidatePhoneCodeErrors(errors || []) ||
                ValidatePhoneCodeErrors.UnknownError;
            (0, analytics_2.logValidateAuthCodeFailure)({
                error,
            });
            setError(error);
            _setCode("");
            setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate);
        }
        catch (err) {
            if (err instanceof Error) {
                (0, crashlytics_1.getCrashlytics)().recordError(err);
                console.debug({ err });
            }
            setError(ValidatePhoneCodeErrors.UnknownError);
            _setCode("");
            setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate);
        }
    }, [
        status,
        userLoginMutation,
        userLoginUpgradeMutation,
        phone,
        saveToken,
        _setCode,
        navigation,
        isUpgradeFlow,
    ]);
    const setCode = (code) => {
        if (code.length > 6) {
            return;
        }
        setError(undefined);
        _setCode(code);
        if (code.length === 6) {
            send(code);
        }
    };
    (0, react_1.useEffect)(() => {
        const timerId = setTimeout(() => {
            if (secondsRemaining > 0) {
                setSecondsRemaining(secondsRemaining - 1);
            }
            else if (status === ValidatePhoneCodeStatus.WaitingForCode) {
                setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate);
            }
        }, 1000);
        return () => clearTimeout(timerId);
    }, [secondsRemaining, status]);
    const errorMessage = error && mapValidatePhoneCodeErrorsToMessage(error, LL);
    let extraInfoContent = undefined;
    switch (status) {
        case ValidatePhoneCodeStatus.ReadyToRegenerate:
            extraInfoContent = (<>
          {errorMessage && (<react_native_1.View style={styles.marginBottom}>
              <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>
            </react_native_1.View>)}
          {error === ValidatePhoneCodeErrors.CannotUpgradeToExistingAccount ? null : (<react_native_1.View style={styles.marginBottom}>
              <galoy_info_1.GaloyInfo>
                {LL.PhoneLoginValidationScreen.sendViaOtherChannel({
                        channel: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel],
                        other: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel === generated_1.PhoneCodeChannelType.Sms
                            ? generated_1.PhoneCodeChannelType.Whatsapp
                            : generated_1.PhoneCodeChannelType.Sms],
                    })}
              </galoy_info_1.GaloyInfo>
            </react_native_1.View>)}
          <galoy_secondary_button_1.GaloySecondaryButton title={LL.PhoneLoginValidationScreen.sendAgain()} onPress={() => navigation.goBack()}/>
        </>);
            break;
        case ValidatePhoneCodeStatus.LoadingAuthResult:
            extraInfoContent = (<react_native_1.ActivityIndicator style={styles.activityIndicator} size="large" color={colors.primary}/>);
            break;
        case ValidatePhoneCodeStatus.WaitingForCode:
            extraInfoContent = (<react_native_1.View style={styles.timerRow}>
          <themed_1.Text type="p3" color={colors.grey3}>
            {LL.PhoneLoginValidationScreen.sendAgain()} {(0, timer_1.parseTimer)(secondsRemaining)}
          </themed_1.Text>
        </react_native_1.View>);
            break;
    }
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <themed_1.Text type="p1" style={styles.header}>
        {LL.PhoneLoginValidationScreen.header({
            channel: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel],
            phoneNumber: phone,
        })}
      </themed_1.Text>
      <themed_1.Input placeholder="000000" containerStyle={styles.inputComponentContainerStyle} inputContainerStyle={styles.inputContainerStyle} inputStyle={styles.inputStyle} value={code} onChangeText={setCode} renderErrorMessage={false} autoFocus={true} textContentType={"oneTimeCode"} keyboardType="numeric"/>
      <react_native_1.View style={styles.extraInfoContainer}>{extraInfoContent}</react_native_1.View>
    </screen_1.Screen>);
};
exports.PhoneLoginValidationScreen = PhoneLoginValidationScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    activityIndicator: {
        marginTop: 12,
    },
    extraInfoContainer: {
        marginBottom: 20,
        flex: 1,
    },
    header: {
        marginBottom: 20,
    },
    timerRow: {
        flexDirection: "row",
        justifyContent: "center",
        textAlign: "center",
    },
    marginBottom: {
        marginBottom: 10,
    },
    inputComponentContainerStyle: {
        flexDirection: "row",
        marginBottom: 20,
        paddingLeft: 0,
        paddingRight: 0,
        justifyContent: "center",
    },
    inputContainerStyle: {
        minWidth: 160,
        minHeight: 60,
        borderWidth: 1,
        paddingHorizontal: 10,
        borderColor: colors.border02,
        borderRadius: 10,
    },
    inputStyle: {
        fontSize: 24,
        textAlign: "center",
    },
}));
//# sourceMappingURL=phone-login-validation.js.map