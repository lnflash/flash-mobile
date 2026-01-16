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
exports.QRView = void 0;
const react_1 = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_1 = require("react-native");
// components
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const success_animation_1 = require("@app/components/success-animation");
const galoy_tertiary_button_1 = require("@app/components/atomic/galoy-tertiary-button");
// assets
const react_native_qrcode_svg_1 = __importDefault(require("react-native-qrcode-svg"));
const blink_logo_icon_png_1 = __importDefault(require("@app/assets/logo/blink-logo-icon.png"));
const QRView = ({ type, getFullUri, loading, completed, err, style, expired, regenerateInvoiceFn, copyToClipboard, isPayCode, canUsePayCode, toggleIsSetLightningAddressModalVisible, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { width } = (0, react_native_1.useWindowDimensions)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const scaleAnim = react_1.default.useRef(new react_native_1.Animated.Value(1)).current;
    const isPayCodeAndCanUsePayCode = isPayCode && canUsePayCode;
    const isReady = (!isPayCodeAndCanUsePayCode || Boolean(getFullUri)) && !loading && !err;
    const displayingQR = !completed && isReady && !expired && (!isPayCode || isPayCodeAndCanUsePayCode);
    const breatheIn = () => {
        react_native_1.Animated.timing(scaleAnim, {
            toValue: 0.95,
            duration: 200,
            useNativeDriver: true,
            easing: react_native_1.Easing.inOut(react_native_1.Easing.quad),
        }).start();
    };
    const breatheOut = () => {
        if (!expired && copyToClipboard)
            copyToClipboard();
        react_native_1.Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
            easing: react_native_1.Easing.inOut(react_native_1.Easing.quad),
        }).start();
    };
    const renderSuccessView = (0, react_1.useMemo)(() => {
        if (completed) {
            return (<success_animation_1.SuccessIconAnimation>
          <galoy_icon_1.GaloyIcon name={"payment-success"} size={width / 2}/>
        </success_animation_1.SuccessIconAnimation>);
        }
        return null;
    }, [completed]);
    const renderQRCode = (0, react_1.useMemo)(() => {
        if (displayingQR && getFullUri) {
            let uri = "";
            if (typeof getFullUri === "string") {
                uri = getFullUri;
            }
            else {
                uri = getFullUri({ uppercase: true });
            }
            return (<react_native_qrcode_svg_1.default size={width - 72} value={uri} logoBackgroundColor="white" logo={blink_logo_icon_png_1.default} logoSize={60} logoBorderRadius={10}/>);
        }
        return null;
    }, [displayingQR, getFullUri]);
    const renderStatusView = (0, react_1.useMemo)(() => {
        if (!completed && !isReady) {
            return err !== "" ? (<themed_1.Text type="p2" style={styles.error}>
          {err}
        </themed_1.Text>) : (<react_native_1.ActivityIndicator size="large" color={colors.primary}/>);
        }
        else if (expired) {
            return (<>
          <themed_1.Text type="p2" style={styles.marginBottom}>
            {LL.ReceiveScreen.invoiceHasExpired()}
          </themed_1.Text>
          <galoy_tertiary_button_1.GaloyTertiaryButton title={LL.ReceiveScreen.regenerateInvoiceButtonTitle()} onPress={regenerateInvoiceFn}/>
        </>);
        }
        else if (isPayCode && !canUsePayCode) {
            return (<>
          <themed_1.Text type="p2" style={styles.marginBottom}>
            {LL.ReceiveScreen.setUsernameToAcceptViaPaycode()}
          </themed_1.Text>
          <galoy_tertiary_button_1.GaloyTertiaryButton title={LL.ReceiveScreen.setUsernameButtonTitle()} onPress={toggleIsSetLightningAddressModalVisible}/>
        </>);
        }
        return null;
    }, [
        err,
        isReady,
        completed,
        styles,
        colors,
        expired,
        isPayCode,
        canUsePayCode,
        LL.ReceiveScreen,
        regenerateInvoiceFn,
        toggleIsSetLightningAddressModalVisible,
    ]);
    return (<react_native_1.Pressable onPressIn={displayingQR ? breatheIn : () => { }} onPressOut={displayingQR ? breatheOut : () => { }}>
      <react_native_1.Animated.View style={[styles.container, style, { transform: [{ scale: scaleAnim }] }]}>
        {renderSuccessView}
        {renderQRCode}
        {renderStatusView}
      </react_native_1.Animated.View>
    </react_native_1.Pressable>);
};
exports.QRView = QRView;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        aspectRatio: 1,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border01,
        marginBottom: 20,
    },
    error: {
        textAlign: "center",
        color: colors.error,
        paddingHorizontal: 40,
    },
    marginBottom: {
        marginBottom: 10,
        textAlign: "center",
        paddingHorizontal: 20,
    },
}));
exports.default = react_1.default.memo(exports.QRView);
//# sourceMappingURL=qr-view.js.map