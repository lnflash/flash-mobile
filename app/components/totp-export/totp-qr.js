"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrCodeComponent = void 0;
const react_native_qrcode_svg_1 = __importDefault(require("react-native-qrcode-svg"));
const QrCodeComponent = ({ otpauth }) => {
    return (<react_native_qrcode_svg_1.default value={otpauth} size={200}/>);
};
exports.QrCodeComponent = QrCodeComponent;
//# sourceMappingURL=totp-qr.js.map