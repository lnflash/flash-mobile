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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useRequestPhoneCodeLogin = exports.PhoneCodeChannelToFriendlyName = exports.ErrorType = exports.RequestPhoneCodeStatus = void 0;
const hooks_1 = require("@app/hooks");
const react_1 = require("react");
const mobile_1 = __importStar(require("libphonenumber-js/mobile"));
const analytics_1 = require("@app/utils/analytics");
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
exports.RequestPhoneCodeStatus = {
    LoadingCountryCode: "LoadingCountryCode",
    InputtingPhoneNumber: "InputtingPhoneNumber",
    CompletingCaptcha: "CompletingCaptcha",
    RequestingCode: "RequestingCode",
    SuccessRequestingCode: "SuccessRequestingCode",
    Error: "Error",
};
exports.ErrorType = {
    InvalidPhoneNumberError: "InvalidPhoneNumberError",
    FailedCaptchaError: "FailedCaptchaError",
    TooManyAttemptsError: "TooManyAttemptsError",
    RequestCodeError: "RequestCodeError",
    UnsupportedCountryError: "UnsupportedCountryError",
};
const axios_1 = __importDefault(require("axios"));
exports.PhoneCodeChannelToFriendlyName = {
    [generated_1.PhoneCodeChannelType.Sms]: "SMS",
    [generated_1.PhoneCodeChannelType.Whatsapp]: "WhatsApp",
};
(0, client_1.gql) `
  mutation captchaRequestAuthCode($input: CaptchaRequestAuthCodeInput!) {
    captchaRequestAuthCode(input: $input) {
      errors {
        message
        code
      }
      success
    }
  }

  query supportedCountries {
    globals {
      supportedCountries {
        id
        supportedAuthChannels
      }
    }
  }
`;
const useRequestPhoneCodeLogin = () => {
    const [status, setStatus] = (0, react_1.useState)(exports.RequestPhoneCodeStatus.LoadingCountryCode);
    const [countryCode, setCountryCode] = (0, react_1.useState)();
    const [rawPhoneNumber, setRawPhoneNumber] = (0, react_1.useState)("");
    const [validatedPhoneNumber, setValidatedPhoneNumber] = (0, react_1.useState)();
    const [phoneCodeChannel, setPhoneCodeChannel] = (0, react_1.useState)(generated_1.PhoneCodeChannelType.Sms);
    const { appConfig } = (0, hooks_1.useAppConfig)();
    const skipRequestPhoneCode = appConfig.galoyInstance.name === "Local";
    const [error, setError] = (0, react_1.useState)();
    const [captchaRequestAuthCode] = (0, generated_1.useCaptchaRequestAuthCodeMutation)();
    const { data, loading: loadingSupportedCountries } = (0, generated_1.useSupportedCountriesQuery)();
    const { isWhatsAppSupported, isSmsSupported, allSupportedCountries } = (0, react_1.useMemo)(() => {
        var _a, _b;
        const currentCountry = (_a = data === null || data === void 0 ? void 0 : data.globals) === null || _a === void 0 ? void 0 : _a.supportedCountries.find((country) => country.id === countryCode);
        const allSupportedCountries = (((_b = data === null || data === void 0 ? void 0 : data.globals) === null || _b === void 0 ? void 0 : _b.supportedCountries.map((country) => country.id)) || []);
        const isWhatsAppSupported = (currentCountry === null || currentCountry === void 0 ? void 0 : currentCountry.supportedAuthChannels.includes(generated_1.PhoneCodeChannelType.Whatsapp)) ||
            false;
        const isSmsSupported = (currentCountry === null || currentCountry === void 0 ? void 0 : currentCountry.supportedAuthChannels.includes(generated_1.PhoneCodeChannelType.Sms)) || false;
        return {
            isWhatsAppSupported,
            isSmsSupported,
            allSupportedCountries,
        };
    }, [data === null || data === void 0 ? void 0 : data.globals, countryCode]);
    const { geetestError, geetestValidationData, loadingRegisterCaptcha, registerCaptcha, resetError, resetValidationData, } = (0, hooks_1.useGeetestCaptcha)();
    (0, react_1.useEffect)(() => {
        const getCountryCodeFromIP = async () => {
            let defaultCountryCode = "JM";
            try {
                const response = await (0, axios_1.default)({
                    method: "get",
                    url: "https://ipapi.co/json/",
                    timeout: 5000,
                });
                const data = response.data;
                if (data && data.country_code) {
                    const countryCode = data.country_code;
                    defaultCountryCode = countryCode;
                }
                else {
                    console.warn("no data or country_code in response");
                }
            }
            catch (error) {
                // console.error(error)
                // Handle the error gracefully by not logging it
            }
            setCountryCode(defaultCountryCode);
            setStatus(exports.RequestPhoneCodeStatus.InputtingPhoneNumber);
        };
        getCountryCodeFromIP();
    }, []);
    const setPhoneNumber = (number) => {
        if (status === exports.RequestPhoneCodeStatus.RequestingCode) {
            return;
        }
        // handle paste
        if (number.length - rawPhoneNumber.length > 1) {
            const parsedPhoneNumber = (0, mobile_1.default)(number, countryCode);
            if (parsedPhoneNumber === null || parsedPhoneNumber === void 0 ? void 0 : parsedPhoneNumber.isValid()) {
                parsedPhoneNumber.country && setCountryCode(parsedPhoneNumber.country);
            }
        }
        setRawPhoneNumber(number);
        setError(undefined);
        setStatus(exports.RequestPhoneCodeStatus.InputtingPhoneNumber);
    };
    const submitPhoneNumber = (phoneCodeChannel) => {
        if (status === exports.RequestPhoneCodeStatus.LoadingCountryCode ||
            status === exports.RequestPhoneCodeStatus.RequestingCode) {
            return;
        }
        const parsedPhoneNumber = (0, mobile_1.default)(rawPhoneNumber, countryCode);
        phoneCodeChannel && setPhoneCodeChannel(phoneCodeChannel);
        if (parsedPhoneNumber === null || parsedPhoneNumber === void 0 ? void 0 : parsedPhoneNumber.isValid()) {
            if (!parsedPhoneNumber.country ||
                (phoneCodeChannel === generated_1.PhoneCodeChannelType.Sms && !isSmsSupported) ||
                (phoneCodeChannel === generated_1.PhoneCodeChannelType.Whatsapp && !isWhatsAppSupported)) {
                setStatus(exports.RequestPhoneCodeStatus.Error);
                setError(exports.ErrorType.UnsupportedCountryError);
                return;
            }
            setValidatedPhoneNumber(parsedPhoneNumber.number);
            if (skipRequestPhoneCode) {
                setStatus(exports.RequestPhoneCodeStatus.SuccessRequestingCode);
                return;
            }
            setStatus(exports.RequestPhoneCodeStatus.CompletingCaptcha);
            registerCaptcha();
        }
        else {
            setStatus(exports.RequestPhoneCodeStatus.Error);
            setError(exports.ErrorType.InvalidPhoneNumberError);
        }
    };
    (0, react_1.useEffect)(() => {
        if (status !== exports.RequestPhoneCodeStatus.CompletingCaptcha) {
            return;
        }
        ;
        (async () => {
            if (geetestError) {
                setStatus(exports.RequestPhoneCodeStatus.Error);
                setError(exports.ErrorType.FailedCaptchaError);
                resetError();
                return;
            }
            if (geetestValidationData && validatedPhoneNumber) {
                setStatus(exports.RequestPhoneCodeStatus.RequestingCode);
                const input = {
                    phone: validatedPhoneNumber,
                    challengeCode: geetestValidationData.geetestChallenge,
                    validationCode: geetestValidationData.geetestValidate,
                    secCode: geetestValidationData.geetestSecCode,
                    channel: phoneCodeChannel,
                };
                resetValidationData();
                (0, analytics_1.logRequestAuthCode)({
                    instance: appConfig.galoyInstance.id,
                    channel: phoneCodeChannel,
                });
                try {
                    const { data } = await captchaRequestAuthCode({ variables: { input } });
                    if (data === null || data === void 0 ? void 0 : data.captchaRequestAuthCode.success) {
                        setStatus(exports.RequestPhoneCodeStatus.SuccessRequestingCode);
                        return;
                    }
                    setStatus(exports.RequestPhoneCodeStatus.Error);
                    const errors = data === null || data === void 0 ? void 0 : data.captchaRequestAuthCode.errors;
                    if (errors && errors.some((error) => error.code === "TOO_MANY_REQUEST")) {
                        console.log("Too many attempts");
                        setError(exports.ErrorType.TooManyAttemptsError);
                    }
                    else {
                        setError(exports.ErrorType.RequestCodeError);
                    }
                }
                catch (err) {
                    setStatus(exports.RequestPhoneCodeStatus.Error);
                    setError(exports.ErrorType.RequestCodeError);
                }
            }
        })();
    }, [
        status,
        geetestValidationData,
        validatedPhoneNumber,
        appConfig,
        captchaRequestAuthCode,
        geetestError,
        phoneCodeChannel,
        resetError,
        resetValidationData,
    ]);
    let phoneInputInfo = undefined;
    if (countryCode) {
        phoneInputInfo = {
            countryCode,
            formattedPhoneNumber: new mobile_1.AsYouType(countryCode).input(rawPhoneNumber),
            countryCallingCode: (0, mobile_1.getCountryCallingCode)(countryCode),
            rawPhoneNumber,
        };
    }
    return {
        status,
        setStatus,
        phoneInputInfo,
        validatedPhoneNumber,
        error,
        submitPhoneNumber,
        phoneCodeChannel,
        isWhatsAppSupported,
        isSmsSupported,
        captchaLoading: loadingRegisterCaptcha,
        setCountryCode,
        setPhoneNumber,
        supportedCountries: allSupportedCountries,
        loadingSupportedCountries,
    };
};
exports.useRequestPhoneCodeLogin = useRequestPhoneCodeLogin;
//# sourceMappingURL=request-phone-code-login.js.map