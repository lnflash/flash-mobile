"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePriceConversion = exports.SATS_PER_BTC = void 0;
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const amounts_1 = require("@app/types/amounts");
const react_1 = require("react");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
exports.SATS_PER_BTC = 100000000;
const usdDisplayCurrency = {
    symbol: "$",
    id: "USD",
    fractionDigits: 2,
};
const defaultDisplayCurrency = usdDisplayCurrency;
const usePriceConversion = () => {
    var _a, _b, _c, _d, _e;
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data } = (0, generated_1.useRealtimePriceQuery)({ skip: !isAuthed });
    const displayCurrency = ((_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.realtimePrice) === null || _c === void 0 ? void 0 : _c.denominatorCurrency) ||
        defaultDisplayCurrency.id;
    const priceData = (0, react_1.useMemo)(() => {
        var _a, _b;
        const realtimePrice = (_b = (_a = data === null || data === void 0 ? void 0 : data.me) === null || _a === void 0 ? void 0 : _a.defaultAccount) === null || _b === void 0 ? void 0 : _b.realtimePrice;
        if (!realtimePrice) {
            return {
                displayCurrencyPerSat: NaN,
                displayCurrencyPerCent: NaN,
            };
        }
        return {
            displayCurrencyPerSat: realtimePrice.btcSatPrice.base / 10 ** realtimePrice.btcSatPrice.offset,
            displayCurrencyPerCent: realtimePrice.usdCentPrice.base / 10 ** realtimePrice.usdCentPrice.offset,
        };
    }, [(_e = (_d = data === null || data === void 0 ? void 0 : data.me) === null || _d === void 0 ? void 0 : _d.defaultAccount) === null || _e === void 0 ? void 0 : _e.realtimePrice]);
    const priceOfCurrencyInCurrency = (0, react_1.useMemo)(() => {
        const { displayCurrencyPerSat, displayCurrencyPerCent } = priceData;
        if (!displayCurrencyPerSat || !displayCurrencyPerCent) {
            return undefined;
        }
        // has units of denomiatedInCurrency/currency
        return (currency, inCurrency) => {
            const priceOfCurrencyInCurrency = {
                [generated_1.WalletCurrency.Btc]: {
                    [amounts_1.DisplayCurrency]: displayCurrencyPerSat,
                    [generated_1.WalletCurrency.Usd]: displayCurrencyPerSat * (1 / displayCurrencyPerCent),
                    [generated_1.WalletCurrency.Btc]: 1,
                },
                [generated_1.WalletCurrency.Usd]: {
                    [amounts_1.DisplayCurrency]: displayCurrencyPerCent,
                    [generated_1.WalletCurrency.Btc]: displayCurrencyPerCent * (1 / displayCurrencyPerSat),
                    [generated_1.WalletCurrency.Usd]: 1,
                },
                [amounts_1.DisplayCurrency]: {
                    [generated_1.WalletCurrency.Btc]: 1 / displayCurrencyPerSat,
                    [generated_1.WalletCurrency.Usd]: 1 / displayCurrencyPerCent,
                    [amounts_1.DisplayCurrency]: 1,
                },
            };
            return priceOfCurrencyInCurrency[currency][inCurrency];
        };
    }, [priceData]);
    const convertMoneyAmount = (0, react_1.useMemo)(() => {
        if (!priceOfCurrencyInCurrency) {
            return undefined;
        }
        return (moneyAmount, toCurrency) => {
            // If the money amount is already the correct currency, return it
            if ((0, amounts_1.moneyAmountIsCurrencyType)(moneyAmount, toCurrency)) {
                return moneyAmount;
            }
            let amount = moneyAmount.amount * priceOfCurrencyInCurrency(moneyAmount.currency, toCurrency);
            if (toCurrency === "BTC") {
                amount = Math.round(amount);
            }
            if ((0, amounts_1.moneyAmountIsCurrencyType)(moneyAmount, amounts_1.DisplayCurrency) &&
                moneyAmount.currencyCode !== displayCurrency) {
                amount = NaN;
                (0, crashlytics_1.getCrashlytics)().recordError(new Error(`Price conversion is out of sync with display currency. Money amount: ${moneyAmount.currencyCode}, display currency: ${displayCurrency}`));
            }
            return {
                amount,
                currency: toCurrency,
                currencyCode: toCurrency === amounts_1.DisplayCurrency ? displayCurrency : toCurrency,
            };
        };
    }, [priceOfCurrencyInCurrency, displayCurrency]);
    return {
        convertMoneyAmount,
        displayCurrency,
        toDisplayMoneyAmount: (0, amounts_1.createToDisplayAmount)(displayCurrency),
        usdPerSat: priceOfCurrencyInCurrency
            ? (priceOfCurrencyInCurrency(generated_1.WalletCurrency.Btc, generated_1.WalletCurrency.Usd) / 100).toFixed(8)
            : null,
    };
};
exports.usePriceConversion = usePriceConversion;
//# sourceMappingURL=use-price-conversion.js.map