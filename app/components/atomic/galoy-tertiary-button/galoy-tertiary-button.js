"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyTertiaryButton = void 0;
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const GaloyTertiaryButton = (props) => {
    const { outline, clear, containerStyle, disabled, icon } = props, remainingProps = __rest(props, ["outline", "clear", "containerStyle", "disabled", "icon"]);
    const styles = useStyles(props);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const pressableStyle = ({ pressed }) => {
        let dynamicStyle;
        switch (true) {
            case pressed && outline:
                dynamicStyle = {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary,
                    borderWidth: 1.5,
                };
                break;
            case pressed && !outline && !clear:
                dynamicStyle = {
                    backgroundColor: colors.primary,
                };
                break;
            case pressed && clear:
                dynamicStyle = {
                    opacity: 0.7,
                };
                break;
            case outline:
                dynamicStyle = {
                    opacity: disabled ? 0.7 : 1,
                    backgroundColor: colors.transparent,
                    borderColor: colors.primary5,
                    borderWidth: 1.5,
                };
                break;
            case clear:
                dynamicStyle = {
                    backgroundColor: colors.transparent,
                };
                break;
            default:
                dynamicStyle = {
                    backgroundColor: colors.primary3,
                };
        }
        return [dynamicStyle, containerStyle, styles.pressableStyle];
    };
    let textColor = colors.white;
    if (outline)
        textColor = colors.black;
    if (clear)
        textColor = colors.primary;
    return (<react_native_1.Pressable {...remainingProps} style={pressableStyle} disabled={disabled}>
      <react_native_1.View style={styles.container}>
        <themed_1.Text color={textColor} style={[styles.buttonTitleStyle, props.titleStyle]}>
          {props.title}
        </themed_1.Text>
        {icon ? icon : null}
      </react_native_1.View>
    </react_native_1.Pressable>);
};
exports.GaloyTertiaryButton = GaloyTertiaryButton;
const useStyles = (0, themed_1.makeStyles)((_, props) => ({
    container: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    buttonTitleStyle: {
        lineHeight: 20,
        textAlign: "center",
        fontSize: 14,
        fontWeight: props.clear ? "bold" : "600",
        opacity: props.disabled ? 0.7 : 1,
    },
    pressableStyle: {
        paddingHorizontal: props.clear ? 0 : 16,
        paddingVertical: props.clear ? 0 : 4,
        borderRadius: 50,
    },
}));
//# sourceMappingURL=galoy-tertiary-button.js.map