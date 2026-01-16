"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayCodeExplainerModal = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    modalView: {
        backgroundColor: colors.white,
        maxFlex: 1,
        maxHeight: "75%",
        borderRadius: 16,
        padding: 20,
    },
    titleContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    walletsContainer: {
        paddingLeft: 10,
    },
    bodyText: {
        fontSize: 18,
        fontWeight: "400",
    },
}));
const wallets = ["Blink", "Breez", "Strike"];
const PayCodeExplainerModal = ({ modalVisible, toggleModal, }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    return (<react_native_modal_1.default isVisible={modalVisible} backdropOpacity={0.3} backdropColor={colors.grey3} onBackdropPress={toggleModal} swipeDirection={modalVisible ? ["down"] : ["up"]}>
      <react_native_1.View style={styles.modalView}>
        <react_native_1.View style={styles.titleContainer}>
          <themed_1.Text type="h1" bold>
            {LL.GaloyAddressScreen.howToUseYourPaycode()}
          </themed_1.Text>
          <react_native_gesture_handler_1.TouchableOpacity onPress={toggleModal}>
            <galoy_icon_1.GaloyIcon name="close" size={32} color={colors.black}/>
          </react_native_gesture_handler_1.TouchableOpacity>
        </react_native_1.View>
        <themed_1.Text style={styles.bodyText}>
          {LL.GaloyAddressScreen.howToUseYourPaycodeExplainer()}
        </themed_1.Text>
        <themed_1.Text style={styles.bodyText}>
          {wallets.map((wallet) => (<themed_1.Text key={wallet} style={styles.bodyText}>
              {"\n\u2022 "}
              {wallet}
            </themed_1.Text>))}
        </themed_1.Text>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.PayCodeExplainerModal = PayCodeExplainerModal;
//# sourceMappingURL=paycode-explainer-modal.js.map