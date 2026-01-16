"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const react_native_modal_1 = __importDefault(require("react-native-modal"));
const react_native_gesture_handler_1 = require("react-native-gesture-handler");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
// components
const galoy_primary_button_1 = require("@app/components/atomic/galoy-primary-button");
const AccountCreateModal = ({ modalVisible, setModalVisible }) => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const activateWallet = () => {
        setModalVisible(false);
        navigation.reset({
            index: 0,
            routes: [{ name: "getStarted" }],
        });
    };
    return (<react_native_modal_1.default style={styles.modal} isVisible={modalVisible} swipeDirection={modalVisible ? ["down"] : ["up"]} onSwipeComplete={() => setModalVisible(false)} animationOutTiming={1} swipeThreshold={50}>
      <react_native_1.View style={styles.flex}>
        <react_native_gesture_handler_1.TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <react_native_1.View style={styles.cover}/>
        </react_native_gesture_handler_1.TouchableWithoutFeedback>
      </react_native_1.View>
      <react_native_1.View style={styles.viewModal}>
        <Ionicons_1.default name="remove" size={64} color={colors.grey3} style={styles.icon}/>
        <themed_1.Text type="h1">{LL.common.needWallet()}</themed_1.Text>
        <react_native_1.View style={styles.openWalletContainer}>
          <galoy_primary_button_1.GaloyPrimaryButton title={LL.GetStartedScreen.quickStart()} onPress={activateWallet}/>
        </react_native_1.View>
        <react_native_1.View style={styles.flex}/>
      </react_native_1.View>
    </react_native_modal_1.default>);
};
exports.default = AccountCreateModal;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    icon: {
        height: 34,
        top: -22,
    },
    modal: {
        marginBottom: 0,
        marginHorizontal: 0,
    },
    flex: {
        flex: 1,
    },
    cover: {
        height: "100%",
        width: "100%",
    },
    viewModal: {
        alignItems: "center",
        backgroundColor: colors.white,
        height: "30%",
        justifyContent: "flex-end",
        paddingHorizontal: 20,
    },
    openWalletContainer: {
        alignSelf: "stretch",
        marginTop: 20,
    },
}));
//# sourceMappingURL=AccountCreateModal.js.map