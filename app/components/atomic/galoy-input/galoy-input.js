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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyInput = void 0;
const React = __importStar(require("react"));
const themed_1 = require("@rneui/themed");
const useStyles = (0, themed_1.makeStyles)(({ colors }) => ({
    inputContainerFocused: {
        borderBottomColor: colors.grey3,
    },
}));
const GaloyInputFunction = (props, ref) => {
    var _a;
    const styles = useStyles();
    const [isFocused, setIsFocused] = React.useState((_a = props.initIsFocused) !== null && _a !== void 0 ? _a : false);
    return (<themed_1.Input {...props} inputContainerStyle={[
            props.inputContainerStyle,
            isFocused ? styles.inputContainerFocused : null,
        ]} onFocus={(e) => {
            var _a;
            setIsFocused(true);
            (_a = props.onFocus) === null || _a === void 0 ? void 0 : _a.call(props, e);
        }} onBlur={(e) => {
            var _a;
            setIsFocused(false);
            (_a = props.onBlur) === null || _a === void 0 ? void 0 : _a.call(props, e);
        }} ref={ref} autoComplete="off"/>);
};
const GaloyInput = React.forwardRef(GaloyInputFunction);
exports.GaloyInput = GaloyInput;
//# sourceMappingURL=galoy-input.js.map