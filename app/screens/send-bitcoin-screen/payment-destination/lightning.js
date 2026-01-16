"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLightningDestination = exports.resolveLightningDestination = void 0;
const client_1 = require("@galoymoney/client");
const payment_details_1 = require("../payment-details");
const index_types_1 = require("./index.types");
const amounts_1 = require("@app/types/amounts");
const resolveLightningDestination = (parsedLightningDestination) => {
    if (parsedLightningDestination.valid === true) {
        return (0, exports.createLightningDestination)(parsedLightningDestination);
    }
    return {
        valid: false,
        invalidPaymentDestination: parsedLightningDestination,
        invalidReason: mapInvalidReason(parsedLightningDestination.invalidReason),
    };
};
exports.resolveLightningDestination = resolveLightningDestination;
const createLightningDestination = (parsedLightningDestination) => {
    const { paymentRequest, amount, memo } = parsedLightningDestination;
    let createPaymentDetail;
    if (amount) {
        createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
            return (0, payment_details_1.createAmountLightningPaymentDetails)({
                paymentRequest,
                sendingWalletDescriptor,
                paymentRequestAmount: (0, amounts_1.toBtcMoneyAmount)(amount),
                convertMoneyAmount,
                destinationSpecifiedMemo: memo,
            });
        };
    }
    else {
        createPaymentDetail = ({ convertMoneyAmount, sendingWalletDescriptor, }) => {
            return (0, payment_details_1.createNoAmountLightningPaymentDetails)({
                paymentRequest,
                sendingWalletDescriptor,
                convertMoneyAmount,
                destinationSpecifiedMemo: memo,
                unitOfAccountAmount: amounts_1.ZeroBtcMoneyAmount,
            });
        };
    }
    return {
        valid: true,
        destinationDirection: index_types_1.DestinationDirection.Send,
        validDestination: parsedLightningDestination,
        createPaymentDetail,
    };
};
exports.createLightningDestination = createLightningDestination;
const mapInvalidReason = (invalidLightningReason) => {
    switch (invalidLightningReason) {
        case client_1.InvalidLightningDestinationReason.InvoiceExpired:
            return index_types_1.InvalidDestinationReason.InvoiceExpired;
        case client_1.InvalidLightningDestinationReason.WrongNetwork:
            return index_types_1.InvalidDestinationReason.WrongNetwork;
        case client_1.InvalidLightningDestinationReason.Unknown:
            return index_types_1.InvalidDestinationReason.UnknownLightning;
    }
};
//# sourceMappingURL=lightning.js.map