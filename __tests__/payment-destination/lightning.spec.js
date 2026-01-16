"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockCreateAmountLightningPaymentDetail = jest.fn();
const mockCreateNoAmountLightningPaymentDetail = jest.fn();
jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => {
    return {
        createAmountLightningPaymentDetails: mockCreateAmountLightningPaymentDetail,
        createNoAmountLightningPaymentDetails: mockCreateNoAmountLightningPaymentDetail,
    };
});
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const helpers_1 = require("./helpers");
const amounts_1 = require("@app/types/amounts");
describe("create lightning destination", () => {
    const baseParsedLightningDestination = {
        paymentType: "lightning",
        valid: true,
        paymentRequest: "testinvoice",
        memo: "testmemo",
    };
    describe("with amount", () => {
        const parsedLightningDestinationWithAmount = Object.assign(Object.assign({}, baseParsedLightningDestination), { amount: 1000 });
        it("correctly creates payment detail", () => {
            const amountLightningDestination = (0, payment_destination_1.createLightningDestination)(parsedLightningDestinationWithAmount);
            amountLightningDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
            expect(mockCreateAmountLightningPaymentDetail).toBeCalledWith({
                paymentRequest: parsedLightningDestinationWithAmount.paymentRequest,
                paymentRequestAmount: (0, amounts_1.toBtcMoneyAmount)(parsedLightningDestinationWithAmount.amount),
                convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
                destinationSpecifiedMemo: parsedLightningDestinationWithAmount.memo,
                sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
            });
        });
    });
    describe("without amount", () => {
        const parsedLightningDestinationWithoutAmount = Object.assign({}, baseParsedLightningDestination);
        it("correctly creates payment detail", () => {
            const noAmountLightningDestination = (0, payment_destination_1.createLightningDestination)(parsedLightningDestinationWithoutAmount);
            noAmountLightningDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
            expect(mockCreateNoAmountLightningPaymentDetail).toBeCalledWith({
                paymentRequest: parsedLightningDestinationWithoutAmount.paymentRequest,
                unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
                convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
                destinationSpecifiedMemo: parsedLightningDestinationWithoutAmount.memo,
                sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
            });
        });
    });
});
//# sourceMappingURL=lightning.spec.js.map