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
exports.SectionCompleted = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const base_1 = require("@rneui/base");
const close_cross_1 = require("../../components/close-cross");
const screen_1 = require("../../components/screen");
const badger_shovel_01_svg_1 = __importDefault(require("./badger-shovel-01.svg"));
const mountain_header_1 = require("../../components/mountain-header");
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    bottomView: {
        backgroundColor: colors._lightBlue,
        flex: 1,
    },
    buttonStyle: {
        backgroundColor: colors._white,
        borderRadius: 32,
        marginTop: 24,
        width: "100%",
    },
    container: {
        alignItems: "center",
        backgroundColor: colors._lightBlue,
        flexGrow: 1,
    },
    divider: { flex: 0.5, minHeight: 30 },
    headerSection: {
        color: colors._white,
        fontSize: 16,
        paddingTop: 18,
    },
    titleSection: {
        color: colors._white,
        fontSize: 24,
        fontWeight: "bold",
        paddingTop: 6,
    },
    titleStyle: {
        color: colors._lightBlue,
        fontSize: 18,
        fontWeight: "bold",
        flex: 1,
        justifyContent: "center",
    },
}));
const SectionCompleted = ({ route }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const navigation = (0, native_1.useNavigation)();
    const { amount, sectionTitle } = route.params;
    const { LL } = (0, i18n_react_1.useI18nContext)();
    return (<screen_1.Screen backgroundColor={colors._orange} unsafe>
      <mountain_header_1.MountainHeader amount={amount.toString()} color={colors._orange}/>
      <react_native_1.View style={styles.container}>
        <react_native_1.View style={styles.divider}/>
        <badger_shovel_01_svg_1.default />
        <react_native_1.Text style={styles.headerSection}>{LL.EarnScreen.sectionsCompleted()}</react_native_1.Text>
        <react_native_1.Text style={styles.titleSection}>{sectionTitle}</react_native_1.Text>
        <base_1.Button title={LL.EarnScreen.keepDigging()} type="solid" buttonStyle={styles.buttonStyle} titleStyle={styles.titleStyle} onPress={() => navigation.navigate("Earn")}/>
      </react_native_1.View>
      <react_native_1.View style={styles.bottomView}/>
      <close_cross_1.CloseCross color={colors._white} onPress={() => navigation.navigate("Earn")}/>
    </screen_1.Screen>);
};
exports.SectionCompleted = SectionCompleted;
//# sourceMappingURL=section-completed.js.map