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
exports.IconTransaction = void 0;
const React = __importStar(require("react"));
const dollar_svg_1 = __importDefault(require("@app/assets/icons-redesign/dollar.svg"));
const lightning_svg_1 = __importDefault(require("@app/assets/icons-redesign/lightning.svg"));
const bitcoin_svg_1 = __importDefault(require("@app/assets/icons-redesign/bitcoin.svg"));
const react_native_1 = require("react-native");
const generated_1 = require("@app/graphql/generated");
const themed_1 = require("@rneui/themed");
const IconTransaction = ({ walletCurrency, onChain = false, pending = false, }) => {
    const { theme: { colors }, } = (0, themed_1.useTheme)();
    switch (walletCurrency) {
        case generated_1.WalletCurrency.Btc:
            if (onChain && pending)
                return <bitcoin_svg_1.default color={colors.grey3}/>;
            if (onChain && !pending)
                return <bitcoin_svg_1.default color={colors.primary}/>;
            return <lightning_svg_1.default color={colors.primary}/>;
        case generated_1.WalletCurrency.Usd:
            return <dollar_svg_1.default color={colors.primary}/>;
        default:
            return <react_native_1.View />;
    }
};
exports.IconTransaction = IconTransaction;
//# sourceMappingURL=icon-transactions.js.map