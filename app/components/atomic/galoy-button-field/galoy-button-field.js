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
exports.GaloyButtonField = void 0;
const themed_1 = require("@rneui/themed");
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const galoy_icon_1 = require("../galoy-icon");
const GaloyButtonField = (_a) => {
    var { placeholder, value, iconName, error, disabled, secondaryValue, style, highlightEnding } = _a, props = __rest(_a, ["placeholder", "value", "iconName", "error", "disabled", "secondaryValue", "style", "highlightEnding"]);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const styles = useStyles();
    const pressableStyle = ({ pressed }) => {
        let colorStyles = {};
        switch (true) {
            case error:
                colorStyles = {
                    backgroundColor: colors.error9,
                };
                break;
            case pressed:
                colorStyles = {
                    backgroundColor: colors.primary4,
                };
                break;
            case disabled:
                colorStyles = {
                    opacity: 0.3,
                    backgroundColor: colors.primary5,
                };
                break;
            default:
                colorStyles = {
                    backgroundColor: colors.primary5,
                };
        }
        const sizeStyles = {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            minHeight: secondaryValue ? 60 : 40,
        };
        return [style, colorStyles, sizeStyles];
    };
    const primaryText = value || placeholder || "";
    const indexToStartHighlight = primaryText.length - (highlightEnding ? 5 : 0);
    return (<react_native_1.Pressable {...props} style={pressableStyle} disabled={disabled}>
      <react_native_1.View style={styles.contentContainerStyle}>
        <themed_1.Text type="p1" color={error ? colors.error : undefined} style={styles.primaryTextStyle} numberOfLines={1} ellipsizeMode="middle">
          {primaryText.slice(0, indexToStartHighlight)}
          <themed_1.Text type="p1" color={error ? colors.error : undefined} bold>
            {primaryText.slice(indexToStartHighlight)}
          </themed_1.Text>
        </themed_1.Text>
        {iconName && (<galoy_icon_1.GaloyIcon style={styles.iconStyle} name={iconName} size={20} color={error ? colors.error : colors.primary}/>)}
      </react_native_1.View>
      {secondaryValue && (<themed_1.Text type="p4" color={error ? colors.error : undefined}>
          {secondaryValue}
        </themed_1.Text>)}
    </react_native_1.Pressable>);
};
exports.GaloyButtonField = GaloyButtonField;
const useStyles = (0, themed_1.makeStyles)(() => ({
    contentContainerStyle: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    iconStyle: {
        marginLeft: 8,
        flex: 1,
    },
    primaryTextStyle: {
        flex: 1,
    },
}));
//# sourceMappingURL=galoy-button-field.js.map