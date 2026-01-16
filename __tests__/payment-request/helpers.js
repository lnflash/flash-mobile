"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultParams = exports.convertMoneyAmountFn = exports.usdWalletDescriptor = exports.btcWalletDescriptor = void 0;
const generated_1 = require("@app/graphql/generated");
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
exports.btcWalletDescriptor = {
    id: "btc-wallet-id",
    currency: generated_1.WalletCurrency.Btc,
};
exports.usdWalletDescriptor = {
    id: "usd-wallet-id",
    currency: generated_1.WalletCurrency.Usd,
};
const convertMoneyAmountFn = (amount, toCurrency) => {
    return { amount: amount.amount, currency: toCurrency, currencyCode: toCurrency };
};
exports.convertMoneyAmountFn = convertMoneyAmountFn;
exports.defaultParams = {
    type: index_types_1.Invoice.Lightning,
    defaultWalletDescriptor: exports.btcWalletDescriptor,
    bitcoinWalletDescriptor: exports.btcWalletDescriptor,
    convertMoneyAmount: exports.convertMoneyAmountFn,
    network: "mainnet",
    posUrl: "pos-url",
};
//# sourceMappingURL=helpers.js.map