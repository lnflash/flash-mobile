"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultWallet = exports.getUsdWallet = exports.getBtcWallet = void 0;
const generated_1 = require("@app/graphql/generated");
const getBtcWallet = (wallets) => {
    if (wallets === undefined || wallets.length === 0) {
        return undefined;
    }
    return wallets.find((wallet) => wallet.walletCurrency === generated_1.WalletCurrency.Btc);
};
exports.getBtcWallet = getBtcWallet;
const getUsdWallet = (wallets) => {
    if (wallets === undefined || wallets.length === 0) {
        return undefined;
    }
    return wallets.find((wallet) => wallet.walletCurrency === generated_1.WalletCurrency.Usd);
};
exports.getUsdWallet = getUsdWallet;
const getDefaultWallet = (wallets, defaultWalletId) => {
    if (wallets === undefined || wallets.length === 0) {
        return undefined;
    }
    return wallets.find((wallet) => wallet.id === defaultWalletId);
};
exports.getDefaultWallet = getDefaultWallet;
//# sourceMappingURL=wallets-utils.js.map