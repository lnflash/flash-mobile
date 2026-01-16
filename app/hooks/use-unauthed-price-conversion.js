"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUnauthedPriceConversion = void 0;
const react_1 = require("react");
const generated_1 = require("@app/graphql/generated");
const amounts_1 = require("@app/types/amounts");
const crashlytics_1 = require("@react-native-firebase/crashlytics");
const SATS_PER_BTC = 100000000;
const defaultDisplayCurrency = {
    symbol: "$",
    id: "USD",
    fractionDigits: 2,
};
const useUnauthedPriceConversion = () => {
    const { data } = (0, generated_1.useRealtimePriceUnauthedQuery)({
        fetchPolicy: "cache-and-network",
        variables: { currency: defaultDisplayCurrency.id },
    });
    const displayCurrency = defaultDisplayCurrency.id;
    let displayCurrencyPerSat = NaN;
    let displayCurrencyPerCent = NaN;
    const realtimePrice = data === null || data === void 0 ? void 0 : data.realtimePrice;
    if (realtimePrice) {
        displayCurrencyPerSat =
            realtimePrice.btcSatPrice.base / 10 ** realtimePrice.btcSatPrice.offset;
        displayCurrencyPerCent =
            realtimePrice.usdCentPrice.base / 10 ** realtimePrice.usdCentPrice.offset;
    }
    const priceOfCurrencyInCurrency = (0, react_1.useMemo)(() => {
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
    }, [displayCurrencyPerSat, displayCurrencyPerCent]);
    const convertMoneyAmount = (0, react_1.useMemo)(() => {
        if (!priceOfCurrencyInCurrency) {
            return undefined;
        }
        return (moneyAmount, toCurrency) => {
            // If the money amount is already the correct currency, return it
            if ((0, amounts_1.moneyAmountIsCurrencyType)(moneyAmount, toCurrency)) {
                return moneyAmount;
            }
            let amount = Math.round(moneyAmount.amount * priceOfCurrencyInCurrency(moneyAmount.currency, toCurrency));
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
exports.useUnauthedPriceConversion = useUnauthedPriceConversion;
//# sourceMappingURL=use-unauthed-price-conversion.js.map