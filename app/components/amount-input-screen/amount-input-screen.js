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
exports.AmountInputScreen = void 0;
const React = __importStar(require("react"));
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const i18n_react_1 = require("@app/i18n/i18n-react");
const amounts_1 = require("@app/types/amounts");
const react_1 = require("react");
const amount_input_screen_ui_1 = require("./amount-input-screen-ui");
const number_pad_reducer_1 = require("./number-pad-reducer");
const formatNumberPadNumber = (numberPadNumber) => {
    const { majorAmount, minorAmount, hasDecimal } = numberPadNumber;
    if (!majorAmount && !minorAmount && !hasDecimal) {
        return "";
    }
    const formattedMajorAmount = Number(majorAmount).toLocaleString();
    if (hasDecimal) {
        return `${formattedMajorAmount}.${minorAmount}`;
    }
    return formattedMajorAmount;
};
const numberPadNumberToMoneyAmount = ({ numberPadNumber, currency, currencyInfo, }) => {
    const { majorAmount, minorAmount } = numberPadNumber;
    const { minorUnitToMajorUnitOffset, currencyCode } = currencyInfo[currency];
    const majorAmountInMinorUnit = Math.pow(10, minorUnitToMajorUnitOffset) * Number(majorAmount);
    // if minorUnitToMajorUnitOffset is 2, slice 234354 to 23
    const slicedMinorAmount = minorAmount.slice(0, minorUnitToMajorUnitOffset);
    // if minorAmount is 4 and minorUnitToMajorUnitOffset is 2, then missing zeros is 1
    const minorAmountMissingZeros = minorUnitToMajorUnitOffset - slicedMinorAmount.length;
    const amount = majorAmountInMinorUnit + Number(minorAmount) * Math.pow(10, minorAmountMissingZeros);
    return {
        amount,
        currency,
        currencyCode,
    };
};
const moneyAmountToNumberPadReducerState = ({ moneyAmount, currencyInfo, }) => {
    const amountString = moneyAmount.amount.toString();
    const { minorUnitToMajorUnitOffset, showFractionDigits } = currencyInfo[moneyAmount.currency];
    let numberPadNumber;
    if (amountString === "0") {
        numberPadNumber = {
            majorAmount: "",
            minorAmount: "",
            hasDecimal: false,
        };
    }
    else if (amountString.length <= minorUnitToMajorUnitOffset) {
        numberPadNumber = {
            majorAmount: "0",
            minorAmount: showFractionDigits
                ? amountString.padStart(minorUnitToMajorUnitOffset, "0")
                : "",
            hasDecimal: showFractionDigits,
        };
    }
    else {
        numberPadNumber = {
            majorAmount: amountString.slice(0, amountString.length - minorUnitToMajorUnitOffset),
            minorAmount: showFractionDigits
                ? amountString.slice(amountString.length - minorUnitToMajorUnitOffset)
                : "",
            hasDecimal: showFractionDigits && minorUnitToMajorUnitOffset > 0,
        };
    }
    return {
        numberPadNumber,
        numberOfDecimalsAllowed: showFractionDigits ? minorUnitToMajorUnitOffset : 0,
        currency: moneyAmount.currency,
    };
};
const AmountInputScreen = ({ goBack, initialAmount, setAmount, walletCurrency, convertMoneyAmount, maxAmount, minAmount, title, }) => {
    const { currencyInfo, getSecondaryAmountIfCurrencyIsDifferent, formatMoneyAmount, zeroDisplayAmount, } = (0, use_display_currency_1.useDisplayCurrency)();
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const [numberPadState, dispatchNumberPadAction] = (0, react_1.useReducer)(number_pad_reducer_1.numberPadReducer, moneyAmountToNumberPadReducerState({
        moneyAmount: initialAmount || zeroDisplayAmount,
        currencyInfo,
    }));
    const newPrimaryAmount = numberPadNumberToMoneyAmount({
        numberPadNumber: numberPadState.numberPadNumber,
        currency: numberPadState.currency,
        currencyInfo,
    });
    const secondaryNewAmount = getSecondaryAmountIfCurrencyIsDifferent({
        primaryAmount: newPrimaryAmount,
        walletAmount: convertMoneyAmount(newPrimaryAmount, walletCurrency),
        displayAmount: convertMoneyAmount(newPrimaryAmount, amounts_1.DisplayCurrency),
    });
    const onKeyPress = (key) => {
        dispatchNumberPadAction({
            action: number_pad_reducer_1.NumberPadReducerActionType.HandleKeyPress,
            payload: {
                key,
            },
        });
    };
    const onClear = () => {
        dispatchNumberPadAction({
            action: number_pad_reducer_1.NumberPadReducerActionType.ClearAmount,
        });
    };
    const setNumberPadAmount = (0, react_1.useCallback)((amount) => {
        dispatchNumberPadAction({
            action: number_pad_reducer_1.NumberPadReducerActionType.SetAmount,
            payload: moneyAmountToNumberPadReducerState({
                moneyAmount: amount,
                currencyInfo,
            }),
        });
    }, [currencyInfo]);
    const onToggleCurrency = secondaryNewAmount &&
        (() => {
            setNumberPadAmount(Object.assign(Object.assign({}, secondaryNewAmount), { amount: Math.round(secondaryNewAmount.amount) }));
        });
    (0, react_1.useEffect)(() => {
        if (initialAmount) {
            setNumberPadAmount(initialAmount);
        }
    }, [initialAmount, setNumberPadAmount]);
    let errorMessage = "";
    const maxAmountInPrimaryCurrency = maxAmount && convertMoneyAmount(maxAmount, newPrimaryAmount.currency);
    const minAmountInPrimaryCurrency = minAmount && convertMoneyAmount(minAmount, newPrimaryAmount.currency);
    if (maxAmountInPrimaryCurrency &&
        (0, amounts_1.greaterThan)({
            value: convertMoneyAmount(newPrimaryAmount, maxAmountInPrimaryCurrency.currency),
            greaterThan: maxAmountInPrimaryCurrency,
        })) {
        errorMessage = LL.AmountInputScreen.maxAmountExceeded({
            maxAmount: formatMoneyAmount({ moneyAmount: maxAmountInPrimaryCurrency }),
        });
    }
    else if (minAmountInPrimaryCurrency &&
        (0, amounts_1.lessThan)({
            value: convertMoneyAmount(newPrimaryAmount, minAmountInPrimaryCurrency.currency),
            lessThan: minAmountInPrimaryCurrency,
        })) {
        errorMessage = LL.AmountInputScreen.minAmountNotMet({
            minAmount: formatMoneyAmount({ moneyAmount: minAmountInPrimaryCurrency }),
        });
    }
    const primaryCurrencyInfo = currencyInfo[newPrimaryAmount.currency];
    const secondaryCurrencyInfo = secondaryNewAmount && currencyInfo[secondaryNewAmount.currency];
    return (<amount_input_screen_ui_1.AmountInputScreenUI walletCurrency={walletCurrency} primaryCurrencyCode={primaryCurrencyInfo.currencyCode} primaryCurrencyFormattedAmount={formatNumberPadNumber(numberPadState.numberPadNumber)} primaryCurrencySymbol={primaryCurrencyInfo.symbol} secondaryCurrencyCode={secondaryCurrencyInfo === null || secondaryCurrencyInfo === void 0 ? void 0 : secondaryCurrencyInfo.currencyCode} secondaryCurrencyFormattedAmount={secondaryNewAmount &&
            formatMoneyAmount({
                moneyAmount: secondaryNewAmount,
                noSuffix: true,
                noSymbol: true,
            })} secondaryCurrencySymbol={secondaryCurrencyInfo === null || secondaryCurrencyInfo === void 0 ? void 0 : secondaryCurrencyInfo.symbol} errorMessage={errorMessage} onKeyPress={onKeyPress} onClearAmount={onClear} onToggleCurrency={onToggleCurrency} setAmountDisabled={Boolean(errorMessage)} onSetAmountPress={setAmount && (() => setAmount(newPrimaryAmount))} goBack={goBack} title={title}/>);
};
exports.AmountInputScreen = AmountInputScreen;
//# sourceMappingURL=amount-input-screen.js.map