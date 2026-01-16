"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderAndConvertTransactionsByDate = exports.formatDate = exports.convertToDisplayCurrency = exports.calculateTotalAmount = exports.filterTransactionsByDirection = exports.filterTransactionsByDate = void 0;
const amounts_1 = require("@app/types/amounts");
const date_fns_1 = require("date-fns");
const filterTransactionsByDate = (transactions, from, to) => {
    const selectedFrom = from ? new Date(from) : null;
    const selectedTo = to ? new Date(to) : null;
    return transactions.filter((tx) => {
        const txDate = new Date(tx.createdAt * 1000); // Convert seconds to milliseconds
        return ((!selectedFrom || txDate >= selectedFrom) && (!selectedTo || txDate <= selectedTo));
    });
};
exports.filterTransactionsByDate = filterTransactionsByDate;
const filterTransactionsByDirection = (transactions, direction) => {
    if (!direction)
        return transactions;
    return transactions.filter((tx) => tx.direction === direction);
};
exports.filterTransactionsByDirection = filterTransactionsByDirection;
const calculateTotalAmount = (transactions) => transactions.reduce((sum, tx) => {
    const displayAmount = tx.settlementAmount;
    return sum + (isNaN(displayAmount) ? 0 : displayAmount);
}, 0);
exports.calculateTotalAmount = calculateTotalAmount;
const convertToDisplayCurrency = (totalAmount, convertMoneyAmount) => convertMoneyAmount &&
    convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(totalAmount * 100), amounts_1.DisplayCurrency);
exports.convertToDisplayCurrency = convertToDisplayCurrency;
const formatDate = (date) => (0, date_fns_1.format)(new Date(date), "dd-MMM-yyyy hh:mm a");
exports.formatDate = formatDate;
const orderAndConvertTransactionsByDate = (transactions, convertMoneyAmount) => {
    // Sort the transactions by date (newest first)
    const orderedTransactions = transactions.sort((a, b) => b.createdAt - a.createdAt);
    // Map through the transactions and convert amounts, including the display date
    return orderedTransactions.map((tx) => {
        const displayAmount = tx.settlementAmount;
        const convertedAmount = convertMoneyAmount === null || convertMoneyAmount === void 0 ? void 0 : convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(displayAmount * 100), amounts_1.DisplayCurrency);
        return Object.assign(Object.assign({}, tx), { displayDate: (0, date_fns_1.format)(new Date(tx.createdAt * 1000), "dd-MMM-yyyy hh:mm a"), settlementDisplayAmount: convertedAmount && convertedAmount.currencyCode !== "USD"
                ? (convertedAmount.amount / 100).toFixed(2)
                : tx.settlementDisplayAmount });
    });
};
exports.orderAndConvertTransactionsByDate = orderAndConvertTransactionsByDate;
//# sourceMappingURL=transaction-filters.js.map