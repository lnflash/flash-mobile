"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockCreateAmountLightningPaymentDetail = jest.fn();
const mockCreateNoAmountLightningPaymentDetail = jest.fn();
const mockCreateLnurlPaymentDetail = jest.fn();
const mockCreateNoAmountOnchainPaymentDetail = jest.fn();
const mockCreateAmountOnchainPaymentDetail = jest.fn();
const mockCreateIntraledgerPaymentDetail = jest.fn();
jest.mock("@app/screens/send-bitcoin-screen/payment-details", () => {
    return {
        createAmountLightningPaymentDetails: mockCreateAmountLightningPaymentDetail,
        createNoAmountLightningPaymentDetails: mockCreateNoAmountLightningPaymentDetail,
        createLnurlPaymentDetails: mockCreateLnurlPaymentDetail,
        createNoAmountOnchainPaymentDetails: mockCreateNoAmountOnchainPaymentDetail,
        createAmountOnchainPaymentDetails: mockCreateAmountOnchainPaymentDetail,
        createIntraledgerPaymentDetails: mockCreateIntraledgerPaymentDetail,
    };
});
const payment_destination_1 = require("@app/screens/send-bitcoin-screen/payment-destination");
const helpers_1 = require("./helpers");
const amounts_1 = require("@app/types/amounts");
describe("create onchain destination", () => {
    const baseParsedOnchainDestination = {
        paymentType: "onchain",
        valid: true,
        address: "testaddress",
        memo: "testmemo",
    };
    describe("with amount", () => {
        const parsedOnchainDestinationWithAmount = Object.assign(Object.assign({}, baseParsedOnchainDestination), { amount: 1000 });
        it("correctly creates payment detail", () => {
            const amountOnchainDestination = (0, payment_destination_1.createOnchainDestination)(parsedOnchainDestinationWithAmount);
            amountOnchainDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
            expect(mockCreateAmountOnchainPaymentDetail).toBeCalledWith({
                address: parsedOnchainDestinationWithAmount.address,
                destinationSpecifiedAmount: (0, amounts_1.toBtcMoneyAmount)(parsedOnchainDestinationWithAmount.amount),
                convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
                sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
                destinationSpecifiedMemo: parsedOnchainDestinationWithAmount.memo,
            });
        });
    });
    describe("without amount", () => {
        const parsedOnchainDestinationWithoutAmount = Object.assign({}, baseParsedOnchainDestination);
        it("correctly creates payment detail", () => {
            const noAmountOnchainDestination = (0, payment_destination_1.createOnchainDestination)(parsedOnchainDestinationWithoutAmount);
            noAmountOnchainDestination.createPaymentDetail(helpers_1.defaultPaymentDetailParams);
            expect(mockCreateNoAmountOnchainPaymentDetail).toBeCalledWith({
                address: parsedOnchainDestinationWithoutAmount.address,
                unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
                convertMoneyAmount: helpers_1.defaultPaymentDetailParams.convertMoneyAmount,
                sendingWalletDescriptor: helpers_1.defaultPaymentDetailParams.sendingWalletDescriptor,
                destinationSpecifiedMemo: parsedOnchainDestinationWithoutAmount.memo,
            });
        });
    });
});
//# sourceMappingURL=onchain.spec.js.map