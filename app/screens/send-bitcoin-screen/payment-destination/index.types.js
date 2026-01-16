"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidDestinationReason = exports.DestinationDirection = void 0;
exports.DestinationDirection = {
    Send: "Send",
    Receive: "Receive",
};
exports.InvalidDestinationReason = {
    UnknownDestination: "UnknownDestination",
    InvoiceExpired: "InvoiceExpired",
    WrongNetwork: "WrongNetwork",
    InvalidAmount: "InvalidAmount",
    UsernameDoesNotExist: "UsernameDoesNotExist",
    SelfPayment: "SelfPayment",
    LnurlUnsupported: "LnurlUnsupported",
    LnurlError: "LnurlError",
    UnknownLightning: "UnknownLightning",
    UnknownOnchain: "UnknownOnchain",
};
//# sourceMappingURL=index.types.js.map