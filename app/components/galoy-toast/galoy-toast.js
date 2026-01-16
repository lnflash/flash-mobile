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
exports.GaloyToast = void 0;
const React = __importStar(require("react"));
const react_native_safe_area_context_1 = require("react-native-safe-area-context");
const react_native_toast_message_1 = __importStar(require("react-native-toast-message"));
const toastConfig = {
    success: (props) => (<react_native_toast_message_1.SuccessToast {...props} text2NumberOfLines={2} text1Style={{ fontSize: 16 }} text2Style={{ fontSize: 14, color: "#2a2a2a" }}/>),
    error: (props) => (<react_native_toast_message_1.ErrorToast {...props} text2NumberOfLines={2} text1Style={{ fontSize: 16 }} text2Style={{ fontSize: 14, color: "#2a2a2a" }}/>),
};
const GaloyToast = () => {
    const { top, bottom } = (0, react_native_safe_area_context_1.useSafeAreaInsets)();
    return <react_native_toast_message_1.default config={toastConfig} topOffset={top + 10} bottomOffset={bottom + 50}/>;
};
exports.GaloyToast = GaloyToast;
//# sourceMappingURL=galoy-toast.js.map