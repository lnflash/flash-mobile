"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNonZeroMoneyAmount = exports.subtractMoneyAmounts = exports.addMoneyAmounts = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThan = exports.lessThanOrEqualTo = exports.createToDisplayAmount = exports.toDisplayAmount = exports.toWalletAmount = exports.toUsdMoneyAmount = exports.toBtcMoneyAmount = exports.ZeroBtcMoneyAmount = exports.ZeroUsdMoneyAmount = exports.moneyAmountIsCurrencyType = exports.DisplayCurrency = void 0;
const generated_1 = require("@app/graphql/generated");
exports.DisplayCurrency = "DisplayCurrency";
const moneyAmountIsCurrencyType = (moneyAmount, currency) => {
    return moneyAmount.currency === currency;
};
exports.moneyAmountIsCurrencyType = moneyAmountIsCurrencyType;
exports.ZeroUsdMoneyAmount = {
    amount: 0,
    currency: generated_1.WalletCurrency.Usd,
    currencyCode: "USD",
};
exports.ZeroBtcMoneyAmount = {
    amount: 0,
    currency: generated_1.WalletCurrency.Btc,
    currencyCode: "BTC",
};
const toBtcMoneyAmount = (amount) => {
    if (amount === undefined) {
        return {
            amount: NaN,
            currency: generated_1.WalletCurrency.Btc,
            currencyCode: "BTC",
        };
    }
    return {
        amount,
        currency: generated_1.WalletCurrency.Btc,
        currencyCode: "BTC",
    };
};
exports.toBtcMoneyAmount = toBtcMoneyAmount;
const toUsdMoneyAmount = (amount) => {
    if (amount === undefined) {
        return {
            amount: NaN,
            currency: generated_1.WalletCurrency.Usd,
            currencyCode: "USD",
        };
    }
    return {
        amount,
        currency: generated_1.WalletCurrency.Usd,
        currencyCode: "USD",
    };
};
exports.toUsdMoneyAmount = toUsdMoneyAmount;
const toWalletAmount = ({ amount, currency, }) => {
    if (amount === undefined) {
        return {
            amount: NaN,
            currency,
            currencyCode: currency,
        };
    }
    return {
        amount,
        currency,
        currencyCode: currency,
    };
};
exports.toWalletAmount = toWalletAmount;
const toDisplayAmount = ({ amount, currencyCode, }) => {
    if (amount === undefined) {
        return {
            amount: NaN,
            currency: exports.DisplayCurrency,
            currencyCode,
        };
    }
    return {
        amount,
        currency: exports.DisplayCurrency,
        currencyCode,
    };
};
exports.toDisplayAmount = toDisplayAmount;
const createToDisplayAmount = (currencyCode) => (amount) => {
    return (0, exports.toDisplayAmount)({ amount, currencyCode });
};
exports.createToDisplayAmount = createToDisplayAmount;
const lessThanOrEqualTo = ({ value, lessThanOrEqualTo, }) => {
    return value.amount <= lessThanOrEqualTo.amount;
};
exports.lessThanOrEqualTo = lessThanOrEqualTo;
const lessThan = ({ value, lessThan, }) => {
    return value.amount < lessThan.amount;
};
exports.lessThan = lessThan;
const greaterThan = ({ value, greaterThan, }) => {
    return value.amount > greaterThan.amount;
};
exports.greaterThan = greaterThan;
const greaterThanOrEqualTo = ({ value, greaterThanOrEqualTo, }) => {
    return value.amount >= greaterThanOrEqualTo.amount;
};
exports.greaterThanOrEqualTo = greaterThanOrEqualTo;
const addMoneyAmounts = ({ a, b, }) => {
    return {
        amount: a.amount + b.amount,
        currency: a.currency,
        currencyCode: a.currencyCode,
    };
};
exports.addMoneyAmounts = addMoneyAmounts;
const subtractMoneyAmounts = ({ a, b, }) => {
    return {
        amount: a.amount - b.amount,
        currency: a.currency,
        currencyCode: a.currencyCode,
    };
};
exports.subtractMoneyAmounts = subtractMoneyAmounts;
const isNonZeroMoneyAmount = (moneyAmount) => {
    return moneyAmount !== undefined && moneyAmount.amount !== 0;
};
exports.isNonZeroMoneyAmount = isNonZeroMoneyAmount;
//# sourceMappingURL=amounts.js.map