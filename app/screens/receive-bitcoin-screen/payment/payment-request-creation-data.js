"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentRequestCreationData = void 0;
const index_types_1 = require("./index.types");
const createPaymentRequestCreationData = (params) => {
    // These sets are always available
    const setType = (type) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { type }));
    const setDefaultWalletDescriptor = (defaultWalletDescriptor) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { defaultWalletDescriptor }));
    const setBitcoinWalletDescriptor = (bitcoinWalletDescriptor) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { bitcoinWalletDescriptor }));
    const setConvertMoneyAmount = (convertMoneyAmount) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { convertMoneyAmount }));
    const setUsername = (username) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { username }));
    const { type, defaultWalletDescriptor, 
    // bitcoinWalletDescriptor,
    convertMoneyAmount, memo, } = params;
    // Permissions for the specified type
    const permissions = {
        canSetReceivingWalletDescriptor: false,
        canSetMemo: false,
        canSetAmount: false,
    };
    if (type === index_types_1.Invoice.Lightning || type === index_types_1.Invoice.OnChain) {
        permissions.canSetReceivingWalletDescriptor = true;
        permissions.canSetMemo = true;
        permissions.canSetAmount = true;
    }
    // Permission based sets
    let setReceivingWalletDescriptor = undefined;
    if (permissions.canSetReceivingWalletDescriptor) {
        setReceivingWalletDescriptor = (receivingWalletDescriptor) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { receivingWalletDescriptor }));
    }
    let setMemo = undefined;
    if (permissions.canSetMemo) {
        setMemo = (memo) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { memo }));
    }
    let setAmount = undefined;
    if (permissions.canSetAmount) {
        setAmount = (unitOfAccountAmount) => (0, exports.createPaymentRequestCreationData)(Object.assign(Object.assign({}, params), { unitOfAccountAmount }));
    }
    // Set default receiving wallet descriptor
    let { receivingWalletDescriptor } = params;
    if (!receivingWalletDescriptor) {
        receivingWalletDescriptor = defaultWalletDescriptor;
    }
    // Paycode only to Bitcoin
    // FLASH FORK: removed
    // if (type === "PayCode") {
    //   receivingWalletDescriptor = bitcoinWalletDescriptor as WalletDescriptor<T>
    // }
    // Set settlement amount if unit of account amount is set
    const { unitOfAccountAmount } = params;
    let settlementAmount = undefined;
    if (unitOfAccountAmount) {
        settlementAmount = convertMoneyAmount(unitOfAccountAmount, receivingWalletDescriptor.currency);
    }
    return Object.assign(Object.assign(Object.assign({}, params), permissions), { setType,
        setBitcoinWalletDescriptor,
        setDefaultWalletDescriptor,
        setConvertMoneyAmount,
        setUsername,
        receivingWalletDescriptor,
        // optional sets
        setReceivingWalletDescriptor,
        setMemo,
        setAmount,
        // optional data
        unitOfAccountAmount,
        settlementAmount,
        memo, canUsePaycode: Boolean(params.username) });
};
exports.createPaymentRequestCreationData = createPaymentRequestCreationData;
//# sourceMappingURL=payment-request-creation-data.js.map