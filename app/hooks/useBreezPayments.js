"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPaymentsBreezSDK = void 0;
const react_native_breez_sdk_liquid_1 = require("@breeztech/react-native-breez-sdk-liquid");
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const formatPaymentsBreezSDK = ({ txDetails, convertMoneyAmount, }) => {
    const settlementDisplayAmount = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(txDetails.amountSat), generated_1.WalletCurrency.Usd).amount;
    const settlementDisplayFee = convertMoneyAmount((0, amounts_1.toBtcMoneyAmount)(txDetails.feesSat), generated_1.WalletCurrency.Usd).amount;
    return {
        id: txDetails.txId || "",
        direction: txDetails.paymentType === "receive" ? "RECEIVE" : "SEND",
        status: txDetails.status.toUpperCase(),
        memo: txDetails.details.description,
        settlementAmount: txDetails.amountSat,
        settlementCurrency: "BTC",
        settlementDisplayAmount: (settlementDisplayAmount / 100).toString(),
        settlementDisplayCurrency: "USD",
        settlementVia: {
            __typename: "SettlementViaLn",
            paymentSecret: txDetails.details.type === react_native_breez_sdk_liquid_1.PaymentDetailsVariant.LIGHTNING
                ? txDetails.details.preimage
                : "",
        },
        createdAt: txDetails.timestamp,
        settlementFee: txDetails.feesSat,
        settlementDisplayFee: (settlementDisplayFee / 100).toString(),
        settlementPrice: {
            base: txDetails.amountSat,
            offset: 0,
            currencyUnit: "SAT",
            formattedAmount: "SAT",
            __typename: "PriceOfOneSettlementMinorUnitInDisplayMinorUnit",
        },
        initiationVia: {
            __typename: "InitiationViaLn",
            paymentHash: txDetails.details.type === react_native_breez_sdk_liquid_1.PaymentDetailsVariant.LIGHTNING
                ? txDetails.details.paymentHash || ""
                : "",
        },
        __typename: "Transaction",
    };
};
exports.formatPaymentsBreezSDK = formatPaymentsBreezSDK;
//# sourceMappingURL=useBreezPayments.js.map