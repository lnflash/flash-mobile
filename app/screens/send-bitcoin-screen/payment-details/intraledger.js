"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIntraledgerPaymentDetails = void 0;
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const client_1 = require("@galoymoney/client");
const createIntraledgerPaymentDetails = (params) => {
    const { handle, recipientWalletId, unitOfAccountAmount, convertMoneyAmount, sendingWalletDescriptor, senderSpecifiedMemo, destinationSpecifiedMemo, } = params;
    const memo = destinationSpecifiedMemo || senderSpecifiedMemo;
    const settlementAmount = convertMoneyAmount(unitOfAccountAmount, sendingWalletDescriptor.currency);
    const getFee = (_) => {
        return Promise.resolve({
            amount: (0, amounts_1.toWalletAmount)({
                amount: 0,
                currency: sendingWalletDescriptor.currency,
            }),
        });
    };
    let sendPaymentAndGetFee = {
        canSendPayment: false,
        canGetFee: false,
    };
    if (settlementAmount.amount &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Btc) {
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.intraLedgerPaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        recipientWalletId,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.intraLedgerPaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.intraLedgerPaymentSend.errors,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            sendPaymentMutation,
            canGetFee: true,
            getFee,
        };
    }
    else if (settlementAmount.amount &&
        sendingWalletDescriptor.currency === generated_1.WalletCurrency.Usd) {
        const sendPaymentMutation = async (paymentMutations) => {
            const { data } = await paymentMutations.intraLedgerUsdPaymentSend({
                variables: {
                    input: {
                        walletId: sendingWalletDescriptor.id,
                        recipientWalletId,
                        amount: settlementAmount.amount,
                        memo,
                    },
                },
            });
            return {
                status: data === null || data === void 0 ? void 0 : data.intraLedgerUsdPaymentSend.status,
                errors: data === null || data === void 0 ? void 0 : data.intraLedgerUsdPaymentSend.errors,
            };
        };
        sendPaymentAndGetFee = {
            canSendPayment: true,
            sendPaymentMutation,
            canGetFee: true,
            getFee,
        };
    }
    const setConvertMoneyAmount = (newConvertMoneyAmount) => {
        return (0, exports.createIntraledgerPaymentDetails)(Object.assign(Object.assign({}, params), { convertMoneyAmount: newConvertMoneyAmount }));
    };
    const setMemo = destinationSpecifiedMemo
        ? { canSetMemo: false }
        : {
            setMemo: (newMemo) => (0, exports.createIntraledgerPaymentDetails)(Object.assign(Object.assign({}, params), { senderSpecifiedMemo: newMemo })),
            canSetMemo: true,
        };
    const setAmount = (newUnitOfAccountAmount) => {
        return (0, exports.createIntraledgerPaymentDetails)(Object.assign(Object.assign({}, params), { unitOfAccountAmount: newUnitOfAccountAmount }));
    };
    const setSendingWalletDescriptor = (newSendingWalletDescriptor) => {
        return (0, exports.createIntraledgerPaymentDetails)(Object.assign(Object.assign({}, params), { sendingWalletDescriptor: newSendingWalletDescriptor }));
    };
    return Object.assign(Object.assign({ destination: handle, settlementAmount, settlementAmountIsEstimated: false, unitOfAccountAmount,
        sendingWalletDescriptor,
        memo, paymentType: client_1.PaymentType.Intraledger, setSendingWalletDescriptor,
        convertMoneyAmount,
        setConvertMoneyAmount,
        setAmount, canSetAmount: true }, setMemo), sendPaymentAndGetFee);
};
exports.createIntraledgerPaymentDetails = createIntraledgerPaymentDetails;
//# sourceMappingURL=intraledger.js.map