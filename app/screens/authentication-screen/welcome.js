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
exports.Welcome = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Animatable = __importStar(require("react-native-animatable"));
const react_native_linear_gradient_1 = __importDefault(require("react-native-linear-gradient"));
// assets
const blink_logo_icon_png_1 = __importDefault(require("../../assets/logo/blink-logo-icon.png"));
// hooks
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const generated_1 = require("@app/graphql/generated");
// components
const buttons_1 = require("@app/components/buttons");
const Welcome = ({ navigation }) => {
    var _a;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { data } = (0, generated_1.useAuthQuery)({ skip: !isAuthed });
    const onPressStart = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
        });
    };
    return (<Animatable.View style={{ flex: 1 }} animation={"fadeInUp"}>
      <react_native_linear_gradient_1.default colors={[colors.background, colors.primary5]} style={styles.container}>
        <react_native_1.Image source={blink_logo_icon_png_1.default} style={styles.logo}/>
        <Animatable.Text animation="bounce" easing="ease-in" iterationCount="infinite" style={styles.bouncingText}>
          <react_native_1.Text style={styles.title}>Welcome {(_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.username}!</react_native_1.Text>
        </Animatable.Text>
        <react_native_1.View style={styles.btnContainer}>
          <buttons_1.PrimaryBtn label="Let’s get started 🚀" onPress={onPressStart}/>
        </react_native_1.View>
      </react_native_linear_gradient_1.default>
    </Animatable.View>);
};
exports.Welcome = Welcome;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
    },
    bouncingText: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 5,
        marginBottom: 20,
    },
    title: {
        fontSize: 36,
        color: colors.primary3,
        textAlign: "center",
        textShadowColor: "rgba(40, 110, 12, 0.3)",
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 10,
    },
    logo: {
        width: "30%",
        height: "70%",
        resizeMode: "contain",
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 8, // Shadow blur
    },
    btnContainer: {
        width: "80%",
    },
}));
//# sourceMappingURL=welcome.js.map