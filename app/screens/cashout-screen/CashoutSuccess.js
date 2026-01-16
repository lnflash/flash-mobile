"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
// components
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
const buttons_1 = require("@app/components/buttons");
const screen_1 = require("@app/components/screen");
const CashoutSuccess = ({ navigation }) => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const { colors } = (0, themed_1.useTheme)().theme;
    const styles = useStyles();
    const onPressDone = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: "Primary" }],
        });
    };
    return (<screen_1.Screen backgroundColor={colors.accent02}>
      <react_native_1.View style={styles.container}>
        <galoy_icon_1.GaloyIcon name={"send-success"} size={128}/>
        <themed_1.Text type="h01" style={styles.successText}>
          {LL.Cashout.success()}
        </themed_1.Text>
        <themed_1.Text style={styles.disclaimer}>{LL.Cashout.disclaimer()}</themed_1.Text>
      </react_native_1.View>
      <buttons_1.PrimaryBtn label="Done" onPress={onPressDone} btnStyle={styles.buttonContainer} txtStyle={{ color: "#002118" }}/>
    </screen_1.Screen>);
};
exports.default = CashoutSuccess;
const useStyles = (0, themed_1.makeStyles)(() => ({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    successText: {
        textAlign: "center",
        color: "#fff",
        marginVertical: 35,
        marginHorizontal: 30,
    },
    disclaimer: {
        marginHorizontal: 20,
        color: "rgba(255,255,255,.7)",
    },
    buttonContainer: {
        marginBottom: 20,
        marginHorizontal: 20,
        backgroundColor: "#fff",
    },
}));
//# sourceMappingURL=CashoutSuccess.js.map