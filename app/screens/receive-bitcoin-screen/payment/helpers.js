"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prToDateString = exports.generateFutureLocalTime = exports.secondsToHMS = exports.secondsToH = exports.getDefaultMemo = exports.satsToBTC = exports.getPaymentRequestFullUri = void 0;
const client_1 = require("@galoymoney/client");
const index_types_1 = require("./index.types");
const amounts_1 = require("@app/types/amounts");
const prefixByType = {
    [index_types_1.Invoice.OnChain]: "bitcoin:",
    [index_types_1.Invoice.Lightning]: "lightning:",
    [index_types_1.Invoice.PayCode]: "",
};
const getPaymentRequestFullUri = ({ input, amount, memo, uppercase = false, prefix = true, type = index_types_1.Invoice.OnChain, wallet, convertMoneyAmount, }) => {
    if (type === index_types_1.Invoice.Lightning) {
        return uppercase ? input.toUpperCase() : input;
    }
    else {
        if (wallet === "BTC") {
            return input;
        }
        else {
            return input;
            const uriPrefix = prefix ? prefixByType[type] : "";
            const uri = `${uriPrefix}${input}`;
            const params = new URLSearchParams();
            if (amount && convertMoneyAmount) {
                params.append("amount", `${(0, exports.satsToBTC)(convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(amount), "BTC").amount)}`);
            }
            if (memo) {
                params.append("message", encodeURI(memo));
                return `${uri}?${params.toString()}`;
            }
            return uri + (params.toString() ? "?" + params.toString() : "");
        }
    }
};
exports.getPaymentRequestFullUri = getPaymentRequestFullUri;
const satsToBTC = (satsAmount) => satsAmount / 10 ** 8;
exports.satsToBTC = satsToBTC;
const getDefaultMemo = (bankName) => {
    return `Pay to ${bankName} Wallet user`;
};
exports.getDefaultMemo = getDefaultMemo;
const secondsToH = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const hDisplay = h > 0 ? h + "h" : "";
    return hDisplay;
};
exports.secondsToH = secondsToH;
const secondsToHMS = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const hDisplay = h > 0 ? h + "h" : "";
    const mDisplay = m > 0 ? m + "m" : "";
    const sDisplay = s > 0 ? s + "s" : "";
    return hDisplay + mDisplay + sDisplay;
};
exports.secondsToHMS = secondsToHMS;
const generateFutureLocalTime = (secondsToAdd) => {
    const date = new Date(); // Get current date
    date.setSeconds(date.getSeconds() + secondsToAdd); // Add seconds to the current date
    // Format to local time string
    const hours = date.getHours() % 12 || 12; // Get hours (12 hour format), replace 0 with 12
    const minutes = String(date.getMinutes()).padStart(2, "0"); // Get minutes
    const period = date.getHours() >= 12 ? "PM" : "AM"; // Get AM/PM
    return `${hours}:${minutes}${period}`;
};
exports.generateFutureLocalTime = generateFutureLocalTime;
const prToDateString = (paymentRequest, network) => {
    let dateString;
    try {
        dateString = (0, client_1.decodeInvoiceString)(paymentRequest, network).timeExpireDateString;
    }
    catch (e) {
        console.error(e);
    }
    return dateString;
};
exports.prToDateString = prToDateString;
//# sourceMappingURL=helpers.js.map