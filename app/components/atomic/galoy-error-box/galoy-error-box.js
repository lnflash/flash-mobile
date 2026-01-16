"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyErrorBox = void 0;
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const galoy_icon_1 = require("../galoy-icon");
const GaloyErrorBox = ({ errorMessage, noIcon }) => {
    const { theme: { colors, mode }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const color = mode === "light" ? colors.error : colors.black;
    return (<react_native_1.View style={styles.container}>
      {!noIcon && <galoy_icon_1.GaloyIcon name="warning" size={14} color={color}/>}
      <themed_1.Text style={styles.textContainer} type={"p3"} color={color}>
        {errorMessage}
      </themed_1.Text>
    </react_native_1.View>);
};
exports.GaloyErrorBox = GaloyErrorBox;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: colors.error9,
    },
    textContainer: {
        overflow: "hidden",
        marginLeft: 4,
        flex: 1,
    },
}));
//# sourceMappingURL=galoy-error-box.js.map