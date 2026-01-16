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
exports.PhoneRegistrationInitiateScreen = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const react_native_country_picker_modal_1 = __importStar(require("react-native-country-picker-modal"));
const mobile_1 = require("libphonenumber-js/mobile");
const contact_support_button_1 = require("@app/components/contact-support-button/contact-support-button");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const screen_1 = require("../../components/screen");
const request_phone_code_registration_1 = require("./request-phone-code-registration");
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
const galoy_error_box_1 = require("@app/components/atomic/galoy-error-box");
const generated_1 = require("@app/graphql/generated");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const DEFAULT_COUNTRY_CODE = "SV";
const PLACEHOLDER_PHONE_NUMBER = "123-456-7890";
const PhoneRegistrationInitiateScreen = () => {
    const styles = useStyles();
    const { theme: { colors, mode: themeMode }, } = (0, themed_1.useTheme)();
    const { submitPhoneNumber, status, setPhoneNumber, isSmsSupported, isWhatsAppSupported, phoneInputInfo, phoneCodeChannel, error, setCountryCode, supportedCountries, } = (0, request_phone_code_registration_1.useRequestPhoneCodeRegistration)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    if (status === request_phone_code_registration_1.RequestPhoneCodeStatus.LoadingCountryCode) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.loadingView}>
          <react_native_1.ActivityIndicator size="large" color={colors.primary}/>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    let errorMessage;
    if (error) {
        switch (error) {
            case request_phone_code_registration_1.ErrorType.RequestCodeError:
                errorMessage = LL.PhoneRegistrationInitiateScreen.errorRequestingCode();
                break;
            case request_phone_code_registration_1.ErrorType.TooManyAttemptsError:
                errorMessage = LL.errors.tooManyRequestsPhoneCode();
                break;
            case request_phone_code_registration_1.ErrorType.InvalidPhoneNumberError:
                errorMessage = LL.PhoneRegistrationInitiateScreen.errorInvalidPhoneNumber();
                break;
            case request_phone_code_registration_1.ErrorType.UnsupportedCountryError:
                errorMessage = LL.PhoneRegistrationInitiateScreen.errorUnsupportedCountry();
                console.log("Supported Countries", supportedCountries);
                break;
        }
    }
    if (!isSmsSupported && !isWhatsAppSupported) {
        errorMessage = LL.PhoneRegistrationInitiateScreen.errorUnsupportedCountry();
    }
    let PrimaryButton = undefined;
    let SecondaryButton = undefined;
    switch (true) {
        case isSmsSupported && isWhatsAppSupported:
            PrimaryButton = (<galoy_primary_button_1.GaloyPrimaryButton title={LL.PhoneRegistrationInitiateScreen.sms()} loading={status === request_phone_code_registration_1.RequestPhoneCodeStatus.RequestingCode &&
                    phoneCodeChannel === generated_1.PhoneCodeChannelType.Sms} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Sms)}/>);
            SecondaryButton = (<galoy_secondary_button_1.GaloySecondaryButton title={LL.PhoneRegistrationInitiateScreen.whatsapp()} containerStyle={styles.whatsAppButton} loading={status === request_phone_code_registration_1.RequestPhoneCodeStatus.RequestingCode &&
                    phoneCodeChannel === generated_1.PhoneCodeChannelType.Whatsapp} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Whatsapp)}/>);
            break;
        case isSmsSupported && !isWhatsAppSupported:
            PrimaryButton = (<galoy_primary_button_1.GaloyPrimaryButton title={LL.PhoneRegistrationInitiateScreen.sms()} loading={status === request_phone_code_registration_1.RequestPhoneCodeStatus.RequestingCode &&
                    phoneCodeChannel === generated_1.PhoneCodeChannelType.Sms} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Sms)}/>);
            break;
        case !isSmsSupported && isWhatsAppSupported:
            PrimaryButton = (<galoy_primary_button_1.GaloyPrimaryButton title={LL.PhoneRegistrationInitiateScreen.whatsapp()} loading={status === request_phone_code_registration_1.RequestPhoneCodeStatus.RequestingCode &&
                    phoneCodeChannel === generated_1.PhoneCodeChannelType.Whatsapp} onPress={() => submitPhoneNumber(generated_1.PhoneCodeChannelType.Whatsapp)}/>);
            break;
    }
    return (<screen_1.Screen preset="scroll" style={styles.screenStyle} keyboardOffset="navigationHeader" keyboardShouldPersistTaps="handled">
      <react_native_1.View style={styles.viewWrapper}>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type={"p1"}>{LL.PhoneRegistrationInitiateScreen.header()}</themed_1.Text>
        </react_native_1.View>

        <react_native_1.View style={styles.inputContainer}>
          <react_native_country_picker_modal_1.default theme={themeMode === "dark" ? react_native_country_picker_modal_1.DARK_THEME : react_native_country_picker_modal_1.DEFAULT_THEME} countryCode={((phoneInputInfo === null || phoneInputInfo === void 0 ? void 0 : phoneInputInfo.countryCode) || DEFAULT_COUNTRY_CODE)} countryCodes={supportedCountries} onSelect={(country) => setCountryCode(country.cca2)} renderFlagButton={({ countryCode, onOpen }) => {
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
        {errorMessage && (<react_native_1.View style={styles.errorContainer}>
            <galoy_error_box_1.GaloyErrorBox errorMessage={errorMessage}/>
            <contact_support_button_1.ContactSupportButton containerStyle={styles.contactSupportButton}/>
          </react_native_1.View>)}

        <react_native_1.View style={styles.buttonsContainer}>
          {SecondaryButton}
          {PrimaryButton}
        </react_native_1.View>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.PhoneRegistrationInitiateScreen = PhoneRegistrationInitiateScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    screenStyle: {
        padding: 20,
        flexGrow: 1,
    },
    buttonsContainer: {
        flex: 1,
        justifyContent: "flex-end",
    },
    inputContainer: {
        marginBottom: 20,
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: 48,
    },
    textContainer: {
        marginBottom: 20,
    },
    viewWrapper: { flex: 1 },
    activityIndicator: { marginTop: 12 },
    keyboardContainer: {
        paddingHorizontal: 10,
    },
    codeTextStyle: {},
    countryPickerButtonStyle: {
        minWidth: 110,
        borderColor: colors.primary5,
        borderWidth: 2,
        borderRadius: 8,
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
        borderWidth: 2,
        borderBottomWidth: 2,
        paddingHorizontal: 10,
        borderColor: colors.primary5,
        borderRadius: 8,
    },
    errorContainer: {
        marginBottom: 20,
    },
    whatsAppButton: {
        marginBottom: 20,
    },
    contactSupportButton: {
        marginTop: 10,
    },
    loadingView: { flex: 1, justifyContent: "center", alignItems: "center" },
}));
//# sourceMappingURL=phone-registration-input.js.map