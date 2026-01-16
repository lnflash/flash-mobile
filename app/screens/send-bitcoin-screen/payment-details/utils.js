"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidAmount = void 0;
const generated_1 = require("@app/graphql/generated");
const index_types_1 = require("./index.types");
const amounts_1 = require("@app/types/amounts");
const client_1 = require("@galoymoney/client");
const isValidAmount = ({ paymentDetail, usdWalletAmount, btcWalletAmount, withdrawalLimits, intraledgerLimits, isFromFlashcard, }) => {
    if (!paymentDetail || !(0, amounts_1.isNonZeroMoneyAmount)(paymentDetail.settlementAmount)) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.NoAmount,
        };
    }
    const settlementAmount = paymentDetail.settlementAmount;
    if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Btc) &&
        (0, amounts_1.greaterThan)({
            value: settlementAmount,
            greaterThan: btcWalletAmount,
        })) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.InsufficientBalance,
            balance: btcWalletAmount,
        };
    }
    if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Usd) &&
        (0, amounts_1.greaterThan)({
            value: settlementAmount,
            greaterThan: usdWalletAmount,
        })) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.InsufficientBalance,
            balance: usdWalletAmount,
        };
    }
    if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Usd) &&
        paymentDetail.paymentType === client_1.PaymentType.Onchain &&
        (0, amounts_1.lessThan)({
            value: settlementAmount,
            lessThan: (0, amounts_1.toUsdMoneyAmount)(200),
        })) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.MinOnChainLimit,
        };
    }
    if ((0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Btc) &&
        paymentDetail.paymentType === client_1.PaymentType.Onchain &&
        (0, amounts_1.lessThan)({
            value: settlementAmount,
            lessThan: (0, amounts_1.toBtcMoneyAmount)(5500),
        })) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.MinOnChainSatLimit,
        };
    }
    // Flashcard-specific minimum validation (100 sats)
    if (isFromFlashcard &&
        (0, amounts_1.moneyAmountIsCurrencyType)(settlementAmount, generated_1.WalletCurrency.Btc) &&
        (0, amounts_1.lessThan)({
            value: settlementAmount,
            lessThan: (0, amounts_1.toBtcMoneyAmount)(100),
        })) {
        return {
            validAmount: false,
            invalidReason: index_types_1.AmountInvalidReason.MinFlashcardLimit,
        };
    }
    const usdAmount = paymentDetail.convertMoneyAmount(paymentDetail.unitOfAccountAmount, generated_1.WalletCurrency.Usd);
    if (paymentDetail.paymentType === client_1.PaymentType.Intraledger) {
        for (const intraledgerLimit of intraledgerLimits || []) {
            const remainingIntraledgerLimit = intraledgerLimit.remainingLimit
                ? (0, amounts_1.toUsdMoneyAmount)(intraledgerLimit.remainingLimit)
                : undefined;
            if (remainingIntraledgerLimit &&
                (0, amounts_1.greaterThan)({
                    value: usdAmount,
                    greaterThan: remainingIntraledgerLimit,
                })) {
                return {
                    validAmount: false,
                    invalidReason: index_types_1.AmountInvalidReason.InsufficientLimit,
                    remainingLimit: remainingIntraledgerLimit,
                    limitType: index_types_1.LimitType.Intraledger,
                };
            }
        }
    }
    else {
        for (const withdrawalLimit of withdrawalLimits || []) {
            const remainingWithdrawalLimit = withdrawalLimit.remainingLimit
                ? (0, amounts_1.toUsdMoneyAmount)(withdrawalLimit.remainingLimit)
                : undefined;
            if (remainingWithdrawalLimit &&
                (0, amounts_1.greaterThan)({
                    value: usdAmount,
                    greaterThan: remainingWithdrawalLimit,
                })) {
                return {
                    validAmount: false,
                    invalidReason: index_types_1.AmountInvalidReason.InsufficientLimit,
                    remainingLimit: remainingWithdrawalLimit,
                    limitType: index_types_1.LimitType.Withdrawal,
                };
            }
        }
    }
    return {
        validAmount: true,
    };
};
exports.isValidAmount = isValidAmount;
//# sourceMappingURL=utils.js.map