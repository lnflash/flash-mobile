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
exports.GetStartedScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const native_1 = __importDefault(require("styled-components/native"));
const themed_1 = require("@rneui/themed");
const Animatable = __importStar(require("react-native-animatable"));
// components
const screen_1 = require("../../components/screen");
const buttons_1 = require("@app/components/buttons");
const device_account_fail_modal_1 = require("./device-account-fail-modal");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_2 = require("@react-navigation/native");
const hooks_1 = require("@app/hooks");
const useCreateAccount_1 = require("@app/hooks/useCreateAccount");
// utils
const analytics_1 = require("@app/utils/analytics");
// assets
const app_logo_light_png_1 = __importDefault(require("../../assets/logo/app-logo-light.png"));
const app_logo_dark_png_1 = __importDefault(require("../../assets/logo/app-logo-dark.png"));
const help_png_1 = __importDefault(require("@app/assets/icons/help.png"));
const nfc_png_1 = __importDefault(require("@app/assets/icons/nfc.png"));
const width = react_native_1.Dimensions.get("screen").width;
const GetStartedScreen = ({ navigation }) => {
    const isFocused = (0, native_2.useIsFocused)();
    const { mode, colors } = (0, themed_1.useTheme)().theme;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { saveToken } = (0, hooks_1.useAppConfig)();
    const { toggleActivityIndicator } = (0, hooks_1.useActivityIndicator)();
    const { createDeviceAccountAndLogin, appcheckTokenLoading } = (0, useCreateAccount_1.useCreateAccount)();
    const { lnurl, readFlashcard } = (0, hooks_1.useFlashcard)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(false);
    const [secretMenuCounter, setSecretMenuCounter] = (0, react_1.useState)(0);
    const AppLogo = mode === "dark" ? app_logo_dark_png_1.default : app_logo_light_png_1.default;
    (0, react_1.useEffect)(() => {
        toggleActivityIndicator(loading || appcheckTokenLoading);
    }, [loading, appcheckTokenLoading]);
    (0, react_1.useEffect)(() => {
        if (secretMenuCounter > 2) {
            setError(false);
            navigation.navigate("developerScreen");
            setSecretMenuCounter(0);
        }
    }, [navigation, secretMenuCounter]);
    (0, react_1.useEffect)(() => {
        if (!!lnurl && isFocused)
            navigation.navigate("Card");
    }, [lnurl]);
    const handleCreateDeviceAccount = async () => {
        (0, analytics_1.logGetStartedAction)({
            action: "create_device_account",
            createDeviceAccountEnabled: Boolean(true),
        });
        setLoading(true);
        const token = await createDeviceAccountAndLogin();
        setLoading(false);
        if (token) {
            setError(false);
            saveToken(token);
            navigation.reset({
                index: 0,
                routes: [{ name: "authenticationCheck" }],
            });
        }
        else {
            navigation.navigate("phoneFlow");
        }
    };
    const onRestoreWallet = () => {
        setError(false);
        navigation.navigate("ImportWalletOptions");
    };
    const navigateToHomeScreen = () => {
        setError(false);
        navigation.replace("Primary");
    };
    const onPressLogo = () => setSecretMenuCounter(secretMenuCounter + 1);
    const onPressHelp = () => navigation.navigate("welcomeFirst");
    const onPressCard = () => readFlashcard();
    return (<screen_1.Screen>
      <LogoWrapper>
        <react_native_1.Pressable onPress={onPressLogo}>
          <Image source={AppLogo}/>
        </react_native_1.Pressable>
      </LogoWrapper>
      <IconsWrapper>
        <react_native_1.TouchableOpacity onPress={onPressHelp} style={{ padding: 20 }} activeOpacity={0.5}>
          <Icon source={help_png_1.default} animation="pulse" easing="ease-out" iterationCount="infinite" color={colors.button01}/>
        </react_native_1.TouchableOpacity>
        <react_native_1.TouchableOpacity onPress={onPressCard} style={{ padding: 20 }} activeOpacity={0.5}>
          <Icon source={nfc_png_1.default} animation="pulse" easing="ease-out" iterationCount="infinite" size={60} color={colors.button01}/>
        </react_native_1.TouchableOpacity>
      </IconsWrapper>
      <BtnsWrapper>
        <buttons_1.PrimaryBtn label={LL.GetStartedScreen.quickStart()} onPress={handleCreateDeviceAccount} btnStyle={{ marginBottom: 12 }}/>
        <buttons_1.PrimaryBtn type={"outline"} label={LL.GetStartedScreen.restoreWallet()} onPress={onRestoreWallet}/>
      </BtnsWrapper>
      <device_account_fail_modal_1.DeviceAccountFailModal isVisible={error} closeModal={() => setError(false)} navigateToHomeScreen={navigateToHomeScreen}/>
    </screen_1.Screen>);
};
exports.GetStartedScreen = GetStartedScreen;
const LogoWrapper = native_1.default.View `
  flex: 1;
  justify-content: center;
`;
const Image = native_1.default.Image `
  width: ${width}px;
  height: 250px;
  resize-mode: contain;
`;
const IconsWrapper = native_1.default.View `
  flex-direction: row;
  align-items: center;
  justify-content: center;
`;
const Icon = (0, native_1.default)(Animatable.Image) `
  width: ${({ size }) => size || 50}px;
  height: ${({ size }) => size || 50}px;
  tint-color: ${({ color }) => color};
`;
const BtnsWrapper = native_1.default.View `
  margin-vertical: 30px;
  margin-horizontal: 20px;
`;
//# sourceMappingURL=get-started-screen.js.map