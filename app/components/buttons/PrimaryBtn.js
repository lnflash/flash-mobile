"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const PrimaryBtn = ({ type = "solid", label, loading = false, disabled = false, btnStyle = {}, txtStyle = {}, onPress = () => { }, }) => {
    const styles = useStyles();
    const { colors } = (0, themed_1.useTheme)().theme;
    const disabledStyle = disabled ? styles.disabled : {};
    return (<react_native_1.TouchableOpacity style={[styles.base, styles[type], btnStyle, disabledStyle]} onPress={onPress} disabled={disabled || loading} activeOpacity={0.5}>
      {loading ? (<react_native_1.ActivityIndicator color={colors.primary}/>) : (<themed_1.Text type={"bl"} bold color={type === "solid" ? colors.textInverse : colors.text01} style={[txtStyle]}>
          {label}
        </themed_1.Text>)}
    </react_native_1.TouchableOpacity>);
};
exports.default = PrimaryBtn;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    base: {
        height: 56,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 100,
    },
    solid: {
        backgroundColor: colors.button01,
    },
    outline: {
        height: 55,
        borderColor: colors.button01,
        borderWidth: 1,
    },
    clear: {
        backgroundColor: colors.button02,
    },
    disabled: {
        opacity: 0.5,
    },
}));
//# sourceMappingURL=PrimaryBtn.js.map