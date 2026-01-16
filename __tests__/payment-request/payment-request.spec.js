"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearMocks = exports.mutations = void 0;
const payment_request_creation_data_1 = require("@app/screens/receive-bitcoin-screen/payment/payment-request-creation-data");
const ts_auto_mock_1 = require("ts-auto-mock");
const index_types_1 = require("@app/screens/receive-bitcoin-screen/payment/index.types");
const helpers_1 = require("./helpers");
const payment_request_1 = require("@app/screens/receive-bitcoin-screen/payment/payment-request");
const amounts_1 = require("@app/types/amounts");
const usdAmountInvoice = "lnbc49100n1p3l2q6cpp5y8lc3dv7qnplxhc3z9j0sap4n0hu99g39tl3srx6zj0hrqy2snwsdqqcqzpuxqzfvsp5q6t5f3xeruu4k5sk5nlmxx2kzlw2pydmmjk9g4qqmsc9c6ffzldq9qyyssq9lesnumasvvlvwc7yckvuepklttlvwhjqw3539qqqttsyh5s5j246spy9gezng7ng3d40qsrn6dhsrgs7rccaftzulx5auqqd5lz0psqfskeg4";
const noAmountInvoice = "lnbc1p3l2qmfpp5t2ne20k97f3n24el9a792fte4q6n7jqr6x8qjjnklgktrdvpqq2sdqqcqzpuxqyz5vqsp5n23d3as4jxvpaemnsnvyynlpsg6pzsmxhn3tcwxealcyh6566nys9qyyssqce802uft9d44llekxqedzufkeaq7anldzpf64s4hmskwd9h5ppe4xrgq4dpq8rc3ph048066wgexjtgw4fs8032xwuazw9kdjcq8ujgpdk07ht";
const btcAmountInvoice = "lnbc23690n1p3l2qugpp5jeflfqjpxhe0hg3tzttc325j5l6czs9vq9zqx5edpt0yf7k6cypsdqqcqzpuxqyz5vqsp5lteanmnwddszwut839etrgjenfr3dv5tnvz2d2ww2mvggq7zn46q9qyyssqzcz0rvt7r30q7jul79xqqwpr4k2e8mgd23fkjm422sdgpndwql93d4wh3lap9yfwahue9n7ju80ynkqly0lrqqd2978dr8srkrlrjvcq2v5s6k";
const mockOnChainAddress = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";
const mockLnInvoice = (0, ts_auto_mock_1.createMock)({
    paymentRequest: btcAmountInvoice,
});
const mockLnInvoiceCreate = jest.fn().mockResolvedValue({
    data: {
        lnInvoiceCreate: {
            invoice: mockLnInvoice,
            errors: [],
        },
    },
    errors: [],
});
const mockLnUsdInvoice = (0, ts_auto_mock_1.createMock)({
    paymentRequest: usdAmountInvoice,
});
const mockLnUsdInvoiceCreate = jest.fn().mockResolvedValue({
    data: {
        lnUsdInvoiceCreate: {
            invoice: mockLnUsdInvoice,
            errors: [],
        },
    },
    errors: [],
});
const mockLnNoAmountInvoice = (0, ts_auto_mock_1.createMock)({
    paymentRequest: noAmountInvoice,
});
const mockLnNoAmountInvoiceCreate = jest.fn().mockResolvedValue({
    data: {
        lnNoAmountInvoiceCreate: {
            invoice: mockLnNoAmountInvoice,
            errors: [],
        },
    },
    errors: [],
});
const mockOnChainAddressCurrent = jest.fn().mockResolvedValue({
    data: {
        onChainAddressCurrent: {
            address: mockOnChainAddress,
            errors: [],
        },
    },
    errors: [],
});
exports.mutations = {
    lnInvoiceCreate: mockLnInvoiceCreate,
    lnUsdInvoiceCreate: mockLnUsdInvoiceCreate,
    lnNoAmountInvoiceCreate: mockLnNoAmountInvoiceCreate,
    onChainAddressCurrent: mockOnChainAddressCurrent,
};
const clearMocks = () => {
    mockLnInvoiceCreate.mockClear();
    mockLnUsdInvoiceCreate.mockClear();
    mockLnNoAmountInvoiceCreate.mockClear();
    mockOnChainAddressCurrent.mockClear();
};
exports.clearMocks = clearMocks;
describe("payment request", () => {
    it("ln with btc receiving wallet", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { receivingWalletDescriptor: helpers_1.btcWalletDescriptor }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(mockLnNoAmountInvoiceCreate).toHaveBeenCalled();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.Lightning);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({})).toBe(noAmountInvoice);
    });
    it("ln with usd receiving wallet", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { receivingWalletDescriptor: helpers_1.usdWalletDescriptor }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(mockLnNoAmountInvoiceCreate).toHaveBeenCalled();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.Lightning);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({})).toBe(noAmountInvoice);
    });
    it("ln with btc receiving wallet - set amount", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { receivingWalletDescriptor: helpers_1.btcWalletDescriptor, unitOfAccountAmount: (0, amounts_1.toUsdMoneyAmount)(1) }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(mockLnInvoiceCreate).toHaveBeenCalled();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.Lightning);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({})).toBe(btcAmountInvoice);
    });
    it("ln with usd receiving wallet - set amount", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { receivingWalletDescriptor: helpers_1.usdWalletDescriptor, unitOfAccountAmount: (0, amounts_1.toUsdMoneyAmount)(1) }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(mockLnUsdInvoiceCreate).toHaveBeenCalled();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.Lightning);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({})).toBe(usdAmountInvoice);
    });
    it("paycode/lnurl", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { type: index_types_1.Invoice.PayCode, username: "username", posUrl: "posUrl" }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.PayCode);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({})).toBe("POSURL/USERNAME?lightning=LNURL1WPHHX4TJDSHJUAM9D3KZ66MWDAMKUTMVDE6HYMRS9A6HXETJDESK6EG3S7SZA");
    });
    it("onchain", async () => {
        var _a, _b, _c, _d;
        const prcd = (0, payment_request_creation_data_1.createPaymentRequestCreationData)(Object.assign(Object.assign({}, helpers_1.defaultParams), { type: index_types_1.Invoice.OnChain }));
        const pr = (0, payment_request_1.createPaymentRequest)({ creationData: prcd, mutations: exports.mutations });
        expect(pr.info).toBeUndefined();
        expect(pr.state).toBe(index_types_1.PaymentRequestState.Idle);
        const prNew = await pr.generateRequest();
        expect(prNew.info).not.toBeUndefined();
        expect(mockOnChainAddressCurrent).toHaveBeenCalled();
        expect(prNew.state).toBe(index_types_1.PaymentRequestState.Created);
        expect((_b = (_a = prNew.info) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.invoiceType).toBe(index_types_1.Invoice.OnChain);
        expect((_d = (_c = prNew.info) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.getFullUriFn({}).startsWith(`bitcoin:${mockOnChainAddress}`)).toBe(true);
    });
});
//# sourceMappingURL=payment-request.spec.js.map