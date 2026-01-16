"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshButton = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const Ionicons_1 = __importDefault(require("react-native-vector-icons/Ionicons"));
const RefreshButton = ({ onRefresh }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    return (<react_native_1.TouchableOpacity style={styles.refresh} onPress={onRefresh}>
      <Ionicons_1.default name="refresh" size={20} color={colors.white}/>
      <themed_1.Text style={styles.text}>Refresh</themed_1.Text>
    </react_native_1.TouchableOpacity>);
};
exports.RefreshButton = RefreshButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    refresh: {
        position: "absolute",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        top: 90,
        opacity: 0.8,
        borderRadius: 100,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: colors.green,
        zIndex: 1,
    },
    text: {
        color: colors._white,
        fontSize: 18,
        marginLeft: 5,
    },
}));
//# sourceMappingURL=RefreshButton.js.map