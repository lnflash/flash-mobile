"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDisplayCurrency = void 0;
const client_1 = require("@apollo/client");
const generated_1 = require("@app/graphql/generated");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const amounts_1 = require("@app/types/amounts");
const react_1 = require("react");
const use_price_conversion_1 = require("./use-price-conversion");
const i18n_react_1 = require("@app/i18n/i18n-react");
(0, client_1.gql) `
  query displayCurrency {
    me {
      id
      defaultAccount {
        id
        displayCurrency
      }
    }
  }

  query currencyList {
    currencyList {
      __typename
      id
      flag
      name
      symbol
      fractionDigits
    }
  }
`;
const usdDisplayCurrency = {
    symbol: "$",
    id: "USD",
    fractionDigits: 2,
};
const defaultDisplayCurrency = usdDisplayCurrency;
const formatCurrencyHelper = ({ amountInMajorUnits, symbol, isApproximate, fractionDigits, withSign = true, currencyCode, }) => {
    const isNegative = Number(amountInMajorUnits) < 0;
    const decimalPlaces = fractionDigits;
    const amountStr = Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
        // FIXME this workaround of using .format and not .formatNumber is
        // because hermes haven't fully implemented Intl.NumberFormat yet
    }).format(Math.abs(Number(amountInMajorUnits)));
    return `${isApproximate ? "~ " : ""}${isNegative && withSign ? "-" : ""}${symbol}${amountStr}${currencyCode ? ` ${currencyCode}` : ""}`;
};
const displayCurrencyHasSignificantMinorUnits = ({ convertMoneyAmount, amountInMajorUnitOrSatsToMoneyAmount, }) => {
    if (!convertMoneyAmount) {
        return true;
    }
    const oneMajorUnitOfDisplayCurrency = amountInMajorUnitOrSatsToMoneyAmount(1, amounts_1.DisplayCurrency);
    const oneUsdCentInDisplayCurrency = convertMoneyAmount((0, amounts_1.toUsdMoneyAmount)(1), amounts_1.DisplayCurrency);
    return (0, amounts_1.lessThan)({
        value: oneUsdCentInDisplayCurrency,
        lessThan: oneMajorUnitOfDisplayCurrency,
    });
};
const useDisplayCurrency = () => {
    const { LL } = (0, i18n_react_1.useI18nContext)();
    const isAuthed = (0, is_authed_context_1.useIsAuthed)();
    const { data: dataCurrencyList } = (0, generated_1.useCurrencyListQuery)({ skip: !isAuthed });
    const { convertMoneyAmount, displayCurrency, toDisplayMoneyAmount } = (0, use_price_conversion_1.usePriceConversion)();
    const displayCurrencyDictionary = (0, react_1.useMemo)(() => {
        const currencyList = (dataCurrencyList === null || dataCurrencyList === void 0 ? void 0 : dataCurrencyList.currencyList) || [];
        return currencyList.reduce((acc, currency) => {
            acc[currency.id] = currency;
            return acc;
        }, {});
    }, [dataCurrencyList === null || dataCurrencyList === void 0 ? void 0 : dataCurrencyList.currencyList]);
    const displayCurrencyInfo = displayCurrencyDictionary[displayCurrency] || defaultDisplayCurrency;
    const moneyAmountToMajorUnitOrSats = (0, react_1.useCallback)((moneyAmount) => {
        switch (moneyAmount.currency) {
            case generated_1.WalletCurrency.Btc:
                return moneyAmount.amount;
            case generated_1.WalletCurrency.Usd:
                return moneyAmount.amount / 100;
            case amounts_1.DisplayCurrency:
                return moneyAmount.amount / 10 ** displayCurrencyInfo.fractionDigits;
        }
    }, [displayCurrencyInfo]);
    const amountInMajorUnitOrSatsToMoneyAmount = (0, react_1.useCallback)((amount, currency) => {
        switch (currency) {
            case generated_1.WalletCurrency.Btc:
                return (0, amounts_1.toBtcMoneyAmount)(Math.round(amount));
            case generated_1.WalletCurrency.Usd:
                return (0, amounts_1.toUsdMoneyAmount)(Math.round(amount * 100));
            case amounts_1.DisplayCurrency:
                return toDisplayMoneyAmount(Math.round(amount * 10 ** displayCurrencyInfo.fractionDigits));
        }
    }, [displayCurrencyInfo, toDisplayMoneyAmount]);
    const displayCurrencyShouldDisplayDecimals = displayCurrencyHasSignificantMinorUnits({
        convertMoneyAmount,
        amountInMajorUnitOrSatsToMoneyAmount,
    });
    const currencyInfo = (0, react_1.useMemo)(() => {
        return {
            [generated_1.WalletCurrency.Usd]: {
                symbol: usdDisplayCurrency.symbol,
                minorUnitToMajorUnitOffset: usdDisplayCurrency.fractionDigits,
                showFractionDigits: true,
                currencyCode: usdDisplayCurrency.id,
            },
            [generated_1.WalletCurrency.Btc]: {
                symbol: "₿",
                minorUnitToMajorUnitOffset: 0,
                showFractionDigits: false,
                currencyCode: "",
            },
            [amounts_1.DisplayCurrency]: {
                symbol: displayCurrencyInfo.symbol,
                minorUnitToMajorUnitOffset: displayCurrencyInfo.fractionDigits,
                showFractionDigits: displayCurrencyInfo.fractionDigits > 0,
                currencyCode: displayCurrencyInfo.id,
            },
        };
    }, [displayCurrencyInfo]);
    const formatCurrency = (0, react_1.useCallback)(({ amountInMajorUnits, currency, withSign, currencyCode, }) => {
        const currencyInfo = displayCurrencyDictionary[currency] || {
            symbol: currency,
            fractionDigits: 2,
        };
        return formatCurrencyHelper({
            amountInMajorUnits,
            symbol: currencyInfo.symbol,
            fractionDigits: currencyInfo.fractionDigits,
            withSign,
            currencyCode,
        });
    }, [displayCurrencyDictionary]);
    const formatMoneyAmount = (0, react_1.useCallback)(({ moneyAmount, noSymbol = false, noSuffix = false, isApproximate = false, }) => {
        const amount = moneyAmountToMajorUnitOrSats(moneyAmount);
        if (Number.isNaN(amount)) {
            return "";
        }
        const { symbol, minorUnitToMajorUnitOffset, showFractionDigits, currencyCode } = currencyInfo[moneyAmount.currency];
        if (moneyAmount.currency === amounts_1.DisplayCurrency &&
            currencyCode !== moneyAmount.currencyCode) {
            // TODO: we should display the correct currency but this requires `showFractionDigits` to come from the backend
            return LL.common.currencySyncIssue();
        }
        return formatCurrencyHelper({
            amountInMajorUnits: amount,
            isApproximate,
            symbol: noSymbol ? "" : symbol,
            fractionDigits: showFractionDigits ? minorUnitToMajorUnitOffset : 0,
            currencyCode: moneyAmount.currency === generated_1.WalletCurrency.Btc && !noSuffix
                ? currencyCode
                : undefined,
        });
    }, [currencyInfo, moneyAmountToMajorUnitOrSats, LL]);
    const getSecondaryAmountIfCurrencyIsDifferent = (0, react_1.useCallback)(({ primaryAmount, displayAmount, walletAmount, }) => {
        // if the display currency is the same as the wallet amount currency, we don't need to show the secondary amount (example: USD display currency with USD wallet amount)
        if (walletAmount.currency === displayAmount.currencyCode) {
            return undefined;
        }
        if (primaryAmount.currency === amounts_1.DisplayCurrency) {
            return walletAmount;
        }
        return displayAmount;
    }, []);
    const formatDisplayAndWalletAmount = (0, react_1.useCallback)(({ primaryAmount, displayAmount, walletAmount, }) => {
        // if the primary amount is not provided, we use the display amount as the primary amount by default
        const primaryAmountWithDefault = primaryAmount || displayAmount;
        const secondaryAmount = getSecondaryAmountIfCurrencyIsDifferent({
            primaryAmount: primaryAmountWithDefault,
            displayAmount,
            walletAmount,
        });
        if (secondaryAmount) {
            return `${formatMoneyAmount({
                moneyAmount: primaryAmountWithDefault,
            })} (${formatMoneyAmount({
                moneyAmount: secondaryAmount,
            })})`;
        }
        return formatMoneyAmount({ moneyAmount: primaryAmountWithDefault });
    }, [getSecondaryAmountIfCurrencyIsDifferent, formatMoneyAmount]);
    const moneyAmountToDisplayCurrencyString = (0, react_1.useCallback)(({ moneyAmount, isApproximate, }) => {
        if (!convertMoneyAmount) {
            return undefined;
        }
        return formatMoneyAmount({
            moneyAmount: convertMoneyAmount(moneyAmount, amounts_1.DisplayCurrency),
            isApproximate,
        });
    }, [convertMoneyAmount, formatMoneyAmount]);
    return {
        fractionDigits: displayCurrencyInfo.fractionDigits,
        fiatSymbol: displayCurrencyInfo.symbol,
        displayCurrency,
        formatMoneyAmount,
        getSecondaryAmountIfCurrencyIsDifferent,
        formatDisplayAndWalletAmount,
        moneyAmountToDisplayCurrencyString,
        // TODO: remove export. we should only accept MoneyAmount instead of number as input
        // for exported functions for consistency
        displayCurrencyShouldDisplayDecimals: displayCurrencyInfo.fractionDigits > 0,
        currencyInfo,
        moneyAmountToMajorUnitOrSats,
        zeroDisplayAmount: toDisplayMoneyAmount(0),
        formatCurrency,
    };
};
exports.useDisplayCurrency = useDisplayCurrency;
//# sourceMappingURL=use-display-currency.js.map