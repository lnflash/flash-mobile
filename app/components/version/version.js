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
exports.VersionComponent = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const react_native_device_info_1 = __importDefault(require("react-native-device-info"));
const native_1 = require("@react-navigation/native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const testProps_1 = require("../../utils/testProps");
const VersionComponent = () => {
    const styles = useStyles();
    const { navigate } = (0, native_1.useNavigation)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [secretMenuCounter, setSecretMenuCounter] = React.useState(0);
    React.useEffect(() => {
        if (secretMenuCounter > 2) {
            navigate("developerScreen");
            setSecretMenuCounter(0);
        }
    }, [navigate, secretMenuCounter]);
    const readableVersion = react_native_device_info_1.default.getReadableVersion();
    return (<react_native_1.Pressable style={styles.wrapper} onPress={() => setSecretMenuCounter(secretMenuCounter + 1)}>
      <themed_1.Text {...(0, testProps_1.testProps)("Version Build Text")} style={styles.version}>
        {readableVersion}
        {"\n"}
        {LL.GetStartedScreen.headline()}
      </themed_1.Text>
    </react_native_1.Pressable>);
};
exports.VersionComponent = VersionComponent;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    wrapper: {
        flex: 1,
        justifyContent: "flex-end",
        marginBottom: 40,
    },
    version: {
        color: colors.grey0,
        fontSize: 18,
        marginTop: 18,
        textAlign: "center",
    },
}));
//# sourceMappingURL=version.js.map