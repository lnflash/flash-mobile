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
exports.GaloyEditButton = exports.GaloyIconButton = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const testProps_1 = require("@app/utils/testProps");
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../galoy-icon/galoy-icon");
const sizeMapping = {
    small: 16,
    medium: 24,
    large: 48,
};
const GaloyIconButton = (_a) => {
    var { size, name, text, iconOnly, disabled, color, backgroundColor } = _a, remainingProps = __rest(_a, ["size", "name", "text", "iconOnly", "disabled", "color", "backgroundColor"]);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const iconContainerSize = (0, galoy_icon_1.circleDiameterThatContainsSquare)(sizeMapping[size]);
    const pressableStyle = () => {
        if (text) {
            return {
                alignItems: "center",
            };
        }
        return {
            width: iconContainerSize,
            height: iconContainerSize,
        };
    };
    const iconProps = (pressed, iconOnly, disabled) => {
        switch (true) {
            case iconOnly && disabled:
                return {
                    opacity: 0.7,
                    color: color || colors.primary,
                    backgroundColor: colors.transparent,
                };
            case iconOnly && pressed:
                return {
                    opacity: 0.7,
                    color: color || colors.primary,
                    backgroundColor: backgroundColor || colors.grey4,
                };
            case iconOnly && !pressed:
                return {
                    color: color || colors.primary,
                    backgroundColor: colors.transparent,
                };
            case !iconOnly && disabled:
                return {
                    opacity: 0.7,
                    color: color || colors.primary,
                    backgroundColor: backgroundColor || colors.grey4,
                };
            case !iconOnly && pressed:
                return {
                    opacity: 0.7,
                    color: color || colors.primary,
                    backgroundColor: backgroundColor || colors.grey4,
                };
            case !iconOnly && !pressed:
                return {
                    color: color || colors.primary,
                    backgroundColor: backgroundColor || colors.grey4,
                };
            default:
                return {};
        }
    };
    const fontStyle = (disabled) => {
        return {
            marginTop: 8,
            opacity: disabled ? 0.7 : 1,
            textAlign: "center",
            fontSize: 18,
        };
    };
    const testPropId = text || name;
    return (<react_native_1.Pressable hitSlop={text ? 0 : iconContainerSize / 2} style={pressableStyle} disabled={disabled} {...(0, testProps_1.testProps)(testPropId)} {...remainingProps}>
      {({ pressed }) => {
            return (<>
            <galoy_icon_1.GaloyIcon name={name} size={sizeMapping[size]} {...iconProps(pressed, Boolean(iconOnly), Boolean(disabled))}/>
            {text && <themed_1.Text style={fontStyle(Boolean(disabled))}>{text}</themed_1.Text>}
          </>);
        }}
    </react_native_1.Pressable>);
};
exports.GaloyIconButton = GaloyIconButton;
const GaloyEditButton = (_a) => {
    var { disabled } = _a, remainingProps = __rest(_a, ["disabled"]);
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const pressableStyle = ({ pressed }) => {
        return {
            width: 32,
            height: 32,
            borderRadius: 8,
            opacity: disabled ? 0.7 : 1,
            backgroundColor: pressed ? colors.grey4 : colors.grey5,
            alignItems: "center",
            justifyContent: "center",
        };
    };
    return (<react_native_1.Pressable {...remainingProps} hitSlop={16} style={pressableStyle} disabled={disabled}>
      {({ pressed }) => (<galoy_icon_1.GaloyIcon name="pencil" size={20} color={colors.primary} opacity={pressed ? 0.7 : 1}/>)}
    </react_native_1.Pressable>);
};
exports.GaloyEditButton = GaloyEditButton;
//# sourceMappingURL=galoy-icon-button.js.map