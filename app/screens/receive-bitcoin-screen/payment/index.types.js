"use strict";
/**
 * Domain Nomenclature:
 * -------------------
 * PaymentRequestCreationData - Clientside request data to create the actual request
 * PaymentRequest - Generated quotation which contains the finalized invoice data
 * Invoice - (not specific to LN) The quoted invoice that contains invoice type specific data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentRequestState = exports.Invoice = void 0;
// ------------------------ COMMONS ------------------------
/* Invoice */
exports.Invoice = {
    Lightning: "Lightning",
    OnChain: "OnChain",
    PayCode: "PayCode",
};
// ------------------------ QUOTATION ------------------------
exports.PaymentRequestState = {
    Idle: "Idle",
    Loading: "Loading",
    Created: "Created",
    Error: "Error",
    Paid: "Paid",
    Expired: "Expired",
};
//# sourceMappingURL=index.types.js.map