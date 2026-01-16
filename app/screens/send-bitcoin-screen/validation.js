"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDestinationNetworkValid = exports.isDestinationLightningPayment = void 0;
const isDestinationLightningPayment = (destination) => {
    return (destination.toLocaleLowerCase().startsWith("lnbc") ||
        destination.toLocaleLowerCase().startsWith("lntb"));
};
exports.isDestinationLightningPayment = isDestinationLightningPayment;
const isDestinationNetworkValid = (destination, network) => {
    return ((network === "signet" && destination.toLowerCase().startsWith("lntb")) ||
        (network === "mainnet" && destination.toLowerCase().startsWith("lnbc")));
};
exports.isDestinationNetworkValid = isDestinationNetworkValid;
//# sourceMappingURL=validation.js.map