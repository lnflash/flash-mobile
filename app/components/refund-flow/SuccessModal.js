"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const themed_1 = require("@rneui/themed");
// components
const galoy_icon_1 = require("../atomic/galoy-icon");
const success_animation_1 = require("../success-animation");
// hooks
const hooks_1 = require("@app/hooks");
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const SuccessModal = ({ txId, isVisible, setIsVisible }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { galoyInstance } = (0, hooks_1.useAppConfig)().appConfig;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const navigation = (0, native_1.useNavigation)();
    const onPress = () => {
        react_native_1.Linking.openURL(galoyInstance.blockExplorer + txId);
    };
    return (<react_native_modal_1.default isVisible={isVisible} backdropOpacity={0.5} backdropColor={colors.black} animationIn={"bounceIn"} animationOut={"fadeOut"} onModalHide={() => navigation.popToTop()}>
      <react_native_1.View style={styles.container}>
        <react_native_1.TouchableOpacity style={styles.close} onPress={() => setIsVisible(false)}>
          <galoy_icon_1.GaloyIcon name="close" size={30}/>
        </react_native_1.TouchableOpacity>
        <success_animation_1.SuccessIconAnimation>
          <galoy_icon_1.GaloyIcon name={"payment-success"} size={128}/>
        </success_animation_1.SuccessIconAnimation>
        {!!txId && (<>
            <themed_1.Text style={styles.title}>{LL.RefundFlow.txId()}</themed_1.Text>
            <react_native_1.TouchableOpacity style={styles.textBtn} onPress={onPress}>
              <themed_1.Text style={styles.text}>{txId}</themed_1.Text>
            </react_native_1.TouchableOpacity>
          </>)}
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = SuccessModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        height: "50%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.white,
        borderRadius: 20,
    },
    close: {
        position: "absolute",
        top: 20,
        right: 20,
    },
    title: {
        marginTop: 50,
    },
    textBtn: {
        marginTop: 5,
        marginHorizontal: 30,
    },
    text: {
        textAlign: "center",
        color: "#60aa55",
    },
}));
//# sourceMappingURL=SuccessModal.js.map