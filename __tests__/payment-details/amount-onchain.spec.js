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
const PaymentDetails = __importStar(require("@app/screens/send-bitcoin-screen/payment-details/onchain"));
const helpers_1 = require("./helpers");
const defaultParams = {
    address: "testaddress",
    destinationSpecifiedAmount: helpers_1.testAmount,
    convertMoneyAmount: helpers_1.convertMoneyAmountMock,
    sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor,
};
const spy = jest.spyOn(PaymentDetails, "createAmountOnchainPaymentDetails");
describe("no amount onchain payment details", () => {
    const { createAmountOnchainPaymentDetails } = PaymentDetails;
    beforeEach(() => {
        spy.mockClear();
    });
    it("properly sets fields with all arguments provided", () => {
        const paymentDetails = createAmountOnchainPaymentDetails(defaultParams);
        expect(paymentDetails).toEqual(expect.objectContaining({
            destination: defaultParams.address,
            settlementAmount: defaultParams.convertMoneyAmount(defaultParams.destinationSpecifiedAmount, defaultParams.sendingWalletDescriptor.currency),
            unitOfAccountAmount: defaultParams.destinationSpecifiedAmount,
            sendingWalletDescriptor: defaultParams.sendingWalletDescriptor,
            settlementAmountIsEstimated: false,
            canGetFee: true,
            canSendPayment: true,
            canSetAmount: false,
            canSetMemo: true,
            convertMoneyAmount: defaultParams.convertMoneyAmount,
        }));
    });
    describe("sending from a btc wallet", () => {
        const btcSendingWalletParams = Object.assign(Object.assign({}, defaultParams), { sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor });
        const paymentDetails = createAmountOnchainPaymentDetails(btcSendingWalletParams);
        const settlementAmount = defaultParams.convertMoneyAmount(helpers_1.testAmount, helpers_1.btcSendingWalletDescriptor.currency);
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
            expect(feeParamsMocks.onChainTxFee).toHaveBeenCalledWith({
                variables: {
                    address: defaultParams.address,
                    amount: settlementAmount.amount,
                    walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
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
            expect(sendPaymentMocks.onChainPaymentSend).toHaveBeenCalledWith({
                variables: {
                    input: {
                        address: defaultParams.address,
                        amount: settlementAmount.amount,
                        walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    describe("sending from a usd wallet", () => {
        const usdSendingWalletParams = Object.assign(Object.assign({}, defaultParams), { sendingWalletDescriptor: helpers_1.usdSendingWalletDescriptor });
        const paymentDetails = createAmountOnchainPaymentDetails(usdSendingWalletParams);
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
            expect(feeParamsMocks.onChainUsdTxFeeAsBtcDenominated).toHaveBeenCalledWith({
                variables: {
                    address: defaultParams.address,
                    amount: usdSendingWalletParams.destinationSpecifiedAmount.amount,
                    walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
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
            expect(sendPaymentMocks.onChainUsdPaymentSendAsBtcDenominated).toHaveBeenCalledWith({
                variables: {
                    input: {
                        address: defaultParams.address,
                        amount: usdSendingWalletParams.destinationSpecifiedAmount.amount,
                        walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    it("cannot set memo if memo is provided", () => {
        const paramsWithMemo = Object.assign(Object.assign({}, defaultParams), { destinationSpecifiedMemo: "sender memo" });
        const paymentDetails = createAmountOnchainPaymentDetails(paramsWithMemo);
        (0, helpers_1.expectDestinationSpecifiedMemoCannotSetMemo)(paymentDetails, paramsWithMemo.destinationSpecifiedMemo);
    });
    it("can set memo if no memo provided", () => {
        const testSetMemo = (0, helpers_1.getTestSetMemo)();
        testSetMemo({
            defaultParams,
            spy,
            creatorFunction: createAmountOnchainPaymentDetails,
        });
    });
    it("can set sending wallet descriptor", () => {
        const testSetSendingWalletDescriptor = (0, helpers_1.getTestSetSendingWalletDescriptor)();
        testSetSendingWalletDescriptor({
            defaultParams,
            spy,
            creatorFunction: createAmountOnchainPaymentDetails,
        });
    });
});
//# sourceMappingURL=amount-onchain.spec.js.map