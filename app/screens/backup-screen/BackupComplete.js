"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const themed_1 = require("@rneui/themed");
// components
const success_animation_1 = require("@app/components/success-animation");
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const buttons_1 = require("@app/components/buttons");
// store
const persistent_state_1 = require("@app/store/persistent-state");
const BackupComplete = ({ navigation }) => {
    const bottom = (0, react_native_safe_area_context_1.useSafeAreaInsets)().bottom;
    const styles = useStyles();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { updateState } = (0, persistent_state_1.usePersistentStateContext)();
    const onContinue = () => {
        updateState((state) => {
            if (state)
                return Object.assign(Object.assign({}, state), { backedUpBtcWallet: true });
            return undefined;
        });
        navigation.navigate("BackupOptions");
    };
    return (<react_native_1.View style={styles.wrapper}>
      <react_native_1.View style={styles.container}>
        <success_animation_1.SuccessIconAnimation>
          <galoy_icon_1.GaloyIcon name={"send-success"} size={128}/>
        </success_animation_1.SuccessIconAnimation>
        <themed_1.Text type="h02" bold color="#fff" style={{ marginTop: 30, marginBottom: 20 }}>
          {LL.BackupComplete.title()}
        </themed_1.Text>
        <themed_1.Text type="bl" color="#ebebeb" style={{ textAlign: "center" }}>
          {LL.BackupComplete.description()}
        </themed_1.Text>
      </react_native_1.View>
      <buttons_1.PrimaryBtn label={LL.BackupComplete.complete()} onPress={onContinue} btnStyle={{ backgroundColor: "#fff", marginBottom: bottom || 10 }} txtStyle={{ color: "#002118" }}/>
    </react_native_1.View>);
};
exports.default = BackupComplete;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        flex: 1,
        paddingHorizontal: 20,
        backgroundColor: colors.accent02,
    },
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
}));
//# sourceMappingURL=BackupComplete.js.map