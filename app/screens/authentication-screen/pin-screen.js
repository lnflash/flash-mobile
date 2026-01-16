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
exports.PinScreen = void 0;
const React = __importStar(require("react"));
const react_1 = require("react");
const react_native_1 = require("react-native");
const base_1 = require("@rneui/base");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const screen_1 = require("../../components/screen");
const secureStorage_1 = __importDefault(require("../../utils/storage/secureStorage"));
const enum_1 = require("../../utils/enum");
const sleep_1 = require("../../utils/sleep");
const native_1 = require("@react-navigation/native");
const use_logout_1 = __importDefault(require("../../hooks/use-logout"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const navigation_container_wrapper_1 = require("@app/navigation/navigation-container-wrapper");
const themed_1 = require("@rneui/themed");
const PinScreen = ({ route }) => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { logout } = (0, use_logout_1.default)();
    const { screenPurpose, callback } = route.params;
    const { setAppUnlocked } = (0, navigation_container_wrapper_1.useAuthenticationContext)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [enteredPIN, setEnteredPIN] = (0, react_1.useState)("");
    const [helperText, setHelperText] = (0, react_1.useState)(screenPurpose === enum_1.PinScreenPurpose.SetPin ? LL.PinScreen.setPin() : "");
    const [previousPIN, setPreviousPIN] = (0, react_1.useState)("");
    const [pinAttempts, setPinAttempts] = (0, react_1.useState)(0);
    const MAX_PIN_ATTEMPTS = 3;
    (0, react_1.useEffect)(() => {
        ;
        (async () => {
            setPinAttempts(await secureStorage_1.default.getPinAttemptsOrZero());
        })();
    }, []);
    const handleCompletedPinForAuthenticatePin = async (newEnteredPIN) => {
        if (newEnteredPIN === (await secureStorage_1.default.getPinOrEmptyString())) {
            secureStorage_1.default.resetPinAttempts();
            setAppUnlocked();
            if (screenPurpose === enum_1.PinScreenPurpose.ShowSeedPhrase) {
                navigation.replace("BackupShowSeedPhrase");
            }
            else if (screenPurpose === enum_1.PinScreenPurpose.CheckPin) {
                if (callback)
                    callback();
                navigation.goBack();
            }
            else {
                navigation.reset({
                    index: 0,
                    routes: [{ name: "Primary" }],
                });
            }
        }
        else if (pinAttempts < MAX_PIN_ATTEMPTS - 1) {
            const newPinAttempts = pinAttempts + 1;
            secureStorage_1.default.setPinAttempts(newPinAttempts.toString());
            setPinAttempts(newPinAttempts);
            setEnteredPIN("");
            if (newPinAttempts === MAX_PIN_ATTEMPTS - 1) {
                setHelperText(LL.PinScreen.oneAttemptRemaining());
            }
            else {
                const attemptsRemaining = MAX_PIN_ATTEMPTS - newPinAttempts;
                setHelperText(LL.PinScreen.attemptsRemaining({ attemptsRemaining }));
            }
        }
        else {
            setHelperText(LL.PinScreen.tooManyAttempts());
            await logout(true);
            await (0, sleep_1.sleep)(1000);
            navigation.reset({
                index: 0,
                routes: [{ name: "getStarted" }],
            });
        }
    };
    const handleCompletedPinForSetPin = (newEnteredPIN) => {
        if (previousPIN.length === 0) {
            setPreviousPIN(newEnteredPIN);
            setHelperText(LL.PinScreen.verifyPin());
            setEnteredPIN("");
        }
        else {
            verifyPINCodeMatches(newEnteredPIN);
        }
    };
    const addDigit = (digit) => {
        if (enteredPIN.length < 4) {
            const newEnteredPIN = enteredPIN + digit;
            setEnteredPIN(newEnteredPIN);
            if (newEnteredPIN.length === 4) {
                if (screenPurpose === enum_1.PinScreenPurpose.AuthenticatePin ||
                    screenPurpose === enum_1.PinScreenPurpose.ShowSeedPhrase ||
                    screenPurpose === enum_1.PinScreenPurpose.CheckPin) {
                    handleCompletedPinForAuthenticatePin(newEnteredPIN);
                }
                else if (screenPurpose === enum_1.PinScreenPurpose.SetPin) {
                    handleCompletedPinForSetPin(newEnteredPIN);
                }
            }
        }
    };
    const verifyPINCodeMatches = async (newEnteredPIN) => {
        if (previousPIN === newEnteredPIN) {
            if (await secureStorage_1.default.setPin(previousPIN)) {
                secureStorage_1.default.resetPinAttempts();
                if (callback)
                    callback();
                navigation.goBack();
            }
            else {
                returnToSetPin();
                react_native_1.Alert.alert(LL.PinScreen.storePinFailed());
            }
        }
        else {
            returnToSetPin();
        }
    };
    const returnToSetPin = () => {
        setPreviousPIN("");
        setHelperText(LL.PinScreen.setPinFailedMatch());
        setEnteredPIN("");
    };
    const circleComponentForDigit = (digit) => {
        return (<react_native_1.View style={styles.circleContainer}>
        <react_native_1.View style={enteredPIN.length > digit ? styles.filledCircle : styles.emptyCircle}/>
      </react_native_1.View>);
    };
    const buttonComponentForDigit = (digit) => {
        return (<react_native_1.View style={styles.pinPadButtonContainer}>
        <base_1.Button buttonStyle={styles.pinPadButton} titleStyle={styles.pinPadButtonTitle} title={digit} onPress={() => addDigit(digit)}/>
      </react_native_1.View>);
    };
    return (<screen_1.Screen style={styles.container}>
      <react_native_1.View style={styles.topSpacer}/>
      <react_native_1.View style={styles.circles}>
        {circleComponentForDigit(0)}
        {circleComponentForDigit(1)}
        {circleComponentForDigit(2)}
        {circleComponentForDigit(3)}
      </react_native_1.View>
      <react_native_1.View style={styles.helperTextContainer}>
        <react_native_1.Text style={styles.helperText}>{helperText}</react_native_1.Text>
      </react_native_1.View>
      <react_native_1.View style={styles.pinPad}>
        <react_native_1.View style={styles.pinPadRow}>
          {buttonComponentForDigit("1")}
          {buttonComponentForDigit("2")}
          {buttonComponentForDigit("3")}
        </react_native_1.View>
        <react_native_1.View style={styles.pinPadRow}>
          {buttonComponentForDigit("4")}
          {buttonComponentForDigit("5")}
          {buttonComponentForDigit("6")}
        </react_native_1.View>
        <react_native_1.View style={styles.pinPadRow}>
          {buttonComponentForDigit("7")}
          {buttonComponentForDigit("8")}
          {buttonComponentForDigit("9")}
        </react_native_1.View>
        <react_native_1.View style={styles.pinPadRow}>
          <react_native_1.View style={styles.pinPadButtonContainer}/>
          {buttonComponentForDigit("0")}
          <react_native_1.View style={styles.pinPadButtonContainer}>
            <base_1.Button buttonStyle={styles.pinPadButton} icon={<Ionicons_1.default style={styles.pinPadButtonIcon} name="arrow-back"/>} onPress={() => setEnteredPIN(enteredPIN.slice(0, -1))}/>
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.View>
      <react_native_1.View style={styles.bottomSpacer}/>
    </screen_1.Screen>);
};
exports.PinScreen = PinScreen;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    bottomSpacer: {
        flex: 1,
    },
    circleContainer: {
        alignItems: "center",
        justifyContent: "center",
        width: 32,
    },
    circles: {
        flex: 2,
        flexDirection: "row",
    },
    container: {
        alignItems: "center",
        flex: 1,
        width: "100%",
        backgroundColor: colors.primary,
    },
    emptyCircle: {
        backgroundColor: colors.primary,
        borderColor: colors.white,
        borderRadius: 16 / 2,
        borderWidth: 2,
        height: 16,
        width: 16,
    },
    filledCircle: {
        backgroundColor: colors.white,
        borderRadius: 16 / 2,
        height: 16,
        width: 16,
    },
    helperText: {
        color: colors.white,
        fontSize: 20,
    },
    helperTextContainer: {
        flex: 1,
    },
    pinPad: {
        alignItems: "center",
        flexDirection: "column",
        flex: 6,
    },
    pinPadButton: {
        backgroundColor: colors.primary,
        flex: 1,
        height: "95%",
        width: "95%",
    },
    pinPadButtonContainer: {
        alignItems: "center",
        justifyContent: "center",
        width: 100,
    },
    pinPadButtonIcon: {
        color: colors.white,
        fontSize: 32,
        marginRight: "20%",
    },
    pinPadButtonTitle: {
        color: colors.white,
        fontSize: 26,
        fontWeight: "bold",
        marginLeft: "40%",
        marginRight: "40%",
    },
    pinPadRow: {
        flex: 1,
        flexDirection: "row",
        marginLeft: 32,
        marginRight: 32,
    },
    topSpacer: {
        flex: 1,
    },
}));
//# sourceMappingURL=pin-screen.js.map