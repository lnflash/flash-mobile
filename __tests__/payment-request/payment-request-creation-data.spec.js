"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const amounts_1 = require("@app/types/amounts");
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
const payment_request_creation_data_1 = require("@app/screens/receive-bitcoin-screen/payment/payment-request-creation-data");
const helpers_1 = require("./helpers");
describe("create payment request creation data", () => {
    it("ln on btc wallet", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { defaultWalletDescriptor: helpers_1.btcWalletDescriptor }));
        expect(prcd.receivingWalletDescriptor).toBe(helpers_1.btcWalletDescriptor);
        expect(prcd.canSetAmount).toBe(true);
        expect(prcd.canSetMemo).toBe(true);
        expect(prcd.canSetReceivingWalletDescriptor).toBe(true);
    });
    it("ln on usd wallet", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { defaultWalletDescriptor: helpers_1.usdWalletDescriptor }));
        expect(prcd.receivingWalletDescriptor).toBe(helpers_1.usdWalletDescriptor);
        expect(prcd.canSetAmount).toBe(true);
        expect(prcd.canSetMemo).toBe(true);
        expect(prcd.canSetReceivingWalletDescriptor).toBe(true);
    });
    it("ln on usd wallet with amount", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { defaultWalletDescriptor: helpers_1.usdWalletDescriptor, unitOfAccountAmount: (0, amounts_1.toUsdMoneyAmount)(1) }));
        expect(prcd.settlementAmount).toStrictEqual((0, amounts_1.toUsdMoneyAmount)(1));
        expect(prcd.receivingWalletDescriptor).toBe(helpers_1.usdWalletDescriptor);
        expect(prcd.canSetAmount).toBe(true);
        expect(prcd.canSetMemo).toBe(true);
        expect(prcd.canSetReceivingWalletDescriptor).toBe(true);
    });
    it("cant use paycode", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { type: index_types_1.Invoice.PayCode, defaultWalletDescriptor: helpers_1.usdWalletDescriptor, username: undefined }));
        expect(prcd.canUsePaycode).toBe(false);
    });
    it("can use paycode", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { type: index_types_1.Invoice.PayCode, username: "test-username", defaultWalletDescriptor: helpers_1.usdWalletDescriptor }));
        expect(prcd.canUsePaycode).toBe(true);
        expect(prcd.username).toBe("test-username");
        expect(prcd.canSetAmount).toBe(false);
        expect(prcd.canSetMemo).toBe(false);
        expect(prcd.canSetReceivingWalletDescriptor).toBe(false);
        expect(prcd.receivingWalletDescriptor).toBe(helpers_1.btcWalletDescriptor);
    });
    it("onchain set", () => {
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { type: index_types_1.Invoice.OnChain }));
        expect(prcd.canSetAmount).toBe(true);
        expect(prcd.canSetMemo).toBe(true);
        expect(prcd.canSetReceivingWalletDescriptor).toBe(true);
        expect(prcd.receivingWalletDescriptor).toBe(helpers_1.defaultParams.defaultWalletDescriptor);
    });
});
//# sourceMappingURL=payment-request-creation-data.spec.js.map