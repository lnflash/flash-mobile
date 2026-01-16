"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOnchainDestination = exports.resolveOnchainDestination = void 0;
const client_1 = require("@galoymoney/client");
const payment_details_1 = require("../payment-details");
const index_types_1 = require("./index.types");
const amounts_1 = require("@app/types/amounts");
const resolveOnchainDestination = (parsedOnchainDestination) => {
    if (parsedOnchainDestination.valid === true) {
        return (0, exports.createOnchainDestination)(parsedOnchainDestination);
    }
    return {
        valid: false,
        invalidPaymentDestination: parsedOnchainDestination,
        invalidReason: mapInvalidReason(parsedOnchainDestination.invalidReason),
    };
};
exports.resolveOnchainDestination = resolveOnchainDestination;
const createOnchainDestination = (parsedOnchainDestination) => {
    const { address, amount, memo } = parsedOnchainDestination;
    let createPaymentDetail;
    if (amount) {
        createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
            return (0, payment_details_1.createAmountOnchainPaymentDetails)({
                address,
                sendingWalletDescriptor,
                destinationSpecifiedAmount: (0, amounts_1.toBtcMoneyAmount)(amount),
                convertMoneyAmount,
                destinationSpecifiedMemo: memo,
            });
        };
    }
    else {
        createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
            return (0, payment_details_1.createNoAmountOnchainPaymentDetails)({
                address,
                sendingWalletDescriptor,
                convertMoneyAmount,
                destinationSpecifiedMemo: memo,
                unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
            });
        };
    }
    return {
        valid: true,
        createPaymentDetail,
        destinationDirection: index_types_1.DestinationDirection.Send,
        validDestination: parsedOnchainDestination,
    };
};
exports.createOnchainDestination = createOnchainDestination;
const mapInvalidReason = (invalidReason) => {
    switch (invalidReason) {
        case client_1.InvalidOnchainDestinationReason.WrongNetwork:
            return index_types_1.InvalidDestinationReason.WrongNetwork;
        case client_1.InvalidOnchainDestinationReason.InvalidAmount:
            return index_types_1.InvalidDestinationReason.InvalidAmount;
        case client_1.InvalidOnchainDestinationReason.Unknown:
            return index_types_1.InvalidDestinationReason.UnknownOnchain;
    }
};
//# sourceMappingURL=onchain.js.map