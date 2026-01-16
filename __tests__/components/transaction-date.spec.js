"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const React = __importStar(require("react"));
const react_native_1 = require("@testing-library/react-native");
const ts_auto_mock_1 = require("ts-auto-mock");
const transaction_date_1 = require("../../app/components/transaction-date");
const i18n_util_1 = require("../../app/i18n/i18n-util");
jest.mock("@app/i18n/i18n-react", () => ({
    useI18nContext: () => {
        return (0, i18n_util_1.i18nObject)("en");
    },
}));
describe("Display the createdAt date for a transaction", () => {
    it("Displays pending for a pending onchain transaction", () => {
        const mockedTransaction = (0, ts_auto_mock_1.createMock)({
            status: "PENDING",
            createdAt: new Date().getDate(),
        });
        const { queryAllByText } = (0, react_native_1.render)(<transaction_date_1.TransactionDate status={mockedTransaction.status} createdAt={mockedTransaction.createdAt}/>);
        expect(queryAllByText("pending")).not.toBeNull();
    });
    it("Displays friendly date", () => {
        const testTransactionCreatedAtDate = new Date();
        testTransactionCreatedAtDate.setDate(testTransactionCreatedAtDate.getDate() - 1);
        const mockedTransaction = (0, ts_auto_mock_1.createMock)({
            createdAt: Math.floor(testTransactionCreatedAtDate.getTime() / 1000),
        });
        const { queryByText } = (0, react_native_1.render)(<transaction_date_1.TransactionDate status={mockedTransaction.status} createdAt={mockedTransaction.createdAt} diffDate={true}/>);
        const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
        const durationInSeconds = Math.max(0, Math.floor((Date.now() - mockedTransaction.createdAt * 1000) / 1000));
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
        expect(queryByText(duration)).not.toBeNull();
    });
});
//# sourceMappingURL=transaction-date.spec.js.map