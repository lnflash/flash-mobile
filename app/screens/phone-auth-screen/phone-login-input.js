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
exports.PhoneLoginInitiateScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const themed_1 = require("@rneui/themed");
const react_native_country_picker_modal_1 = __importStar(require("react-native-country-picker-modal"));
const mobile_1 = require("libphonenumber-js/mobile");
const i18n_react_1 = require("@app/i18n/i18n-react");
// components
const contact_support_button_1 = require("@app/components/contact-support-button/contact-support-button");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const buttons_1 = require("@app/components/buttons");
const screen_1 = require("../../components/screen");
// utils
const request_phone_code_login_1 = require("./request-phone-code-login");
// types
const generated_1 = require("@app/graphql/generated");
const DEFAULT_COUNTRY_CODE = "SV";
const PLACEHOLDER_PHONE_NUMBER = "123-456-7890";
const PhoneLoginInitiateScreen = ({ navigation }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors, mode } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const { submitPhoneNumber, captchaLoading, status, setPhoneNumber, isSmsSupported, isWhatsAppSupported, phoneInputInfo, phoneCodeChannel, error, validatedPhoneNumber, setStatus, setCountryCode, supportedCountries, loadingSupportedCountries, } = (0, request_phone_code_login_1.useRequestPhoneCodeLogin)();
    (0, react_1.useEffect)(() => {
        if (status === request_phone_code_login_1.RequestPhoneCodeStatus.SuccessRequestingCode) {
            setStatus(request_phone_code_login_1.RequestPhoneCodeStatus.InputtingPhoneNumber);
            navigation.navigate("phoneLoginValidate", {
                phone: validatedPhoneNumber || "",
                channel: phoneCodeChannel,
            });
        }
    }, [status, phoneCodeChannel, validatedPhoneNumber, navigation, setStatus]);
    let errorMessage;
    if (error) {
        switch (error) {
            case request_phone_code_login_1.ErrorType.FailedCaptchaError:
                errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCaptcha();
                break;
            case request_phone_code_login_1.ErrorType.RequestCodeError:
                errorMessage = LL.PhoneLoginInitiateScreen.errorRequestingCode();
                break;
            case request_phone_code_login_1.ErrorType.TooManyAttemptsError:
                errorMessage = LL.errors.tooManyRequestsPhoneCode();
                break;
            case request_phone_code_login_1.ErrorType.InvalidPhoneNumberError:
                errorMessage = LL.PhoneLoginInitiateScreen.errorInvalidPhoneNumber();
                break;
            case request_phone_code_login_1.ErrorType.UnsupportedCountryError:
                errorMessage = LL.PhoneLoginInitiateScreen.errorUnsupportedCountry();
                break;
        }
    }
    if (!isSmsSupported && !isWhatsAppSupported) {
        errorMessage = LL.PhoneLoginInitiateScreen.errorUnsupportedCountry();
    }
    if (status === request_phone_code_login_1.RequestPhoneCodeStatus.LoadingCountryCode || loadingSupportedCountries) {
        return (<screen_1.Screen style={styles.loadingView}>
        <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
      </screen_1.Screen>);
    }
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.viewWrapper}>
        <themed_1.Text type={"p1"} style={styles.header}>
          {LL.PhoneLoginInitiateScreen.header()}
        </themed_1.Text>
        <react_native_1.View style={styles.inputContainer}>
          <react_native_country_picker_modal_1.default theme={mode === "dark" ? react_native_country_picker_modal_1.DARK_THEME : react_native_country_picker_modal_1.DEFAULT_THEME} countryCode={((phoneInputInfo === null || phoneInputInfo === void 0 ? void 0 : phoneInputInfo.countryCode) || DEFAULT_COUNTRY_CODE)} countryCodes={supportedCountries} onSelect={(country) => setCountryCode(country.cca2)} renderFlagButton={({ countryCode, onOpen }) => {
            return (countryCode && (<react_native_gesture_handler_1.TouchableOpacity style={styles.countryPickerButtonStyle} onPress={onOpen}>
                    <react_native_country_picker_modal_1.Flag countryCode={countryCode} flagSize={24}/>
                    <themed_1.Text type="p1">
                      +{(0, mobile_1.getCountryCallingCode)(countryCode)}
                    </themed_1.Text>
                  </react_native_gesture_handler_1.TouchableOpacity>));
        }} withCallingCodeButton={true} withFilter={true} filterProps={{
            autoFocus: true,
        }} withCallingCode={true}/>
          <themed_1.Input placeholder={PLACEHOLDER_PHONE_NUMBER} containerStyle={styles.inputComponentContainerStyle} inputContainerStyle={styles.inputContainerStyle} renderErrorMessage={false} textContentType="telephoneNumber" keyboardType="phone-pad" value={phoneInputInfo === null || phoneInputInfo === void 0 ? void 0 : phoneInputInfo.rawPhoneNumber} onChangeText={setPhoneNumber} autoFocus={true}/>
        </react_native_1.View>
        {errorMessage && (<>
            <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>
            <contact_support_button_1.ContactSupportButton containerStyle={styles.contactSupportButton}/>
          </>)}
      </react_native_1.View>
      {isSmsSupported && (<buttons_1.PrimaryBtn label={LL.PhoneLoginInitiateScreen.sms()} loading={captchaLoading && phoneCodeChannel === generated_1.PhoneCodeChannelType.Sms} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Sms)} btnStyle={isWhatsAppSupported ? { marginBottom: 10 } : {}}/>)}
      {isWhatsAppSupported && (<buttons_1.PrimaryBtn type={isSmsSupported ? "outline" : "solid"} label={LL.PhoneLoginInitiateScreen.whatsapp()} loading={captchaLoading && phoneCodeChannel === generated_1.PhoneCodeChannelType.Whatsapp} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Whatsapp)}/>)}
    </screen_1.Screen>);
};
exports.PhoneLoginInitiateScreen = PhoneLoginInitiateScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    inputContainer: {
        minHeight: 48,
        flexDirection: "row",
        marginBottom: 20,
    },
    header: {
        marginBottom: 20,
    },
    viewWrapper: {
        flex: 1,
    },
    countryPickerButtonStyle: {
        minWidth: 110,
        borderColor: colors.border02,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 10,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
    },
    inputComponentContainerStyle: {
        flex: 1,
        marginLeft: 20,
        paddingLeft: 0,
        paddingRight: 0,
    },
    inputContainerStyle: {
        flex: 1,
        borderWidth: 1,
        paddingHorizontal: 10,
        borderColor: colors.border02,
        borderRadius: 10,
    },
    contactSupportButton: {
        marginTop: 10,
        backgroundColor: colors.button01,
    },
    loadingView: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
}));
//# sourceMappingURL=phone-login-input.js.map