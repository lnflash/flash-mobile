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
exports.AmountInputButton = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const react_native_1 = require("react-native");
// components
const galoy_icon_1 = require("@app/components/atomic/galoy-icon");
// utils
const testProps_1 = require("@app/utils/testProps");
// assets
const edit_svg_1 = __importDefault(require("@app/assets/icons/edit.svg"));
const AmountInputButton = (_a) => {
    var { placeholder, value, iconName, error, disabled, secondaryValue, primaryTextTestProps, showValuesIfDisabled = true, big = true, newDesign = false } = _a, props = __rest(_a, ["placeholder", "value", "iconName", "error", "disabled", "secondaryValue", "primaryTextTestProps", "showValuesIfDisabled", "big", "newDesign"]);
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
                    opacity: 0.5,
                    backgroundColor: colors.grey5,
                };
                break;
            case disabled:
                colorStyles = {
                    backgroundColor: colors.grey5,
                    // opacity: 0.5,
                };
                break;
            default:
                colorStyles = {
                    backgroundColor: colors.grey5,
                };
        }
        const sizeStyles = {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            minHeight: big ? 60 : 50,
            justifyContent: "center",
        };
        return [colorStyles, sizeStyles];
    };
    /* eslint-disable no-param-reassign */
    // hide values if disabled
    if (!showValuesIfDisabled && disabled) {
        value = "";
        secondaryValue = "";
    }
    const primaryText = value || placeholder || "";
    if (newDesign) {
        return (<react_native_1.Pressable {...props} style={styles.amount} disabled={disabled}>
        <themed_1.Text type="bm" bold color={!value ? colors.placeholder : colors.black}>
          {primaryText}
        </themed_1.Text>
        <edit_svg_1.default color={colors.accent02}/>
      </react_native_1.Pressable>);
    }
    return (<react_native_1.Pressable {...props} style={pressableStyle} disabled={disabled}>
      <react_native_1.View style={styles.contentContainerStyle}>
        <themed_1.Text type="p2" color={error ? colors.error : undefined} numberOfLines={1} ellipsizeMode="middle" {...(primaryTextTestProps ? (0, testProps_1.testProps)(primaryTextTestProps) : {})}>
          {primaryText}
        </themed_1.Text>
        {iconName && (<galoy_icon_1.GaloyIcon name={iconName} size={20} color={error ? colors.error : colors.primary}/>)}
      </react_native_1.View>
      {secondaryValue && (<themed_1.Text type="p4" color={error ? colors.error : undefined}>
          {secondaryValue}
        </themed_1.Text>)}
    </react_native_1.Pressable>);
};
exports.AmountInputButton = AmountInputButton;
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    contentContainerStyle: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    amount: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border01,
    },
}));
//# sourceMappingURL=amount-input-button.js.map