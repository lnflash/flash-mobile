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
const PaymentDetails = __importStar(require("@app/screens/send-bitcoin-screen/payment-details/intraledger"));
const helpers_1 = require("./helpers");
const defaultParams = {
    handle: "test",
    recipientWalletId: "testid",
    convertMoneyAmount: helpers_1.convertMoneyAmountMock,
    sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor,
    unitOfAccountAmount: helpers_1.testAmount,
};
const spy = jest.spyOn(PaymentDetails, "createIntraledgerPaymentDetails");
describe("intraledger payment details", () => {
    const { createIntraledgerPaymentDetails } = PaymentDetails;
    beforeEach(() => {
        spy.mockClear();
    });
    it("properly sets fields with all arguments provided", () => {
        const paymentDetails = createIntraledgerPaymentDetails(defaultParams);
        expect(paymentDetails).toEqual(expect.objectContaining({
            destination: defaultParams.handle,
            settlementAmount: defaultParams.convertMoneyAmount(defaultParams.unitOfAccountAmount, defaultParams.sendingWalletDescriptor.currency),
            unitOfAccountAmount: defaultParams.unitOfAccountAmount,
            sendingWalletDescriptor: defaultParams.sendingWalletDescriptor,
            settlementAmountIsEstimated: false,
            canGetFee: true,
            canSendPayment: true,
            canSetAmount: true,
            canSetMemo: true,
            convertMoneyAmount: defaultParams.convertMoneyAmount,
        }));
    });
    describe("sending from a btc wallet", () => {
        const btcSendingWalletParams = Object.assign(Object.assign({}, defaultParams), { unitOfAccountAmount: helpers_1.testAmount, sendingWalletDescriptor: helpers_1.btcSendingWalletDescriptor });
        const paymentDetails = createIntraledgerPaymentDetails(btcSendingWalletParams);
        const settlementAmount = defaultParams.convertMoneyAmount(helpers_1.testAmount, helpers_1.btcSendingWalletDescriptor.currency);
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
            expect(sendPaymentMocks.intraLedgerPaymentSend).toHaveBeenCalledWith({
                variables: {
                    input: {
                        recipientWalletId: defaultParams.recipientWalletId,
                        amount: settlementAmount.amount,
                        walletId: btcSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    describe("sending from a usd wallet", () => {
        const usdSendingWalletParams = Object.assign(Object.assign({}, defaultParams), { unitOfAccountAmount: helpers_1.testAmount, sendingWalletDescriptor: helpers_1.usdSendingWalletDescriptor });
        const settlementAmount = defaultParams.convertMoneyAmount(helpers_1.testAmount, helpers_1.usdSendingWalletDescriptor.currency);
        const paymentDetails = createIntraledgerPaymentDetails(usdSendingWalletParams);
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
            expect(sendPaymentMocks.intraLedgerUsdPaymentSend).toHaveBeenCalledWith({
                variables: {
                    input: {
                        recipientWalletId: defaultParams.recipientWalletId,
                        amount: settlementAmount.amount,
                        walletId: usdSendingWalletParams.sendingWalletDescriptor.id,
                    },
                },
            });
        });
    });
    it("cannot calculate fee or send payment with zero amount", () => {
        const paramsWithMemo = Object.assign(Object.assign({}, defaultParams), { unitOfAccountAmount: helpers_1.zeroAmount });
        const paymentDetails = createIntraledgerPaymentDetails(paramsWithMemo);
        (0, helpers_1.expectCannotGetFee)(paymentDetails);
        (0, helpers_1.expectCannotSendPayment)(paymentDetails);
    });
    it("cannot set memo if memo is provided", () => {
        const paramsWithMemo = Object.assign(Object.assign({}, defaultParams), { destinationSpecifiedMemo: "sender memo" });
        const paymentDetails = createIntraledgerPaymentDetails(paramsWithMemo);
        (0, helpers_1.expectDestinationSpecifiedMemoCannotSetMemo)(paymentDetails, paramsWithMemo.destinationSpecifiedMemo);
    });
    it("can set memo if no memo provided", () => {
        const testSetMemo = (0, helpers_1.getTestSetMemo)();
        testSetMemo({
            defaultParams,
            spy,
            creatorFunction: createIntraledgerPaymentDetails,
        });
    });
    it("can set amount", () => {
        const testSetAmount = (0, helpers_1.getTestSetAmount)();
        testSetAmount({
            defaultParams,
            spy,
            creatorFunction: createIntraledgerPaymentDetails,
        });
    });
    it("can set sending wallet descriptor", () => {
        const testSetSendingWalletDescriptor = (0, helpers_1.getTestSetSendingWalletDescriptor)();
        testSetSendingWalletDescriptor({
            defaultParams,
            spy,
            creatorFunction: createIntraledgerPaymentDetails,
        });
    });
});
//# sourceMappingURL=intraledger-payment-details.spec.js.map