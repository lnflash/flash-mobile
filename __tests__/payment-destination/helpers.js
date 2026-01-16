"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPaymentDetailParams = void 0;
const generated_1 = require("@app/graphql/generated");
exports.defaultPaymentDetailParams = {
    convertMoneyAmount: jest.fn(),
    sendingWalletDescriptor: {
        currency: generated_1.WalletCurrency.Btc,
        id: "testid",
    },
};
//# sourceMappingURL=helpers.js.map