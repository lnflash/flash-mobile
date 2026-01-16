"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionDate = exports.outputRelativeDate = void 0;
const react_1 = __importDefault(require("react"));
const react_native_1 = require("react-native");
const i18n_react_1 = require("@app/i18n/i18n-react");
const outputRelativeDate = (createdAt, locale) => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const durationInSeconds = Math.max(0, Math.floor((Date.now() - createdAt * 1000) / 1000));
    let duration = "";
    if (durationInSeconds < 60) {
        duration = rtf.format(-durationInSeconds, "second");
    }
    else if (durationInSeconds < 3600) {
        duration = rtf.format(-Math.floor(durationInSeconds / 60), "minute");
    }
    else if (durationInSeconds < 86400) {
        duration = rtf.format(-Math.floor(durationInSeconds / 3600), "hour");
    }
    else if (durationInSeconds < 2592000) {
        // 30 days
        duration = rtf.format(-Math.floor(durationInSeconds / 86400), "day");
    }
    else if (durationInSeconds < 31536000) {
        // 365 days
        duration = rtf.format(-Math.floor(durationInSeconds / 2592000), "month");
    }
    else {
        duration = rtf.format(-Math.floor(durationInSeconds / 31536000), "year");
    }
    return duration;
};
exports.outputRelativeDate = outputRelativeDate;
const TransactionDate = ({ createdAt, status, diffDate = false, }) => {
    const { LL, locale } = (0, i18n_react_1.useI18nContext)();
    if (status === "PENDING") {
        return <react_native_1.Text>{LL.common.pending().toUpperCase()}</react_native_1.Text>;
    }
    if (diffDate) {
        return <react_native_1.Text>{(0, exports.outputRelativeDate)(createdAt, locale)}</react_native_1.Text>;
    }
    return (<react_native_1.Text>
      {new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
        }).format(new Date(createdAt * 1000))}
    </react_native_1.Text>);
};
exports.TransactionDate = TransactionDate;
//# sourceMappingURL=transaction-date.js.map