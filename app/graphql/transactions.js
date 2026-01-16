"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDescriptionDisplay = exports.groupTransactionsByDate = void 0;
const getUserTimezoneDate = (date) => {
    const userTimezoneOffset = new Date().getTimezoneOffset() * 60000;
    return new Date(date.getTime() - userTimezoneOffset);
};
const sameDay = (d1, d2) => {
    const date1 = getUserTimezoneDate(new Date(1000 * d1));
    let date2;
    if (typeof d2 === "number") {
        date2 = getUserTimezoneDate(new Date(d2));
    }
    else {
        date2 = getUserTimezoneDate(d2);
    }
    return (date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate());
};
const formatDateByMonthYear = (locale, date) => {
    const parsedDate = typeof date === "number" ? new Date(1000 * date) : new Date(date);
    return parsedDate.toLocaleString(locale, { month: "long", year: "numeric" }); // e.g., "November 2023"
};
const isToday = (tx) => sameDay(tx.createdAt, new Date());
const isYesterday = (tx) => sameDay(tx.createdAt, new Date().setDate(new Date().getDate() - 1));
const groupTransactionsByDate = ({ pendingIncomingTxs, txs, LL, locale, }) => {
    const sections = [];
    const settledOrOutgoingTransactions = txs;
    // const settledOrOutgoingTransactions = txs.filter(
    //   (tx) => tx.status !== TxStatus.Pending || tx.direction === TxDirection.Send,
    // )
    const transactionsByRelativeDate = {};
    for (const tx of pendingIncomingTxs !== null && pendingIncomingTxs !== void 0 ? pendingIncomingTxs : []) {
        if (!transactionsByRelativeDate[LL.common.today()]) {
            transactionsByRelativeDate[LL.common.today()] = [];
        }
        transactionsByRelativeDate[LL.common.today()].push(tx);
    }
    for (const tx of settledOrOutgoingTransactions) {
        let dateString;
        if (isToday(tx)) {
            dateString = LL.common.today();
        }
        else if (isYesterday(tx)) {
            dateString = LL.common.yesterday();
        }
        else {
            dateString = formatDateByMonthYear(locale, tx.createdAt);
        }
        if (!transactionsByRelativeDate[dateString]) {
            transactionsByRelativeDate[dateString] = [];
        }
        transactionsByRelativeDate[dateString].push(tx);
    }
    Object.keys(transactionsByRelativeDate).forEach((key) => {
        sections.push({ title: key, data: transactionsByRelativeDate[key] });
    });
    return sections;
};
exports.groupTransactionsByDate = groupTransactionsByDate;
const getDescriptionDisplay = ({ LL, tx, bankName, showMemo, }) => {
    if (!tx) {
        return "";
    }
    const { memo, direction, settlementVia } = tx;
    if (memo && (!memo.includes("Pay to Flash Wallet User") || showMemo)) {
        return memo;
    }
    const isReceive = direction === "RECEIVE";
    switch (settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.__typename) {
        case "SettlementViaOnChain":
            return "OnChain Payment";
        case "SettlementViaLn":
            if (isReceive) {
                return `Received`;
            }
            return "Sent";
        case "SettlementViaIntraLedger":
            return isReceive
                ? `${LL.common.from()} ${(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.counterPartyUsername) || bankName + " User"}`
                : `${LL.common.to()} ${(settlementVia === null || settlementVia === void 0 ? void 0 : settlementVia.counterPartyUsername) || bankName + " User"}`;
    }
};
exports.getDescriptionDisplay = getDescriptionDisplay;
//# sourceMappingURL=transactions.js.map