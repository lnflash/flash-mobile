"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSendPayment = void 0;
const react_1 = require("react");
// gql
const generated_1 = require("@app/graphql/generated");
// hooks
const hooks_1 = require("@app/hooks");
// utils
const utils_1 = require("@app/graphql/utils");
// Breez SDK
const breez_sdk_liquid_1 = require("@app/utils/breez-sdk-liquid");
const useSendPayment = (sendPaymentMutation, paymentDetail, feeRateSatPerVbyte) => {
    const { lnAddressHostname } = (0, hooks_1.useAppConfig)().appConfig.galoyInstance;
    const [intraLedgerPaymentSend, { loading: intraLedgerPaymentSendLoading }] = (0, generated_1.useIntraLedgerPaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [intraLedgerUsdPaymentSend, { loading: intraLedgerUsdPaymentSendLoading }] = (0, generated_1.useIntraLedgerUsdPaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [lnInvoicePaymentSend, { loading: lnInvoicePaymentSendLoading }] = (0, generated_1.useLnInvoicePaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [lnNoAmountInvoicePaymentSend, { loading: lnNoAmountInvoicePaymentSendLoading }] = (0, generated_1.useLnNoAmountInvoicePaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [lnNoAmountUsdInvoicePaymentSend, { loading: lnNoAmountUsdInvoicePaymentSendLoading },] = (0, generated_1.useLnNoAmountUsdInvoicePaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [onChainPaymentSend, { loading: onChainPaymentSendLoading }] = (0, generated_1.useOnChainPaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [onChainPaymentSendAll, { loading: onChainPaymentSendAllLoading }] = (0, generated_1.useOnChainPaymentSendAllMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [onChainUsdPaymentSend, { loading: onChainUsdPaymentSendLoading }] = (0, generated_1.useOnChainUsdPaymentSendMutation)({ refetchQueries: [generated_1.HomeAuthedDocument] });
    const [onChainUsdPaymentSendAsBtcDenominated, { loading: onChainUsdPaymentSendAsBtcDenominatedLoading },] = (0, generated_1.useOnChainUsdPaymentSendAsBtcDenominatedMutation)({
        refetchQueries: [generated_1.HomeAuthedDocument],
    });
    const [hasAttemptedSend, setHasAttemptedSend] = (0, react_1.useState)(false);
    const loading = intraLedgerPaymentSendLoading ||
        intraLedgerUsdPaymentSendLoading ||
        lnInvoicePaymentSendLoading ||
        lnNoAmountInvoicePaymentSendLoading ||
        lnNoAmountUsdInvoicePaymentSendLoading ||
        onChainPaymentSendLoading ||
        onChainPaymentSendAllLoading ||
        onChainUsdPaymentSendLoading ||
        onChainUsdPaymentSendAsBtcDenominatedLoading;
    const sendPayment = (0, react_1.useMemo)(() => {
        return sendPaymentMutation && !hasAttemptedSend
            ? async () => {
                setHasAttemptedSend(true);
                if (paymentDetail && paymentDetail.sendingWalletDescriptor.currency === "BTC") {
                    const { settlementAmount, memo, isSendingMax, destination, paymentType } = paymentDetail;
                    try {
                        if (paymentType === "lightning") {
                            console.log("Starting payLightningBreez");
                            const response = await (0, breez_sdk_liquid_1.payLightningBreez)(destination);
                            console.log("Response payLightningBreez: ", response);
                            return {
                                status: generated_1.PaymentSendResult.Success,
                                errorsMessage: undefined,
                            };
                        }
                        else if (paymentType === "lnurl" || paymentType === "intraledger") {
                            console.log("Starting payLnurlBreez", memo);
                            const updatedDestination = paymentType === "intraledger"
                                ? destination + `@${lnAddressHostname}`
                                : destination;
                            const response = await (0, breez_sdk_liquid_1.payLnurlBreez)(updatedDestination, settlementAmount === null || settlementAmount === void 0 ? void 0 : settlementAmount.amount, "");
                            console.log("Response payLnurlBreez: ", response);
                            return {
                                status: generated_1.PaymentSendResult.Success,
                                errorsMessage: undefined,
                            };
                        }
                        else if (paymentType === "onchain") {
                            console.log("Starting payOnchainBreez");
                            const response = await (0, breez_sdk_liquid_1.payOnchainBreez)(destination, settlementAmount.amount, feeRateSatPerVbyte, isSendingMax);
                            console.log("Response payOnchainBreez: ", response);
                            return {
                                status: generated_1.PaymentSendResult.Success,
                                errorsMessage: undefined,
                            };
                        }
                        else {
                            return {
                                status: generated_1.PaymentSendResult.Failure,
                                errorsMessage: "Wrong invoice type",
                            };
                        }
                    }
                    catch (err) {
                        return {
                            status: generated_1.PaymentSendResult.Failure,
                            errorsMessage: err.message,
                        };
                    }
                }
                else {
                    console.log("Starting sendPaymentMutation using GraphQL");
                    const response = await sendPaymentMutation({
                        intraLedgerPaymentSend,
                        intraLedgerUsdPaymentSend,
                        lnInvoicePaymentSend,
                        lnNoAmountInvoicePaymentSend,
                        lnNoAmountUsdInvoicePaymentSend,
                        onChainPaymentSend,
                        onChainPaymentSendAll,
                        onChainUsdPaymentSend,
                        onChainUsdPaymentSendAsBtcDenominated,
                    });
                    let errorsMessage = undefined;
                    if (response.errors) {
                        errorsMessage = (0, utils_1.getErrorMessages)(response.errors);
                    }
                    if (response.status === generated_1.PaymentSendResult.Failure) {
                        setHasAttemptedSend(false);
                    }
                    return { status: response.status, errorsMessage };
                }
            }
            : undefined;
    }, [
        sendPaymentMutation,
        hasAttemptedSend,
        paymentDetail,
        feeRateSatPerVbyte,
        intraLedgerPaymentSend,
        intraLedgerUsdPaymentSend,
        lnInvoicePaymentSend,
        lnNoAmountInvoicePaymentSend,
        lnNoAmountUsdInvoicePaymentSend,
        onChainPaymentSend,
        onChainPaymentSendAll,
        onChainUsdPaymentSend,
        onChainUsdPaymentSendAsBtcDenominated,
    ]);
    return {
        hasAttemptedSend,
        loading,
        sendPayment,
    };
};
exports.useSendPayment = useSendPayment;
//# sourceMappingURL=use-send-payment.js.map