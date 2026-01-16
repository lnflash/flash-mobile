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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuccessIconAnimation = void 0;
const react_1 = __importDefault(require("react"));
const react_native_reanimated_1 = __importStar(require("react-native-reanimated"));
const config_1 = require("./config");
const SuccessIconAnimation = ({ children }) => {
    return (<react_native_reanimated_1.default.View entering={react_native_reanimated_1.PinwheelIn.duration(config_1.ANIMATION_DURATION)
            .springify()
            .delay(config_1.ANIMATION_DELAY)}>
      {children}
    </react_native_reanimated_1.default.View>);
};
exports.SuccessIconAnimation = SuccessIconAnimation;
//# sourceMappingURL=success-icon-animation.js.map