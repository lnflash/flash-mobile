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
exports.GaloySecondaryButton = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
const galoy_icon_1 = require("../galoy-icon");
const testProps_1 = require("@app/utils/testProps");
const GaloySecondaryButton = (props) => {
    const { iconName, grey } = props, remainingProps = __rest(props, ["iconName", "grey"]);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles(props);
    const icon = iconName ? (<galoy_icon_1.GaloyIcon name={iconName} size={18} color={grey ? colors.grey3 : colors.primary} style={styles.iconStyle}/>) : null;
    return (<themed_1.Button {...(typeof props.title === "string" ? (0, testProps_1.testProps)(props.title) : {})} {...remainingProps} underlayColor={colors.transparent} activeOpacity={0.7} {...(icon ? { icon } : {})} TouchableComponent={react_native_1.TouchableHighlight} buttonStyle={styles.buttonStyle} disabledStyle={styles.disabledStyle} titleStyle={styles.buttonTitleStyle} disabledTitleStyle={styles.disabledTitleStyle} loadingProps={{
            color: colors.primary,
        }}/>);
};
exports.GaloySecondaryButton = GaloySecondaryButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }, props) => ({
    disabledStyle: {
        opacity: 0.35,
        backgroundColor: colors.transparent,
    },
    buttonStyle: {
        backgroundColor: colors.transparent,
    },
    buttonTitleStyle: {
        color: props.grey ? colors.grey3 : colors.primary,
        fontSize: 20,
        lineHeight: 24,
        fontWeight: "600",
    },
    disabledTitleStyle: {
        color: props.grey ? colors.grey3 : colors.primary,
    },
    iconStyle: {
        marginRight: props.iconPosition === "right" ? 0 : 10,
        marginLeft: props.iconPosition === "left" ? 0 : 10,
    },
}));
//# sourceMappingURL=galoy-secondary-button.js.map