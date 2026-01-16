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
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const mobile_1 = require("libphonenumber-js/mobile");
const byte_base64_1 = require("byte-base64");
// hooks
const request_phone_code_login_1 = require("../phone-auth-screen/request-phone-code-login");
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_vision_camera_1 = require("react-native-vision-camera");
// components
const screen_1 = require("../../components/screen");
const buttons_1 = require("@app/components/buttons");
const scan_1 = require("@app/components/scan");
// type
const generated_1 = require("@app/graphql/generated");
const SignInViaQRCode = ({ navigation }) => {
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const [pending, setPending] = (0, react_1.useState)(false);
    const [mnemonicKey, setMnemonicKey] = (0, react_1.useState)("");
    const [nsec, setNsec] = (0, react_1.useState)("");
    const { hasPermission, requestPermission } = (0, react_native_vision_camera_1.useCameraPermission)();
    const device = (0, react_native_vision_camera_1.useCameraDevice)("back", {
        physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
    });
    const { submitPhoneNumber, phoneInputInfo, validatedPhoneNumber, status, setPhoneNumber, phoneCodeChannel, error, setCountryCode, } = (0, request_phone_code_login_1.useRequestPhoneCodeLogin)();
    (0, react_1.useEffect)(() => {
        if (status === request_phone_code_login_1.RequestPhoneCodeStatus.InputtingPhoneNumber &&
            (phoneInputInfo === null || phoneInputInfo === void 0 ? void 0 : phoneInputInfo.rawPhoneNumber)) {
            submitPhoneNumber(generated_1.PhoneCodeChannelType.Sms);
        }
    }, [status, phoneInputInfo]);
    (0, react_1.useEffect)(() => {
        if (status === request_phone_code_login_1.RequestPhoneCodeStatus.SuccessRequestingCode) {
            setPending(false);
            toggleActivityIndicator(false);
            navigation.navigate("phoneFlow", {
                screen: "phoneLoginValidate",
                params: {
                    phone: validatedPhoneNumber || "",
                    channel: phoneCodeChannel,
                    mnemonicKey,
                    nsec,
                },
            });
        }
        else if (status === request_phone_code_login_1.RequestPhoneCodeStatus.Error) {
            toggleActivityIndicator(false);
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
                react_native_1.Alert.alert(errorMessage, "", [
                    {
                        text: LL.common.ok(),
                        onPress: () => setPending(false),
                    },
                ]);
            }
        }
    }, [status, error, validatedPhoneNumber, phoneCodeChannel, mnemonicKey, nsec]);
    (0, react_1.useEffect)(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);
    (0, react_1.useEffect)(() => {
        navigation.setOptions({
            headerLeft: () => (<react_native_1.TouchableOpacity style={styles.close} onPress={navigation.goBack}>
          <themed_1.Icon name={"arrow-back"} size={40} color={"#fff"} type="ionicon"/>
        </react_native_1.TouchableOpacity>),
        });
    }, [navigation]);
    const processQRCode = (0, react_1.useMemo)(() => {
        return async (data) => {
            if (pending || !data) {
                return;
            }
            try {
                setPending(true);
                const decodedData = (0, byte_base64_1.base64decode)(data);
                const authData = JSON.parse(decodedData);
                if (!authData.phone) {
                    react_native_1.Alert.alert(LL.ScanningQRCodeScreen.invalidTitle(), "The account you're trying to log in to doesn't have a phone number linked.", [
                        {
                            text: LL.common.ok(),
                            onPress: () => setPending(false),
                        },
                    ]);
                }
                else {
                    toggleActivityIndicator(true);
                    const parsedPhoneNumber = (0, mobile_1.parsePhoneNumber)(authData.phone);
                    if (parsedPhoneNumber.country) {
                        setCountryCode(parsedPhoneNumber.country);
                        setPhoneNumber(parsedPhoneNumber.nationalNumber);
                        if (authData.mnemonicKey) {
                            setMnemonicKey(authData.mnemonicKey);
                        }
                        if (authData.nsec) {
                            setNsec(authData.nsec);
                        }
                    }
                    else {
                        toggleActivityIndicator(false);
                        react_native_1.Alert.alert(LL.ScanningQRCodeScreen.invalidTitle(), "", [
                            {
                                text: LL.common.ok(),
                                onPress: () => setPending(false),
                            },
                        ]);
                    }
                }
            }
            catch (err) {
                if (err instanceof Error) {
                    toggleActivityIndicator(false);
                    react_native_1.Alert.alert(LL.ScanningQRCodeScreen.invalidTitle(), err.toString(), [
                        {
                            text: LL.common.ok(),
                            onPress: () => setPending(false),
                        },
                    ]);
                }
            }
        };
    }, [pending]);
    if (!hasPermission) {
        const openSettings = () => {
            react_native_1.Linking.openSettings().catch(() => {
                react_native_1.Alert.alert(LL.ScanningQRCodeScreen.unableToOpenSettings());
            });
        };
        return (<screen_1.Screen>
        <react_native_1.View style={styles.permissionMissing}>
          <themed_1.Text type="h1" style={styles.permissionMissingText}>
            {LL.ScanningQRCodeScreen.permissionCamera()}
          </themed_1.Text>
        </react_native_1.View>
        <buttons_1.PrimaryBtn label={LL.ScanningQRCodeScreen.openSettings()} onPress={openSettings} btnStyle={{ marginHorizontal: 20, marginBottom: 20 }}/>
      </screen_1.Screen>);
    }
    else if (device === null || device === undefined) {
        return (<screen_1.Screen>
        <react_native_1.View style={styles.permissionMissing}>
          <themed_1.Text type="h1">{LL.ScanningQRCodeScreen.noCamera()}</themed_1.Text>
        </react_native_1.View>
      </screen_1.Screen>);
    }
    return (<screen_1.Screen unsafe>
      {pending ? (<react_native_1.View style={{ flex: 1, backgroundColor: "#000" }}/>) : (<scan_1.QRCamera device={device} processInvoice={processQRCode}/>)}
      <scan_1.ActionBtns processInvoice={processQRCode} hidePaste={true}/>
    </screen_1.Screen>);
};
exports.default = SignInViaQRCode;
const useStyles = (0, themed_1.makeStyles)(() => ({
    close: {
        height: "100%",
        justifyContent: "center",
        paddingHorizontal: 15,
    },
    permissionMissing: {
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    permissionMissingText: {
        width: "80%",
        textAlign: "center",
    },
}));
//# sourceMappingURL=SignInViaQRCode.js.map