"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomIcon = void 0;
const react_1 = __importDefault(require("react"));
const receive_bitcoin_svg_1 = __importDefault(require("@app/assets/icons/receive-bitcoin.svg"));
const info_svg_1 = __importDefault(require("@app/assets/icons/info.svg"));
const copy_svg_1 = __importDefault(require("@app/assets/icons/copy.svg"));
const share_svg_1 = __importDefault(require("@app/assets/icons/share.svg"));
const error_svg_1 = __importDefault(require("@app/assets/icons/error.svg"));
const merchant_svg_1 = __importDefault(require("@app/assets/icons/merchant.svg"));
const chevron_down_svg_1 = __importDefault(require("@app/assets/icons/chevron-down.svg"));
const web_link_svg_1 = __importDefault(require("@app/assets/icons/web-link.svg"));
const nfc_svg_1 = __importDefault(require("@app/assets/icons/nfc.svg"));
const react_native_1 = require("react-native");
const CustomIcon = ({ name, color }) => {
    if (name === "custom-receive-bitcoin") {
        return <receive_bitcoin_svg_1.default color={color}/>;
    }
    if (name === "custom-info-icon") {
        return <info_svg_1.default color={color}/>;
    }
    if (name === "custom-copy-icon") {
        return <copy_svg_1.default color={color}/>;
    }
    if (name === "custom-share-icon") {
        return <share_svg_1.default color={color}/>;
    }
    if (name === "custom-error-icon") {
        return <error_svg_1.default color={color}/>;
    }
    if (name === "custom-merchant-icon") {
        return <merchant_svg_1.default color={color}/>;
    }
    if (name === "custom-chevron-down-icon") {
        return <chevron_down_svg_1.default color={color}/>;
    }
    if (name === "custom-web-link-icon") {
        return <web_link_svg_1.default color={color}/>;
    }
    if (name === "nfc") {
        return <nfc_svg_1.default color={color}/>;
    }
    return <react_native_1.View />;
};
exports.CustomIcon = CustomIcon;
//# sourceMappingURL=custom-icon.js.map