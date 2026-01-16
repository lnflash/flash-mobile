"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaloyCurrencyBubble = void 0;
const react_1 = __importDefault(require("react"));
const themed_1 = require("@rneui/themed");
const galoy_icon_1 = require("../galoy-icon");
const generated_1 = require("@app/graphql/generated");
const GaloyCurrencyBubble = ({ currency, iconSize: overrideIconSize, highlighted = true, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    const iconSize = overrideIconSize || 24;
    return currency === generated_1.WalletCurrency.Btc ? (<galoy_icon_1.GaloyIcon name="bitcoin" size={iconSize} color={highlighted ? colors.white : colors._white} backgroundColor={highlighted ? colors.primary : colors.grey3}/>) : (<galoy_icon_1.GaloyIcon name="dollar" size={iconSize} color={colors._white} backgroundColor={highlighted ? colors.green : colors.grey3}/>);
};
exports.GaloyCurrencyBubble = GaloyCurrencyBubble;
//# sourceMappingURL=galoy-currency-bubble.js.map