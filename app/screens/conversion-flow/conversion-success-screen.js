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
exports.ConversionSuccessScreen = void 0;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const screen_1 = require("@app/components/screen");
const success_animation_1 = require("@app/components/success-animation");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(() => ({
    successText: {
        marginTop: 20,
    },
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    screen: {
        flexGrow: 1,
    },
}));
const ConversionSuccessScreen = () => {
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const CALLBACK_DELAY = 3000;
    (0, react_1.useEffect)(() => {
        const navigateToHomeTimeout = setTimeout(navigation.popToTop, CALLBACK_DELAY);
        return () => clearTimeout(navigateToHomeTimeout);
    }, [navigation]);
    return (<screen_1.Screen preset="scroll" style={styles.screen}>
      <react_native_1.View style={styles.container}>
        <success_animation_1.SuccessIconAnimation>
          <galoy_icon_1.GaloyIcon name={"payment-success"} size={128}/>
        </success_animation_1.SuccessIconAnimation>
        <success_animation_1.SuccessTextAnimation>
          <themed_1.Text type="h2" style={styles.successText}>
            {LL.ConversionSuccessScreen.message()}
          </themed_1.Text>
        </success_animation_1.SuccessTextAnimation>
      </react_native_1.View>
    </screen_1.Screen>);
};
exports.ConversionSuccessScreen = ConversionSuccessScreen;
//# sourceMappingURL=conversion-success-screen.js.map