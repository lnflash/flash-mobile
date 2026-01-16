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
Object.defineProperty(exports, "__esModule", { value: true });
const generated_1 = require("@app/graphql/generated");
const PaymentDetails = __importStar(require("@app/screens/send-bitcoin-screen/payment-details/lightning"));
const ts_auto_mock_1 = require("ts-auto-mock");
const helpers_1 = require("./helpers");
const defaultParamsWithoutInvoice = {
    lnurl: "testlnurl",
    lnurlParams: (0, ts_auto_mock_1.createMock)({ min: 1, max: 1000 }),
    convertMoneyAmount: helpers_1.convertMoneyAmountMock,
    sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor,
    unitOfAccountAmount: helpers_1.testAmount,
};
const defaultParamsWithInvoice = Object.assign(Object.assign({}, defaultParamsWithoutInvoice), { paymentRequest: "testinvoice", paymentRequestAmount: helpers_1.btcTestAmount });
const defaultParamsWithEqualMinMaxAmount = Object.assign(Object.assign({}, defaultParamsWithoutInvoice), { lnurlParams: (0, ts_auto_mock_1.createMock)({ min: 100, max: 100 }) });
const spy = jest.spyOn(PaymentDetails, "createLnurlPaymentDetails");
describe("lnurl payment details", () => {
    const { createLnurlPaymentDetails } = PaymentDetails;
    beforeEach(() => {
        spy.mockClear();
    });
    it("properly sets fields if min and max amount is equal", () => {
        const paymentDetails = createLnurlPaymentDetails(defaultParamsWithEqualMinMaxAmount);
        expect(paymentDetails).toEqual(expect.objectContaining({
            destination: defaultParamsWithEqualMinMaxAmount.lnurl,
            settlementAmount: defaultParamsWithEqualMinMaxAmount.unitOfAccountAmount,
            unitOfAccountAmount: defaultParamsWithEqualMinMaxAmount.unitOfAccountAmount,
            sendingWalletDescriptor: defaultParamsWithEqualMinMaxAmount.sendingWalletDescriptor,
            settlementAmountIsEstimated: defaultParamsWithEqualMinMaxAmount.sendingWalletDescriptor.currency !==
                generated_1.WalletCurrency.Btc,
            canGetFee: false,
            canSendPayment: false,
            canSetAmount: false,
            canSetMemo: true,
            convertMoneyAmount: defaultParamsWithoutInvoice.convertMoneyAmount,
        }));
    });
    it("properly sets fields without invoice", () => {
        const paymentDetails = createLnurlPaymentDetails(defaultParamsWithoutInvoice);
        expect(paymentDetails).toEqual(expect.objectContaining({
            destination: defaultParamsWithoutInvoice.lnurl,
            settlementAmount: defaultParamsWithoutInvoice.unitOfAccountAmount,
            unitOfAccountAmount: defaultParamsWithoutInvoice.unitOfAccountAmount,
            sendingWalletDescriptor: defaultParamsWithoutInvoice.sendingWalletDescriptor,
            canGetFee: false,
            settlementAmountIsEstimated: defaultParamsWithInvoice.sendingWalletDescriptor.currency !==
                generated_1.WalletCurrency.Btc,
            canSendPayment: false,
            canSetAmount: true,
            canSetMemo: true,
            convertMoneyAmount: defaultParamsWithoutInvoice.convertMoneyAmount,
        }));
    });
    it("properly sets fields with invoice set", () => {
        const paymentDetails = createLnurlPaymentDetails(defaultParamsWithInvoice);
        expect(paymentDetails).toEqual(expect.objectContaining({
            destination: defaultParamsWithInvoice.lnurl,
            settlementAmount: defaultParamsWithInvoice.paymentRequestAmount,
            unitOfAccountAmount: defaultParamsWithInvoice.unitOfAccountAmount,
            sendingWalletDescriptor: defaultParamsWithInvoice.sendingWalletDescriptor,
            settlementAmountIsEstimated: defaultParamsWithInvoice.sendingWalletDescriptor.currency !==
                generated_1.WalletCurrency.Btc,
            canGetFee: true,
            canSendPayment: true,
            canSetAmount: true,
            canSetMemo: true,
            convertMoneyAmount: defaultParamsWithoutInvoice.convertMoneyAmount,
        }));
    });
    describe("sending from a btc wallet", () => {
        const btcSendingWalletParams = Object.assign(Object.assign({}, defaultParamsWithInvoice), { sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor });
        const paymentDetails = createLnurlPaymentDetails(btcSendingWalletParams);
        it("uses the correct fee mutations and args", async () => {
            const feeParamsMocks = (0, helpers_1.createGetFeeMocks)();
            if (!paymentDetails.canGetFee) {
                throw new Error("Cannot get fee");
            }
            try {
                await paymentDetails.getFee(feeParamsMocks);
            }
            catch (_a) {
                // do nothing as function is expected to throw since we are not mocking the fee response
            }
            expect(feeParamsMocks.lnInvoiceFeeProbe).toHaveBeenCalledWith({
                variables: {
                    input: {
                        paymentRequest: btcSendingWalletParams.paymentRequest,
                        walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
        it("uses the correct send payment mutation and args", async () => {
            const sendPaymentMocks = (0, helpers_1.createSendPaymentMocks)();
            if (!paymentDetails.canSendPayment) {
                throw new Error("Cannot send payment");
            }
            try {
                await paymentDetails.sendPaymentMutation(sendPaymentMocks);
            }
            catch (_a) {
                // do nothing as function is expected to throw since we are not mocking the send payment response
            }
            expect(sendPaymentMocks.lnInvoicePaymentSend).toHaveBeenCalledWith({
                variables: {
                    input: {
                        paymentRequest: btcSendingWalletParams.paymentRequest,
                        walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    describe("sending from a usd wallet", () => {
        const usdSendingWalletParams = Object.assign(Object.assign({}, defaultParamsWithInvoice), { sendingWalletDescriptor: helpers_1.usdSendingWalletDescriptor });
        const paymentDetails = createLnurlPaymentDetails(usdSendingWalletParams);
        it("uses the correct fee mutations and args", async () => {
            const feeParamsMocks = (0, helpers_1.createGetFeeMocks)();
            if (!paymentDetails.canGetFee) {
                throw new Error("Cannot get fee");
            }
            try {
                await paymentDetails.getFee(feeParamsMocks);
            }
            catch (_a) {
                // do nothing as function is expected to throw since we are not mocking the fee response
            }
            expect(feeParamsMocks.lnUsdInvoiceFeeProbe).toHaveBeenCalledWith({
                variables: {
                    input: {
                        paymentRequest: usdSendingWalletParams.paymentRequest,
                        walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
        it("uses the correct send payment mutation and args", async () => {
            const sendPaymentMocks = (0, helpers_1.createSendPaymentMocks)();
            if (!paymentDetails.canSendPayment) {
                throw new Error("Cannot send payment");
            }
            try {
                await paymentDetails.sendPaymentMutation(sendPaymentMocks);
            }
            catch (_a) {
                // do nothing as function is expected to throw since we are not mocking the send payment response
            }
            expect(sendPaymentMocks.lnInvoicePaymentSend).toHaveBeenCalledWith({
                variables: {
                    input: {
                        paymentRequest: usdSendingWalletParams.paymentRequest,
                        walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    it("cannot set memo if memo is provided", () => {
        const paramsWithMemo = Object.assign(Object.assign({}, defaultParamsWithoutInvoice), { destinationSpecifiedMemo: "sender memo" });
        const paymentDetails = createLnurlPaymentDetails(paramsWithMemo);
        (0, helpers_1.expectDestinationSpecifiedMemoCannotSetMemo)(paymentDetails, paramsWithMemo.destinationSpecifiedMemo);
    });
    it("can set memo if no memo provided", () => {
        const testSetMemo = (0, helpers_1.getTestSetMemo)();
        testSetMemo({
            defaultParams: defaultParamsWithoutInvoice,
            spy,
            creatorFunction: createLnurlPaymentDetails,
        });
    });
    it("can set amount", () => {
        const testSetAmount = (0, helpers_1.getTestSetAmount)();
        testSetAmount({
            defaultParams: defaultParamsWithoutInvoice,
            spy,
            creatorFunction: createLnurlPaymentDetails,
        });
    });
    it("can set sending wallet descriptor", () => {
        const testSetSendingWalletDescriptor = (0, helpers_1.getTestSetSendingWalletDescriptor)();
        testSetSendingWalletDescriptor({
            defaultParams: defaultParamsWithoutInvoice,
            spy,
            creatorFunction: createLnurlPaymentDetails,
        });
    });
});
//# sourceMappingURL=lnurl-payment-details.spec.js.map