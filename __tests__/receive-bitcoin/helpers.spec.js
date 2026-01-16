"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
const helpers_1 = require("../../app/screens/receive-bitcoin-screen/payment/helpers");
describe("getInvoiceFullUri", () => {
    it("returns a prefixed bitcoin uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "btc1234567890address",
            type: index_types_1.Invoice.OnChain,
        });
        expect(uri).toBe("bitcoin:btc1234567890address");
    });
    it("returns a non-prefixed bitcoin uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "btc1234567890address",
            type: index_types_1.Invoice.OnChain,
            prefix: false,
        });
        expect(uri).toBe("btc1234567890address");
    });
    it("contains amount in the uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "btc1234567890address",
            type: index_types_1.Invoice.OnChain,
            amount: 100,
        });
        expect(uri).toBe(`bitcoin:btc1234567890address?amount=${100 / 10 ** 8}`);
    });
    it("contains memo in the uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "btc1234567890address",
            type: index_types_1.Invoice.OnChain,
            memo: "will not forget",
        });
        expect(uri).toBe(`bitcoin:btc1234567890address?message=will%2520not%2520forget`);
    });
    it("contains memo and amount in the uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "btc1234567890address",
            type: index_types_1.Invoice.OnChain,
            amount: 100,
            memo: "will not forget",
        });
        expect(uri).toBe(`bitcoin:btc1234567890address?amount=${100 / 10 ** 8}&message=will%2520not%2520forget`);
    });
    it("returns a non-prefixed lightning uri", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "lnurl12567890",
            type: index_types_1.Invoice.Lightning,
        });
        expect(uri).toBe("lnurl12567890");
    });
    it("returns return an uppercase string", () => {
        const uri = (0, helpers_1.getPaymentRequestFullUri)({
            input: "lnurl12567890",
            uppercase: true,
            type: index_types_1.Invoice.Lightning,
        });
        expect(uri).toMatch(/^[^a-z]*$/g);
    });
});
describe("satsToBTC", () => {
    it("returns the correct BTC number", () => {
        expect((0, helpers_1.satsToBTC)(1000)).toBe(0.00001);
        expect((0, helpers_1.satsToBTC)(0)).toBe(0);
        expect((0, helpers_1.satsToBTC)(-1000)).toBe(-0.00001);
    });
});
//# sourceMappingURL=helpers.spec.js.map