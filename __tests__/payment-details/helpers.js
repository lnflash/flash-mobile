"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSendPaymentMocks = exports.createGetFeeMocks = exports.getTestSetSendingWalletDescriptor = exports.getTestSetAmount = exports.getTestSetMemo = exports.expectCannotSendPayment = exports.expectCannotGetFee = exports.expectDestinationSpecifiedMemoCannotSetMemo = exports.expectCannotSetAmount = exports.usdSendingWalletDescriptor = exports.btcSendingWalletDescriptor = exports.testAmount = exports.usdTestAmount = exports.btcTestAmount = exports.zeroAmount = exports.convertMoneyAmountMock = void 0;
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const convertMoneyAmountMock = (amount, currency) => {
    return {
        amount: amount.amount,
        currency,
        currencyCode: currency,
    };
};
exports.convertMoneyAmountMock = convertMoneyAmountMock;
exports.zeroAmount = amounts_1.ZeroBtcMoneyAmount;
exports.btcTestAmount = (0, amounts_1.toBtcMoneyAmount)(1232);
exports.usdTestAmount = (0, amounts_1.toUsdMoneyAmount)(3212);
exports.testAmount = (0, amounts_1.toBtcMoneyAmount)(100);
exports.btcSendingWalletDescriptor = {
    currency: generated_1.WalletCurrency.Btc,
    id: "testwallet",
};
exports.usdSendingWalletDescriptor = {
    currency: generated_1.WalletCurrency.Usd,
    id: "testwallet",
};
const expectCannotSetAmount = (paymentDetails) => {
    expect(paymentDetails.canSetAmount).toBeFalsy();
    expect(paymentDetails.setAmount).toBeUndefined();
};
exports.expectCannotSetAmount = expectCannotSetAmount;
const expectDestinationSpecifiedMemoCannotSetMemo = (paymentDetails, destinationSpecifiedMemo) => {
    expect(paymentDetails.canSetMemo).toBeFalsy();
    expect(paymentDetails.setMemo).toBeUndefined();
    expect(paymentDetails.memo).toEqual(destinationSpecifiedMemo);
};
exports.expectDestinationSpecifiedMemoCannotSetMemo = expectDestinationSpecifiedMemoCannotSetMemo;
const expectCannotGetFee = (paymentDetails) => {
    expect(paymentDetails.canGetFee).toBeFalsy();
    expect(paymentDetails.getFee).toBeUndefined();
};
exports.expectCannotGetFee = expectCannotGetFee;
const expectCannotSendPayment = (paymentDetails) => {
    expect(paymentDetails.canSendPayment).toBeFalsy();
    expect(paymentDetails.sendPaymentMutation).toBeUndefined();
};
exports.expectCannotSendPayment = expectCannotSendPayment;
const getTestSetMemo = () => (params) => {
    const { defaultParams, creatorFunction, spy } = params;
    const senderSpecifiedMemo = "sender memo";
    const paymentDetails = creatorFunction(defaultParams);
    if (!paymentDetails.canSetMemo)
        throw new Error("Memo is unable to be set");
    paymentDetails.setMemo(senderSpecifiedMemo);
    const lastCall = spy.mock.lastCall && spy.mock.lastCall[0];
    expect(lastCall).toEqual(Object.assign(Object.assign({}, defaultParams), { senderSpecifiedMemo }));
};
exports.getTestSetMemo = getTestSetMemo;
const getTestSetAmount = () => (params) => {
    const { defaultParams, creatorFunction, spy } = params;
    const paymentDetails = creatorFunction(defaultParams);
    const unitOfAccountAmount = {
        amount: 100,
        currency: generated_1.WalletCurrency.Btc,
    };
    if (!paymentDetails.canSetAmount)
        throw new Error("Amount is unable to be set");
    paymentDetails.setAmount(unitOfAccountAmount);
    const lastCall = spy.mock.lastCall && spy.mock.lastCall[0];
    expect(lastCall).toEqual(Object.assign(Object.assign({}, defaultParams), { unitOfAccountAmount }));
};
exports.getTestSetAmount = getTestSetAmount;
const getTestSetSendingWalletDescriptor = () => (params) => {
    const { defaultParams, creatorFunction, spy } = params;
    const paymentDetails = creatorFunction(defaultParams);
    const sendingWalletDescriptor = {
        currency: generated_1.WalletCurrency.Btc,
        id: "newtestwallet",
    };
    paymentDetails.setSendingWalletDescriptor(sendingWalletDescriptor);
    const lastCall = spy.mock.lastCall && spy.mock.lastCall[0];
    expect(lastCall).toEqual(Object.assign(Object.assign({}, defaultParams), { sendingWalletDescriptor }));
};
exports.getTestSetSendingWalletDescriptor = getTestSetSendingWalletDescriptor;
const createGetFeeMocks = () => {
    return {
        lnInvoiceFeeProbe: jest.fn(),
        lnUsdInvoiceFeeProbe: jest.fn(),
        lnNoAmountInvoiceFeeProbe: jest.fn(),
        lnNoAmountUsdInvoiceFeeProbe: jest.fn(),
        onChainTxFee: jest.fn(),
        onChainUsdTxFee: jest.fn(),
        onChainUsdTxFeeAsBtcDenominated: jest.fn(),
    };
};
exports.createGetFeeMocks = createGetFeeMocks;
const createSendPaymentMocks = () => {
    return {
        lnInvoicePaymentSend: jest.fn(),
        lnNoAmountInvoicePaymentSend: jest.fn(),
        lnNoAmountUsdInvoicePaymentSend: jest.fn(),
        onChainPaymentSend: jest.fn(),
        onChainUsdPaymentSend: jest.fn(),
        onChainPaymentSendAll: jest.fn(),
        onChainUsdPaymentSendAsBtcDenominated: jest.fn(),
        intraLedgerPaymentSend: jest.fn(),
        intraLedgerUsdPaymentSend: jest.fn(),
    };
};
exports.createSendPaymentMocks = createSendPaymentMocks;
//# sourceMappingURL=helpers.js.map