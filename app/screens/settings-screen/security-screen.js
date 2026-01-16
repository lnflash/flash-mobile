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
exports.SecurityScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// hooks
const client_1 = require("@apollo/client");
const redux_1 = require("@app/store/redux");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const generated_1 = require("@app/graphql/generated");
// components
const screen_1 = require("../../components/screen");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const custom_modal_1 = __importDefault(require("@app/components/custom-modal/custom-modal"));
const galoy_tertiary_button_1 = require("@app/components/atomic/galoy-tertiary-button");
// utils
const biometricAuthentication_1 = __importDefault(require("../../utils/biometricAuthentication"));
const secureStorage_1 = __importDefault(require("../../utils/storage/secureStorage"));
const enum_1 = require("../../utils/enum");
const toast_1 = require("../../utils/toast");
const client_only_query_1 = require("../../graphql/client-only-query");
const SecurityScreen = ({ route, navigation }) => {
    const { mIsBiometricsEnabled, mIsPinEnabled } = route.params;
    const styles = useStyles();
    const client = (0, client_1.useApolloClient)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { data: { hideBalance } = {} } = (0, generated_1.useHideBalanceQuery)();
    const [isBiometricsEnabled, setIsBiometricsEnabled] = (0, react_1.useState)(mIsBiometricsEnabled);
    const [isPinEnabled, setIsPinEnabled] = (0, react_1.useState)(mIsPinEnabled);
    const [isHideBalanceEnabled, setIsHideBalanceEnabled] = (0, react_1.useState)(hideBalance);
    const [backupVisible, setBackupVisible] = (0, react_1.useState)(false);
    const { userData } = (0, redux_1.useAppSelector)((state) => state.user);
    (0, native_1.useFocusEffect)(() => {
        getIsBiometricsEnabled();
        getIsPinEnabled();
    });
    const getIsBiometricsEnabled = async () => {
        setIsBiometricsEnabled(await secureStorage_1.default.getIsBiometricsEnabled());
    };
    const getIsPinEnabled = async () => {
        setIsPinEnabled(await secureStorage_1.default.getIsPinEnabled());
    };
    const onBiometricsValueChanged = async (value) => {
        if (value) {
            try {
                if (await biometricAuthentication_1.default.isSensorAvailable()) {
                    // Presents the OS specific authentication prompt
                    biometricAuthentication_1.default.authenticate(LL.AuthenticationScreen.setUpAuthenticationDescription(), handleAuthenticationSuccess, handleAuthenticationFailure);
                }
                else {
                    (0, toast_1.toastShow)({
                        message: (translations) => translations.SecurityScreen.biometryNotAvailable(),
                        currentTranslation: LL,
                    });
                }
            }
            catch (_a) {
                (0, toast_1.toastShow)({
                    message: (translations) => translations.SecurityScreen.biometryNotEnrolled(),
                    currentTranslation: LL,
                });
            }
        }
        else if (await secureStorage_1.default.removeIsBiometricsEnabled()) {
            setIsBiometricsEnabled(false);
        }
    };
    const handleAuthenticationSuccess = async () => {
        if (await secureStorage_1.default.setIsBiometricsEnabled()) {
            setIsBiometricsEnabled(true);
        }
    };
    const handleAuthenticationFailure = () => {
        // This is called when a user cancels or taps out of the authentication prompt,
        // so no action is necessary.
    };
    const onPinValueChanged = async (value) => {
        if (value) {
            navigateToPinScreen();
        }
        else {
            removePin();
        }
    };
    const onHideBalanceValueChanged = async (value) => {
        if (value) {
            setIsHideBalanceEnabled(await (0, client_only_query_1.saveHideBalance)(client, true));
            await (0, client_only_query_1.saveHiddenBalanceToolTip)(client, true);
        }
        else {
            setIsHideBalanceEnabled(await (0, client_only_query_1.saveHideBalance)(client, false));
            await (0, client_only_query_1.saveHiddenBalanceToolTip)(client, false);
        }
    };
    const removePin = async () => {
        if (await secureStorage_1.default.removePin()) {
            secureStorage_1.default.removePinAttempts();
            setIsPinEnabled(false);
        }
    };
    const navigateToPinScreen = () => {
        if (userData.phone || userData.email.address) {
            navigation.navigate("pin", { screenPurpose: enum_1.PinScreenPurpose.SetPin });
        }
        else {
            setBackupVisible(true);
        }
    };
    return (<screen_1.Screen style={styles.container} preset="scroll">
      <react_native_1.View style={styles.settingContainer}>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type="h1">{LL.SecurityScreen.biometricTitle()}</themed_1.Text>
          <themed_1.Text type="p2">{LL.SecurityScreen.biometricDescription()}</themed_1.Text>
        </react_native_1.View>
        <react_native_1.Switch style={styles.switch} value={isBiometricsEnabled} onValueChange={onBiometricsValueChanged}/>
      </react_native_1.View>
      <react_native_1.View style={styles.settingContainer}>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type="h1">{LL.SecurityScreen.pinTitle()}</themed_1.Text>
          <themed_1.Text type="p2">{LL.SecurityScreen.pinDescription()}</themed_1.Text>
        </react_native_1.View>
        <react_native_1.Switch style={styles.switch} value={isPinEnabled} onValueChange={onPinValueChanged}/>
      </react_native_1.View>
      <react_native_1.View style={styles.settingContainer}>
        <galoy_tertiary_button_1.GaloyTertiaryButton title={LL.SecurityScreen.setPin()} onPress={navigateToPinScreen}/>
      </react_native_1.View>
      <react_native_1.View style={styles.settingContainer}>
        <react_native_1.View style={styles.settingContainer}></react_native_1.View>
        <react_native_1.View style={styles.textContainer}>
          <themed_1.Text type="h1">{LL.SecurityScreen.hideBalanceTitle()}</themed_1.Text>
          <themed_1.Text type="p2">{LL.SecurityScreen.hideBalanceDescription()}</themed_1.Text>
        </react_native_1.View>
        <react_native_1.Switch style={styles.switch} value={isHideBalanceEnabled} onValueChange={onHideBalanceValueChanged}/>
      </react_native_1.View>
      <custom_modal_1.default isVisible={backupVisible} toggleModal={() => setBackupVisible(!backupVisible)} image={<galoy_icon_1.GaloyIcon name="payment-success" size={100}/>} title={LL.UpgradeAccountModal.title()} body={<themed_1.Text type="bl" style={{ textAlign: "center" }}>
            {LL.SecurityScreen.backupDescription()}
          </themed_1.Text>} primaryButtonTextAbove={LL.UpgradeAccountModal.onlyAPhoneNumber()} primaryButtonTitle={LL.UpgradeAccountModal.letsGo()} primaryButtonOnPress={() => {
            navigation.navigate("phoneFlow");
            setBackupVisible(false);
        }} secondaryButtonTitle={LL.UpgradeAccountModal.stayInTrialMode()} secondaryButtonOnPress={() => setBackupVisible(false)}/>
    </screen_1.Screen>);
};
exports.SecurityScreen = SecurityScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        minHeight: "100%",
        paddingLeft: 24,
        paddingRight: 24,
    },
    settingContainer: {
        flexDirection: "row",
    },
    switch: {
        bottom: 18,
        position: "absolute",
        right: 0,
    },
    textContainer: {
        marginBottom: 12,
        marginRight: 60,
        marginTop: 32,
    },
}));
//# sourceMappingURL=security-screen.js.map