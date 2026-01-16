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
exports.AuthenticationCheckScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// components
const screen_1 = require("../../components/screen");
// hooks
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const navigation_container_wrapper_1 = require("@app/navigation/navigation-container-wrapper");
const generated_1 = require("@app/graphql/generated");
// utils
const secureStorage_1 = __importDefault(require("../../utils/storage/secureStorage"));
const biometricAuthentication_1 = __importDefault(require("../../utils/biometricAuthentication"));
const enum_1 = require("../../utils/enum");
// assets
const app_logo_light_png_1 = __importDefault(require("../../assets/logo/app-logo-light.png"));
const app_logo_dark_png_1 = __importDefault(require("../../assets/logo/app-logo-dark.png"));
const AuthenticationCheckScreen = ({ navigation }) => {
    const { mode } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { setAppUnlocked } = (0, navigation_container_wrapper_1.useAuthenticationContext)();
    const { data, loading } = (0, generated_1.useAuthQuery)({
        skip: !isAuthed,
    });
    (0, react_1.useEffect)(() => {
        if (!loading && data) {
            handleNextScreen();
        }
    }, [isAuthed, loading, data, setAppUnlocked]);
    const handleNextScreen = async () => {
        var _a;
        const isPinEnabled = await secureStorage_1.default.getIsPinEnabled();
        if ((await biometricAuthentication_1.default.isSensorAvailable()) &&
            (await secureStorage_1.default.getIsBiometricsEnabled())) {
            navigation.replace("authentication", {
                screenPurpose: enum_1.AuthenticationScreenPurpose.Authenticate,
                isPinEnabled,
            });
        }
        else if (isPinEnabled) {
            navigation.replace("pin", { screenPurpose: enum_1.PinScreenPurpose.AuthenticatePin });
        }
        else if (!((_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username)) {
            navigation.replace("UsernameSet");
        }
        else {
            setAppUnlocked();
            navigation.replace("Primary");
        }
    };
    return (<screen_1.Screen style={styles.container}>
      <react_native_1.Image source={mode === "dark" ? app_logo_dark_png_1.default : app_logo_light_png_1.default} style={styles.logo}/>
    </screen_1.Screen>);
};
exports.AuthenticationCheckScreen = AuthenticationCheckScreen;
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    logo: {
        width: "100%",
        resizeMode: "contain",
    },
}));
//# sourceMappingURL=authentication-check-screen.js.map