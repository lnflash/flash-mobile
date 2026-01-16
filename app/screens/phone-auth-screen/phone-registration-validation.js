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
exports.PhoneRegistrationValidateScreen = void 0;
const client_1 = require("@apollo/client");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const galoy_info_1 = require("@app/components/atomic/galoy-info");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
const generated_1 = require("@app/graphql/generated");
const i18n_react_1 = require("@app/i18n/i18n-react");
const analytics_1 = require("@app/utils/analytics");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const screen_1 = require("../../components/screen");
const timer_1 = require("../../utils/timer");
const request_phone_code_login_1 = require("./request-phone-code-login");
(0, client_1.gql) `
  mutation userPhoneRegistrationValidate($input: UserPhoneRegistrationValidateInput!) {
    userPhoneRegistrationValidate(input: $input) {
      errors {
        message
        code
      }
      me {
        id
        phone
        email {
          address
          verified
        }
      }
    }
  }
`;
const ValidatePhoneCodeStatus = {
    WaitingForCode: "WaitingForCode",
    LoadingAuthResult: "LoadingAuthResult",
    ReadyToRegenerate: "ReadyToRegenerate",
    Success: "Success",
};
const ValidatePhoneCodeErrors = {
    InvalidCode: "InvalidCode",
    TooManyAttempts: "TooManyAttempts",
    UnknownError: "UnknownError",
};
const mapGqlErrorsToValidatePhoneCodeErrors = (errors) => {
    if (errors.some((error) => error.code === "PHONE_CODE_ERROR")) {
        return ValidatePhoneCodeErrors.InvalidCode;
    }
    if (errors.some((error) => error.code === "TOO_MANY_REQUEST")) {
        return ValidatePhoneCodeErrors.TooManyAttempts;
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
        case ValidatePhoneCodeErrors.UnknownError:
        default:
            return LL.errors.generic();
    }
};
const PhoneRegistrationValidateScreen = ({ route }) => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const [status, setStatus] = (0, react_1.useState)(ValidatePhoneCodeStatus.WaitingForCode);
    const [error, setError] = (0, react_1.useState)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [phoneValidate] = (0, generated_1.useUserPhoneRegistrationValidateMutation)();
    const [code, _setCode] = (0, react_1.useState)("");
    const [secondsRemaining, setSecondsRemaining] = (0, react_1.useState)(30);
    const { phone, channel } = route.params;
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const send = (0, react_1.useCallback)(async (code) => {
        var _a;
        if (status === ValidatePhoneCodeStatus.LoadingAuthResult) {
            return;
        }
        try {
            setStatus(ValidatePhoneCodeStatus.LoadingAuthResult);
            (0, analytics_1.logAddPhoneAttempt)();
            const { data } = await phoneValidate({
                variables: { input: { phone, code } },
                refetchQueries: [generated_1.AccountScreenDocument],
            });
            const errors = ((_a = data === null || data === void 0 ? void 0 : data.userPhoneRegistrationValidate) === null || _a === void 0 ? void 0 : _a.errors) || [];
            const error = mapGqlErrorsToValidatePhoneCodeErrors(errors);
            if (error) {
                console.error(error, "error validating phone code");
                (0, analytics_1.logValidateAuthCodeFailure)({
                    error,
                });
                setError(error);
                _setCode("");
                setStatus(ValidatePhoneCodeStatus.ReadyToRegenerate);
            }
            else {
                setStatus(ValidatePhoneCodeStatus.Success);
                react_native_1.Alert.alert(LL.PhoneRegistrationValidateScreen.successTitle(), undefined, [
                    {
                        text: LL.common.ok(),
                        onPress: () => navigation.pop(2),
                    },
                ]);
            }
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
    }, [status, phoneValidate, phone, _setCode, navigation, LL]);
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
          <react_native_1.View style={styles.marginBottom}>
            <galoy_info_1.GaloyInfo>
              {LL.PhoneLoginValidationScreen.sendViaOtherChannel({
                    channel: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel],
                    other: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel === generated_1.PhoneCodeChannelType.Sms
                        ? generated_1.PhoneCodeChannelType.Whatsapp
                        : generated_1.PhoneCodeChannelType.Sms],
                })}
            </galoy_info_1.GaloyInfo>
          </react_native_1.View>
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
      <react_native_1.View style={styles.viewWrapper}>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type="h2">
            {LL.PhoneLoginValidationScreen.header({
            channel: request_phone_code_login_1.PhoneCodeChannelToFriendlyName[channel],
            phoneNumber: phone,
        })}
          </themed_1.Text>
        </react_native_1.View>

        <themed_1.Input placeholder="000000" containerStyle={styles.inputComponentContainerStyle} inputContainerStyle={styles.inputContainerStyle} inputStyle={styles.inputStyle} value={code} onChangeText={setCode} renderErrorMessage={false} autoFocus={true} textContentType={"oneTimeCode"} keyboardType="numeric"/>

        <react_native_1.View style={styles.extraInfoContainer}>{extraInfoContent}</react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.PhoneRegistrationValidateScreen = PhoneRegistrationValidateScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    flex: { flex: 1 },
    flexAndMinHeight: { flex: 1, minHeight: 16 },
    viewWrapper: { flex: 1 },
    activityIndicator: { marginTop: 12 },
    extraInfoContainer: {
        marginBottom: 20,
        flex: 1,
    },
    sendAgainButtonRow: {
        flexDirection: "row",
        justifyContent: "center",
        paddingHorizontal: 25,
        textAlign: "center",
    },
    textContainer: {
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
        borderWidth: 2,
        borderBottomWidth: 2,
        paddingHorizontal: 10,
        borderColor: colors.primary5,
        borderRadius: 8,
        marginRight: 0,
    },
    inputStyle: {
        fontSize: 24,
        textAlign: "center",
    },
}));
//# sourceMappingURL=phone-registration-validation.js.map