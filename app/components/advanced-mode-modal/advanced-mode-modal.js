"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedModeModal = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
// hooks
const i18n_react_1 = require("@app/i18n/i18n-react");
const native_1 = require("@react-navigation/native");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const persistent_state_1 = require("@app/store/persistent-state");
// components
const buttons_1 = require("../buttons");
// assets
const advance_mode_png_1 = __importDefault(require("@app/assets/images/advance-mode.png"));
const { height } = react_native_1.Dimensions.get("screen");
const DOCS_LINK = "https://documentation.getflash.io/en/guides/non-custodial-wallets";
const AdvancedModeModal = ({ hasRecoveryPhrase, isVisible, setIsVisible, }) => {
    const navigation = (0, native_1.useNavigation)();
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const { bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const acknowledgeModal = () => {
        setIsVisible(false);
        navigation.popToTop();
    };
    const goToBackupBTCWallet = () => {
        acknowledgeModal();
        navigation.navigate("BackupStart");
    };
    const onCreateNewWallet = () => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { isAdvanceMode: true });
            return undefined;
        });
        setIsVisible(false);
        navigation.reset({ index: 0, routes: [{ name: "Primary" }] });
    };
    const goToImportBTCWallet = () => {
        setIsVisible(false);
        navigation.navigate("ImportWallet", {
            insideApp: true,
        });
    };
    return (<react_native_1.Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={() => setIsVisible(false)}>
      <react_native_1.View style={styles.backdrop}>
        <react_native_1.View style={styles.container}>
          <react_native_1.TouchableOpacity style={styles.close} onPress={() => setIsVisible(false)}>
            <themed_1.Icon name={"close"} size={35} color={colors.black} type="ionicon"/>
          </react_native_1.TouchableOpacity>
          <react_native_1.ScrollView>
            <themed_1.Text style={styles.title}>Be your own Bank</themed_1.Text>
            <react_native_1.Image source={advance_mode_png_1.default} style={styles.advanceModeImage} resizeMode="contain"/>
            <react_native_1.View style={styles.body}>
              <themed_1.Text style={styles.text} type={"h2"} bold>
                {LL.AdvancedModeModal.header()}
              </themed_1.Text>
              <themed_1.Text style={styles.text} type="p2">
                {LL.AdvancedModeModal.body()}
              </themed_1.Text>
              <themed_1.Text style={styles.textBtn} type="p2" bold onPress={() => react_native_1.Linking.openURL(DOCS_LINK)}>
                {LL.AdvancedModeModal.learnMore()}
              </themed_1.Text>
              <buttons_1.PrimaryBtn label={hasRecoveryPhrase
            ? LL.common.revealSeed()
            : LL.AdvancedModeModal.importWallet()} onPress={hasRecoveryPhrase ? goToBackupBTCWallet : goToImportBTCWallet} btnStyle={{ marginVertical: 10 }}/>
              <buttons_1.PrimaryBtn type="outline" label={hasRecoveryPhrase
            ? LL.common.backHome()
            : LL.AdvancedModeModal.createWallet()} onPress={hasRecoveryPhrase ? acknowledgeModal : onCreateNewWallet} btnStyle={{ marginBottom: bottom || 10 }}/>
            </react_native_1.View>
          </react_native_1.ScrollView>
        </react_native_1.View>
      </react_native_1.View>
    </react_native_1.Modal>);
};
exports.AdvancedModeModal = AdvancedModeModal;
const useStyles = (0, themed_1.makeStyles)(({ colors, mode }) => ({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: mode === "dark" ? "rgba(57,57,57,.7)" : "rgba(0,0,0,.5)",
    },
    container: {
        backgroundColor: colors.white,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: "100%",
    },
    close: {
        alignSelf: "flex-end",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    title: {
        fontSize: 28,
        textAlign: "center",
        marginBottom: 20,
    },
    advanceModeImage: {
        width: "100%",
        marginBottom: 20,
    },
    body: {
        marginHorizontal: 20,
    },
    text: {
        marginBottom: 16,
    },
    textBtn: {
        textDecorationLine: "underline",
        marginBottom: 20,
    },
}));
//# sourceMappingURL=advanced-mode-modal.js.map