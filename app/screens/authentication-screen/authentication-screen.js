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
exports.AuthenticationScreen = void 0;
const native_1 = require("@react-navigation/native");
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const screen_1 = require("../../components/screen");
const biometricAuthentication_1 = __importDefault(require("../../utils/biometricAuthentication"));
const enum_1 = require("../../utils/enum");
const secureStorage_1 = __importDefault(require("../../utils/storage/secureStorage"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const navigation_container_wrapper_1 = require("@app/navigation/navigation-container-wrapper");
const themed_1 = require("@rneui/themed");
const use_logout_1 = __importDefault(require("../../hooks/use-logout"));
const app_logo_light_png_1 = __importDefault(require("../../assets/logo/app-logo-light.png"));
const app_logo_dark_png_1 = __importDefault(require("../../assets/logo/app-logo-dark.png"));
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const galoy_secondary_button_1 = require("@app/components/atomic/galoy-secondary-button");
const AuthenticationScreen = ({ route }) => {
    const { theme: { mode }, } = (0, themed_1.useTheme)();
    const AppLogo = mode === "dark" ? app_logo_dark_png_1.default : app_logo_light_png_1.default;
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { logout } = (0, use_logout_1.default)();
    const { screenPurpose, isPinEnabled } = route.params;
    const { setAppUnlocked } = (0, navigation_container_wrapper_1.useAuthenticationContext)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    (0, native_1.useFocusEffect)(() => {
        attemptAuthentication();
    });
    const attemptAuthentication = () => {
        let description = "attemptAuthentication. should not be displayed?";
        if (screenPurpose === enum_1.AuthenticationScreenPurpose.Authenticate) {
            description = LL.AuthenticationScreen.authenticationDescription();
        }
        else if (screenPurpose === enum_1.AuthenticationScreenPurpose.TurnOnAuthentication) {
            description = LL.AuthenticationScreen.setUpAuthenticationDescription();
        }
        // Presents the OS specific authentication prompt
        biometricAuthentication_1.default.authenticate(description, handleAuthenticationSuccess, handleAuthenticationFailure);
    };
    const handleAuthenticationSuccess = async () => {
        if (screenPurpose === enum_1.AuthenticationScreenPurpose.Authenticate) {
            secureStorage_1.default.resetPinAttempts();
        }
        else if (screenPurpose === enum_1.AuthenticationScreenPurpose.TurnOnAuthentication) {
            secureStorage_1.default.setIsBiometricsEnabled();
        }
        if (screenPurpose === enum_1.AuthenticationScreenPurpose.ShowSeedPhrase) {
            navigation.replace("BackupShowSeedPhrase");
        }
        else {
            setAppUnlocked();
            navigation.replace("Primary");
        }
    };
    const handleAuthenticationFailure = () => {
        // This is called when a user cancels or taps out of the authentication prompt,
        // so no action is necessary.
    };
    const logoutAndNavigateToPrimary = async () => {
        await logout();
        react_native_1.Alert.alert(LL.common.loggedOut(), "", [
            {
                text: LL.common.ok(),
                onPress: () => {
                    navigation.replace("Primary");
                },
            },
        ]);
    };
    let PinButtonContent;
    let AlternateContent;
    if (isPinEnabled) {
        PinButtonContent = (<galoy_secondary_button_1.GaloySecondaryButton title={LL.AuthenticationScreen.usePin()} onPress={() => navigation.navigate("pin", {
                screenPurpose: screenPurpose === enum_1.AuthenticationScreenPurpose.ShowSeedPhrase
                    ? enum_1.PinScreenPurpose.ShowSeedPhrase
                    : enum_1.PinScreenPurpose.AuthenticatePin,
            })} containerStyle={styles.buttonContainer}/>);
    }
    else {
        PinButtonContent = null;
    }
    if (screenPurpose === enum_1.AuthenticationScreenPurpose.Authenticate ||
        screenPurpose === enum_1.AuthenticationScreenPurpose.ShowSeedPhrase) {
        AlternateContent = (<>
        {PinButtonContent}
        <galoy_secondary_button_1.GaloySecondaryButton title={LL.common.logout()} onPress={logoutAndNavigateToPrimary} containerStyle={styles.buttonContainer}/>
      </>);
    }
    else if (screenPurpose === enum_1.AuthenticationScreenPurpose.TurnOnAuthentication) {
        AlternateContent = (<galoy_secondary_button_1.GaloySecondaryButton title={LL.AuthenticationScreen.skip()} onPress={() => navigation.replace("Primary")} containerStyle={styles.buttonContainer}/>);
    }
    else {
        AlternateContent = null;
    }
    let buttonTitle = "";
    if (screenPurpose === enum_1.AuthenticationScreenPurpose.Authenticate ||
        screenPurpose === enum_1.AuthenticationScreenPurpose.ShowSeedPhrase) {
        buttonTitle = LL.AuthenticationScreen.unlock();
    }
    else if (screenPurpose === enum_1.AuthenticationScreenPurpose.TurnOnAuthentication) {
        buttonTitle = LL.AuthenticationScreen.setUp();
    }
    return (<screen_1.Screen>
      <react_native_1.Image source={AppLogo} style={styles.logo}/>
      <react_native_1.View style={styles.bottom}>
        <galoy_primary_button_1.GaloyPrimaryButton title={buttonTitle} onPress={attemptAuthentication} containerStyle={styles.buttonContainer}/>
        {AlternateContent}
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.AuthenticationScreen = AuthenticationScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    logo: {
        width: "100%",
        resizeMode: "contain",
    },
    bottom: {
        alignItems: "center",
        flex: 1,
        justifyContent: "flex-end",
        marginBottom: 36,
        width: "100%",
    },
    buttonContainer: {
        marginVertical: 12,
    },
}));
//# sourceMappingURL=authentication-screen.js.map