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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyInputRedesigned = void 0;
const React = __importStar(require("react"));
const react_native_1 = require("react-native");
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }, { props, isFocused }) => ({
    ContainerStyle: {
        paddingBottom: 3,
        paddingTop: 3,
        marginLeft: 0,
        borderRadius: 10,
        backgroundColor: colors.primary4,
    },
    inputContainerFocused: {
        borderColor: colors.primary,
        backgroundColor: colors.white,
        marginLeft: -7,
        marginRight: -7,
    },
    errorStateStyle: {
        borderColor: colors.error,
    },
    labelComponentStyles: {
        marginBottom: 9,
        fontWeight: "400",
        color: colors.grey5,
        marginLeft: isFocused ? 2 : 10,
    },
    errorMessageStyles: {
        color: props.caption ? colors.grey5 : colors.error,
        textTransform: "capitalize",
        marginTop: 9,
        marginLeft: isFocused ? 2 : 10,
    },
    labelStyle: {
        display: "none",
    },
    errorStyle: {
        display: "none",
    },
}));
const GaloyInputFunctions = (props, ref) => {
    var _a;
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const { containerStyle } = props, remainingProps = __rest(props, ["containerStyle"]);
    const [isFocused, setIsFocused] = React.useState((_a = remainingProps.initIsFocused) !== null && _a !== void 0 ? _a : false);
    const styles = useStyles({ props, isFocused });
    return (<react_native_1.View style={containerStyle}>
      <LabelComponent props={remainingProps} styles={styles.labelComponentStyles} labelStyle={remainingProps.labelStyle}/>
      <themed_1.Input {...remainingProps} labelStyle={styles.labelStyle} errorStyle={styles.errorStyle} containerStyle={isFocused ? styles.ContainerStyle : null} inputContainerStyle={[
            remainingProps.inputContainerStyle,
            remainingProps.errorMessage ? styles.errorStateStyle : null,
            isFocused ? styles.inputContainerFocused : null,
        ]} placeholderTextColor={colors.grey4} onFocus={(e) => {
            var _a;
            setIsFocused(true);
            (_a = remainingProps.onFocus) === null || _a === void 0 ? void 0 : _a.call(remainingProps, e);
        }} onBlur={(e) => {
            var _a;
            setIsFocused(false);
            (_a = remainingProps.onBlur) === null || _a === void 0 ? void 0 : _a.call(remainingProps, e);
        }} ref={ref}/>
      <CaptionComponent props={remainingProps} styles={styles.errorMessageStyles} errorStyles={remainingProps.errorStyle}/>
    </react_native_1.View>);
};
const LabelComponent = ({ props, labelStyle, styles }) => {
    if (!props.label)
        return null;
    return (<themed_1.Text type="p2" style={[styles, labelStyle]}>
      {props.label}
    </themed_1.Text>);
};
const CaptionComponent = ({ props, errorStyles, styles }) => {
    if (!props.caption && !props.errorMessage)
        return null;
    return (<themed_1.Text type="p3" style={[styles, errorStyles]}>
      {props.caption || props.errorMessage}
    </themed_1.Text>);
};
const GaloyInputRedesigned = React.forwardRef(GaloyInputFunctions);
exports.GaloyInputRedesigned = GaloyInputRedesigned;
//# sourceMappingURL=galoy-redesigned-input.js.map