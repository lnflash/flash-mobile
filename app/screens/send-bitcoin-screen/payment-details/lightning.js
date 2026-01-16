"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLnurlPaymentDetails = exports.createAmountLightningPaymentDetails = exports.createNoAmountLightningPaymentDetails = void 0;
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const client_1 = require("@galoymoney/client");
const createNoAmountLightningPaymentDetails = (params) => {
    const { paymentRequest, convertMoneyAmount, unitOfAccountAmount, sendingWalletDescriptor, destinationSpecifiedMemo, senderSpecifiedMemo, } = params;
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    const settlementAmount = convertMoneyAmount(unitOfAccountAmount, sendingWalletDescriptor.currency);
    const setConvertMoneyAmount = (convertMoneyAmount) => {
        return (0, exports.createNoAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount }));
    };
    let sendPaymentAndGetFee = {
        canSendPayment: false,
        canGetFee: false,
    };
    if ((settlementAmount === null || settlementAmount === void 0 ? void 0 : settlementAmount.amount) &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
        const getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.lnNoAmountInvoiceFeeProbe({
                variables: {
                    input: {
                        amount: settlementAmount.amount,
                        paymentRequest,
                        walletId: sendingWalletDescriptor.id,
                    },
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.lnNoAmountInvoiceFeeProbe.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
                errors: data === null || data === void 0 ? void 0 : data.lnNoAmountInvoiceFeeProbe.errors,
            };
        };
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.lnNoAmountInvoicePaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        paymentRequest,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.lnNoAmountInvoicePaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.lnNoAmountInvoicePaymentSend.errors,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            getFee,
            sendPaymentMutation,
        };
    }
    else if ((settlementAmount === null || settlementAmount === void 0 ? void 0 : settlementAmount.amount) &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Usd) {
        const getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.lnNoAmountUsdInvoiceFeeProbe({
                variables: {
                    input: {
                        amount: settlementAmount.amount,
                        paymentRequest,
                        walletId: sendingWalletDescriptor.id,
                    },
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.lnNoAmountUsdInvoiceFeeProbe.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
                errors: data === null || data === void 0 ? void 0 : data.lnNoAmountUsdInvoiceFeeProbe.errors,
            };
        };
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.lnNoAmountUsdInvoicePaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        paymentRequest,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.lnNoAmountUsdInvoicePaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.lnNoAmountUsdInvoicePaymentSend.errors,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            getFee,
            sendPaymentMutation,
        };
    }
    const setAmount = (newUnitOfAccountAmount) => {
        return (0, exports.createNoAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { unitOfAccountAmount: newUnitOfAccountAmount }));
    };
    const setMemo = destinationSpecifiedMemo
        ? { canSetMemo: false }
        : {
            setMemo: (newMemo) => (0, exports.createNoAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo })),
            canSetMemo: true,
        };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createNoAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign(Object.assign({ destination: paymentRequest, memo,
        convertMoneyAmount,
        setConvertMoneyAmount, paymentType: client_1.PaymentType.Lightning, settlementAmount, settlementAmountIsEstimated: false, unitOfAccountAmount,
        sendingWalletDescriptor,
        setAmount, canSetAmount: true }, setMemo), sendPaymentAndGetFee), { setSendingWalletDescriptor });
};
exports.createNoAmountLightningPaymentDetails = createNoAmountLightningPaymentDetails;
const createAmountLightningPaymentDetails = (params) => {
    const { paymentRequest, paymentRequestAmount, convertMoneyAmount, sendingWalletDescriptor, destinationSpecifiedMemo, senderSpecifiedMemo, } = params;
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    const settlementAmount = convertMoneyAmount(paymentRequestAmount, sendingWalletDescriptor.currency);
    const unitOfAccountAmount = paymentRequestAmount;
    const sendPaymentMutation = async (paymentMutations) => {
        const { data } = await paymentMutations.lnInvoicePaymentSend({
            variables: {
                input: {
                    walletId: sendingWalletDescriptor.id,
                    paymentRequest,
                    memo,
                },
            },
        });
        return {
            status: data === null || data === void 0 ? void 0 : data.lnInvoicePaymentSend.status,
            errors: data === null || data === void 0 ? void 0 : data.lnInvoicePaymentSend.errors,
        };
    };
    let getFee;
    if (sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
        getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.lnInvoiceFeeProbe({
                variables: {
                    input: {
                        paymentRequest,
                        walletId: sendingWalletDescriptor.id,
                    },
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.lnInvoiceFeeProbe.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
                errors: data === null || data === void 0 ? void 0 : data.lnInvoiceFeeProbe.errors,
            };
        };
    }
    else {
        getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.lnUsdInvoiceFeeProbe({
                variables: {
                    input: {
                        paymentRequest,
                        walletId: sendingWalletDescriptor.id,
                    },
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.lnUsdInvoiceFeeProbe.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
                errors: data === null || data === void 0 ? void 0 : data.lnUsdInvoiceFeeProbe.errors,
            };
        };
    }
    const setMemo = destinationSpecifiedMemo
        ? {
            canSetMemo: false,
        }
        : {
            setMemo: (newMemo) => (0, exports.createAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo })),
            canSetMemo: true,
        };
    const setConvertMoneyAmount = (newConvertMoneyAmount) => {
        return (0, exports.createAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount: newConvertMoneyAmount }));
    };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createAmountLightningPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign({ destination: paymentRequest, destinationSpecifiedAmount: paymentRequestAmount, convertMoneyAmount,
        memo, paymentType: client_1.PaymentType.Lightning, settlementAmount, settlementAmountIsEstimated: sendingWalletDescriptor.currency !== generated_1.WalletCurrency.Btc, sendingWalletDescriptor,
        unitOfAccountAmount }, setMemo), { canSetAmount: false, setSendingWalletDescriptor,
        setConvertMoneyAmount,
        sendPaymentMutation, canSendPayment: true, getFee, canGetFee: true });
};
exports.createAmountLightningPaymentDetails = createAmountLightningPaymentDetails;
const createLnurlPaymentDetails = (params) => {
    const { lnurl, lnurlParams, paymentRequest, paymentRequestAmount, unitOfAccountAmount: unitOfAccountAmountIfDestinationAmountNotSpecified, convertMoneyAmount, sendingWalletDescriptor, destinationSpecifiedMemo, senderSpecifiedMemo, } = params;
    const destinationSpecifiedAmount = lnurlParams.max === lnurlParams.min ? (0, amounts_1.toBtcMoneyAmount)(lnurlParams.max) : undefined;
    const unitOfAccountAmount = destinationSpecifiedAmount || unitOfAccountAmountIfDestinationAmountNotSpecified;
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    let settlementAmount;
    let sendPaymentAndGetFee = {
        canGetFee: false,
        canSendPayment: false,
    };
    if (paymentRequest && paymentRequestAmount) {
        const amountLightningPaymentDetails = (0, exports.createAmountLightningPaymentDetails)({
            paymentRequest,
            paymentRequestAmount,
            convertMoneyAmount,
            sendingWalletDescriptor,
            destinationSpecifiedMemo: memo,
            senderSpecifiedMemo: memo,
        });
        settlementAmount = amountLightningPaymentDetails.settlementAmount;
        if (amountLightningPaymentDetails.canSendPayment) {
            sendPaymentAndGetFee = {
                canSendPayment: true,
                sendPaymentMutation: amountLightningPaymentDetails.sendPaymentMutation,
                canGetFee: true,
                getFee: amountLightningPaymentDetails.getFee,
            };
        }
    }
    else {
        settlementAmount = convertMoneyAmount(unitOfAccountAmount, sendingWalletDescriptor.currency);
    }
    const setAmount = destinationSpecifiedAmount
        ? {
            canSetAmount: false,
            destinationSpecifiedAmount,
        }
        : {
            canSetAmount: true,
            setAmount: (newAmount) => {
                return (0, exports.createLnurlPaymentDetails)(Object.assign(Object.assign({}, params), { paymentRequest: undefined, paymentRequestAmount: undefined, unitOfAccountAmount: newAmount }));
            },
        };
    const setMemo = {
        setMemo: (newMemo) => (0, exports.createLnurlPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo, destinationSpecifiedMemo: newMemo })),
        canSetMemo: true,
    };
    const setConvertMoneyAmount = (newConvertMoneyAmount) => {
        return (0, exports.createLnurlPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount: newConvertMoneyAmount }));
    };
    const setInvoice = ({ paymentRequest, paymentRequestAmount }) => {
        return (0, exports.createLnurlPaymentDetails)(Object.assign(Object.assign({}, params), { paymentRequest,
            paymentRequestAmount }));
    };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createLnurlPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign(Object.assign({ lnurlParams,
        destinationSpecifiedAmount,
        sendingWalletDescriptor,
        unitOfAccountAmount, paymentType: client_1.PaymentType.Lnurl, destination: lnurl, settlementAmount,
        memo, settlementAmountIsEstimated: sendingWalletDescriptor.currency !== generated_1.WalletCurrency.Btc, setSendingWalletDescriptor,
        setInvoice,
        convertMoneyAmount,
        setConvertMoneyAmount }, setAmount), setMemo), sendPaymentAndGetFee);
};
exports.createLnurlPaymentDetails = createLnurlPaymentDetails;
//# sourceMappingURL=lightning.js.map