"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const display_currency_screen_1 = require("../../app/screens/settings-screen/display-currency-screen");
const currency = {
    flag: "🇹🇹",
    id: "TTD",
    name: "Trinidad and Tobago Dollar",
    symbol: "TT$",
    fractionDigits: 2,
    __typename: "Currency",
};
const currencies = [
    {
        flag: "🇹🇹",
        id: "TTD",
        name: "Trinidad and Tobago Dollar",
        symbol: "TT$",
        fractionDigits: 2,
        __typename: "Currency",
    },
    {
        flag: "🇹🇷",
        id: "TRY",
        name: "Turkish Lira",
        symbol: "₤",
        fractionDigits: 2,
        __typename: "Currency",
    },
    {
        flag: "🇮🇳",
        id: "INR",
        name: "Indian Rupee",
        symbol: "₹",
        fractionDigits: 2,
        __typename: "Currency",
    },
    {
        flag: "🇺🇸",
        id: "USD",
        name: "US Dollar",
        symbol: "$",
        fractionDigits: 2,
        __typename: "Currency",
    },
];
describe("match-currencies", () => {
    it("wordMatchesCurrency", () => {
        expect((0, display_currency_screen_1.wordMatchesCurrency)("TTD", currency)).toBe(true);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("ttd", currency)).toBe(true);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("dollar", currency)).toBe(true);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("toba", currency)).toBe(true);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("Trini", currency)).toBe(true);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("US", currency)).toBe(false);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("USD", currency)).toBe(false);
        expect((0, display_currency_screen_1.wordMatchesCurrency)("usd", currency)).toBe(false);
    });
    it("getMatchingCurrencies", () => {
        expect((0, display_currency_screen_1.getMatchingCurrencies)("EUR", currencies.slice())).toEqual([]);
        expect((0, display_currency_screen_1.getMatchingCurrencies)("USD", currencies.slice())).toEqual([
            {
                flag: "🇺🇸",
                id: "USD",
                name: "US Dollar",
                symbol: "$",
                fractionDigits: 2,
                __typename: "Currency",
            },
        ]);
        expect((0, display_currency_screen_1.getMatchingCurrencies)("dollar", currencies.slice())).toEqual([
            {
                flag: "🇹🇹",
                id: "TTD",
                name: "Trinidad and Tobago Dollar",
                symbol: "TT$",
                fractionDigits: 2,
                __typename: "Currency",
            },
            {
                flag: "🇺🇸",
                id: "USD",
                name: "US Dollar",
                symbol: "$",
                fractionDigits: 2,
                __typename: "Currency",
            },
        ]);
    });
});
//# sourceMappingURL=match-currencies.spec.js.map