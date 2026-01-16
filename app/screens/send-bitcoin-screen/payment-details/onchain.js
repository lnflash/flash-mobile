"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAmountOnchainPaymentDetails = exports.createNoAmountOnchainPaymentDetails = void 0;
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const client_1 = require("@galoymoney/client");
const createNoAmountOnchainPaymentDetails = (params) => {
    const { convertMoneyAmount, sendingWalletDescriptor, destinationSpecifiedMemo, unitOfAccountAmount, senderSpecifiedMemo, isSendingMax, address, } = params;
    const settlementAmount = convertMoneyAmount(unitOfAccountAmount, sendingWalletDescriptor.currency);
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    let sendPaymentAndGetFee = {
        canSendPayment: false,
        canGetFee: false,
    };
    if (isSendingMax) {
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.onChainPaymentSendAll({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.onChainPaymentSendAll.status,
                errors: data === null || data === void 0 ? void 0 : data.onChainPaymentSendAll.errors,
            };
        };
        const getFee = async (getFeeFns) => {
            if (sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
                const { data } = await getFeeFns.onChainTxFee({
                    variables: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                    },
                });
                const rawAmount = data === null || data === void 0 ? void 0 : data.onChainTxFee.amount;
                const amount = typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
                    ? (0, amounts_1.toWalletAmount)({
                        amount: rawAmount,
                        currency: sendingWalletDescriptor.currency,
                    })
                    : rawAmount;
                return {
                    amount,
                };
            }
            else if (sendingWalletDescriptor.currency === generated_1.WalletCurrency.Usd) {
                const { data } = await getFeeFns.onChainUsdTxFee({
                    variables: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                    },
                });
                const rawAmount = data === null || data === void 0 ? void 0 : data.onChainUsdTxFee.amount;
                const amount = typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
                    ? (0, amounts_1.toWalletAmount)({
                        amount: rawAmount,
                        currency: sendingWalletDescriptor.currency,
                    })
                    : rawAmount;
                return {
                    amount,
                };
            }
            return { amount: null };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            sendPaymentMutation,
            getFee,
        };
    }
    else if (settlementAmount.amount &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.onChainPaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.onChainPaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.onChainPaymentSend.errors,
            };
        };
        const getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.onChainTxFee({
                variables: {
                    walletId: sendingWalletDescriptor.id,
                    address,
                    amount: settlementAmount.amount,
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.onChainTxFee.amount;
            const amount = typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            sendPaymentMutation,
            getFee,
        };
    }
    else if (settlementAmount.amount &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Usd) {
        let sendPaymentMutation;
        let getFee;
        if (settlementAmount.currency === generated_1.WalletCurrency.Usd) {
            sendPaymentMutation = async (paymentMutations) => {
                const { data } = await paymentMutations.onChainUsdPaymentSend({
                    variables: {
                        input: {
                            walletId: sendingWalletDescriptor.id,
                            address,
                            amount: settlementAmount.amount,
                        },
                    },
                });
                return {
                    status: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSend.status,
                    errors: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSend.errors,
                };
            };
            getFee = async (getFeeFns) => {
                const { data } = await getFeeFns.onChainUsdTxFee({
                    variables: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                    },
                });
                const rawAmount = data === null || data === void 0 ? void 0 : data.onChainUsdTxFee.amount;
                const amount = typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
                    ? (0, amounts_1.toWalletAmount)({
                        amount: rawAmount,
                        currency: sendingWalletDescriptor.currency,
                    })
                    : rawAmount;
                return {
                    amount,
                };
            };
        }
        else {
            sendPaymentMutation = async (paymentMutations) => {
                const { data } = await paymentMutations.onChainUsdPaymentSendAsBtcDenominated({
                    variables: {
                        input: {
                            walletId: sendingWalletDescriptor.id,
                            address,
                            amount: settlementAmount.amount,
                        },
                    },
                });
                return {
                    status: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSendAsBtcDenominated.status,
                    errors: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSendAsBtcDenominated.errors,
                };
            };
            getFee = async (getFeeFns) => {
                const { data } = await getFeeFns.onChainUsdTxFeeAsBtcDenominated({
                    variables: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                    },
                });
                const rawAmount = data === null || data === void 0 ? void 0 : data.onChainUsdTxFeeAsBtcDenominated.amount;
                const amount = typeof rawAmount === "number" // FIXME: this branch is never taken? rawAmount is type number | undefined
                    ? (0, amounts_1.toWalletAmount)({
                        amount: rawAmount,
                        currency: sendingWalletDescriptor.currency,
                    })
                    : rawAmount;
                return {
                    amount,
                };
            };
        }
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            sendPaymentMutation,
            getFee,
        };
    }
    const setAmount = (newUnitOfAccountAmount, sendMax = false) => {
        return (0, exports.createNoAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { isSendingMax: sendMax, unitOfAccountAmount: newUnitOfAccountAmount }));
    };
    const setMemo = destinationSpecifiedMemo
        ? { canSetMemo: false }
        : {
            setMemo: (newMemo) => (0, exports.createNoAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo })),
            canSetMemo: true,
        };
    const setConvertMoneyAmount = (newConvertMoneyAmount) => {
        return (0, exports.createNoAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount: newConvertMoneyAmount }));
    };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createNoAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign(Object.assign(Object.assign({ destination: address, settlementAmount, settlementAmountIsEstimated: sendingWalletDescriptor.currency !== generated_1.WalletCurrency.Btc, unitOfAccountAmount,
        sendingWalletDescriptor,
        memo, paymentType: client_1.PaymentType.Onchain, setSendingWalletDescriptor,
        convertMoneyAmount,
        setConvertMoneyAmount }, setMemo), { setAmount, canSetAmount: true }), sendPaymentAndGetFee), { canSendMax: true, isSendingMax });
};
exports.createNoAmountOnchainPaymentDetails = createNoAmountOnchainPaymentDetails;
const createAmountOnchainPaymentDetails = (params) => {
    const { destinationSpecifiedAmount, convertMoneyAmount, sendingWalletDescriptor, destinationSpecifiedMemo, senderSpecifiedMemo, address, } = params;
    const settlementAmount = convertMoneyAmount(destinationSpecifiedAmount, sendingWalletDescriptor.currency);
    const unitOfAccountAmount = destinationSpecifiedAmount;
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    let sendPaymentAndGetFee = {
        canSendPayment: false,
        canGetFee: false,
    };
    let sendPaymentMutation;
    let getFee;
    if (sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
        sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.onChainPaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        address,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.onChainPaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.onChainPaymentSend.errors,
            };
        };
        getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.onChainTxFee({
                variables: {
                    walletId: sendingWalletDescriptor.id,
                    address,
                    amount: settlementAmount.amount,
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.onChainTxFee.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            sendPaymentMutation,
            getFee,
        };
    }
    else {
        // sendingWalletDescriptor.currency === WalletCurrency.Usd
        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
        console.log("Destination Specified Amount", destinationSpecifiedAmount);
        console.log("PARAMS:", {
            walletId: sendingWalletDescriptor.id,
            address,
            amount: settlementAmount.amount,
        });
        sendPaymentMutation = async (paymentMutations) => {
            try {
                const { data } = await paymentMutations.onChainUsdPaymentSend({
                    variables: {
                        input: {
                            walletId: sendingWalletDescriptor.id,
                            address,
                            amount: settlementAmount.amount,
                        },
                    },
                });
                console.log("RESPONSE ONCHAIN:", data);
                return {
                    status: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSend.status,
                    errors: data === null || data === void 0 ? void 0 : data.onChainUsdPaymentSend.errors,
                };
            }
            catch (err) {
                console.error("ONCHAIN ERR", err);
            }
            return { status: undefined, errors: undefined };
        };
        getFee = async (getFeeFns) => {
            const { data } = await getFeeFns.onChainUsdTxFee({
                variables: {
                    walletId: sendingWalletDescriptor.id,
                    address,
                    amount: settlementAmount.amount,
                },
            });
            const rawAmount = data === null || data === void 0 ? void 0 : data.onChainUsdTxFee.amount;
            const amount = typeof rawAmount === "number"
                ? (0, amounts_1.toWalletAmount)({
                    amount: rawAmount,
                    currency: sendingWalletDescriptor.currency,
                })
                : rawAmount;
            return {
                amount,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            canGetFee: true,
            sendPaymentMutation,
            getFee,
        };
    }
    const setMemo = destinationSpecifiedMemo
        ? {
            canSetMemo: false,
        }
        : {
            setMemo: (newMemo) => (0, exports.createAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo })),
            canSetMemo: true,
        };
    const setConvertMoneyAmount = (newConvertMoneyAmount) => {
        return (0, exports.createAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount: newConvertMoneyAmount }));
    };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createAmountOnchainPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign(Object.assign({ destination: address, destinationSpecifiedAmount,
        settlementAmount, settlementAmountIsEstimated: sendingWalletDescriptor.currency !== generated_1.WalletCurrency.Btc, unitOfAccountAmount,
        sendingWalletDescriptor,
        setSendingWalletDescriptor, canSetAmount: false, convertMoneyAmount,
        setConvertMoneyAmount }, setMemo), { memo, paymentType: client_1.PaymentType.Onchain }), sendPaymentAndGetFee);
};
exports.createAmountOnchainPaymentDetails = createAmountOnchainPaymentDetails;
//# sourceMappingURL=onchain.js.map