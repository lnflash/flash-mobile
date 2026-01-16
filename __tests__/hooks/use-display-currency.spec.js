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
const react_hooks_1 = require("@testing-library/react-hooks");
const use_display_currency_1 = require("@app/hooks/use-display-currency");
const testing_1 = require("@apollo/client/testing");
const React = __importStar(require("react"));
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const generated_1 = require("@app/graphql/generated");
const mocksNgn = [
    {
        request: {
            query: generated_1.RealtimePriceDocument,
        },
        result: {
            data: {
                me: {
                    __typename: "User",
                    id: "70df9822-efe0-419c-b864-c9efa99872ea",
                    defaultAccount: {
                        __typename: "Account",
                        id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
                        realtimePrice: {
                            btcSatPrice: {
                                base: 24015009766,
                                offset: 12,
                                currencyUnit: "USDCENT",
                                __typename: "PriceOfOneSat",
                            },
                            denominatorCurrency: "NGN",
                            id: "67b6e1d2-04c8-509a-abbd-b1cab08575d5",
                            timestamp: 1677184189,
                            usdCentPrice: {
                                base: 100000000,
                                offset: 6,
                                currencyUnit: "USDCENT",
                                __typename: "PriceOfOneUsdCent",
                            },
                            __typename: "RealtimePrice",
                        },
                    },
                },
            },
        },
    },
    {
        request: {
            query: generated_1.CurrencyListDocument,
        },
        result: {
            data: {
                currencyList: [
                    {
                        flag: "🇳🇬",
                        id: "NGN",
                        name: "Nigerian Naira",
                        symbol: "₦",
                        fractionDigits: 2,
                        __typename: "Currency",
                    },
                ],
            },
        },
    },
];
const mocksJpy = [
    {
        request: {
            query: generated_1.RealtimePriceDocument,
        },
        result: {
            data: {
                me: {
                    __typename: "User",
                    id: "70df9822-efe0-419c-b864-c9efa99872ea",
                    defaultAccount: {
                        __typename: "Account",
                        id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
                        realtimePrice: {
                            btcSatPrice: {
                                base: 24015009766,
                                offset: 12,
                                __typename: "PriceOfOneSat",
                            },
                            denominatorCurrency: "JPY",
                            id: "67b6e1d2-04c8-509a-abbd-b1cab08575d5",
                            timestamp: 1677184189,
                            usdCentPrice: {
                                base: 100000000,
                                offset: 6,
                                __typename: "PriceOfOneUsdCent",
                            },
                            __typename: "RealtimePrice",
                        },
                    },
                },
            },
        },
    },
    {
        request: {
            query: generated_1.CurrencyListDocument,
        },
        result: {
            data: {
                currencyList: [
                    {
                        flag: "",
                        id: "JPY",
                        name: "Japanese Yen",
                        symbol: "¥",
                        fractionDigits: 0,
                        __typename: "Currency",
                    },
                ],
            },
        },
    },
];
/* eslint-disable react/display-name */
/* eslint @typescript-eslint/ban-ts-comment: "off" */
const wrapWithMocks = 
// @ts-ignore-next-line no-implicit-any error
(mocks) => ({ children }) => (<is_authed_context_1.IsAuthedContextProvider value={true}>
          <testing_1.MockedProvider mocks={mocks}>{children}</testing_1.MockedProvider>
        </is_authed_context_1.IsAuthedContextProvider>);
describe("usePriceConversion", () => {
    describe("testing moneyAmountToMajorUnitOrSats", () => {
        it("with 0 digits", async () => {
            const { result, waitForNextUpdate } = (0, react_hooks_1.renderHook)(use_display_currency_1.useDisplayCurrency, {
                wrapper: wrapWithMocks(mocksJpy),
            });
            await waitForNextUpdate();
            const res = result.current.moneyAmountToMajorUnitOrSats({
                amount: 100,
                currency: "DisplayCurrency",
                currencyCode: "JPY",
            });
            expect(res).toBe(100);
        });
        it("with 2 digits", async () => {
            const { result, waitForNextUpdate } = (0, react_hooks_1.renderHook)(use_display_currency_1.useDisplayCurrency, {
                wrapper: wrapWithMocks(mocksNgn),
            });
            await waitForNextUpdate();
            const res = result.current.moneyAmountToMajorUnitOrSats({
                amount: 10,
                currency: "DisplayCurrency",
                currencyCode: "NGN",
            });
            expect(res).toBe(0.1);
        });
    });
    it("unAuthed should return default value", async () => {
        const { result } = (0, react_hooks_1.renderHook)(use_display_currency_1.useDisplayCurrency, {
            wrapper: wrapWithMocks([]),
        });
        expect(result.current).toMatchObject({
            fractionDigits: 2,
            fiatSymbol: "$",
            displayCurrency: "USD",
        });
    });
    it("authed but empty query should return default value", async () => {
        const { result, waitForNextUpdate } = (0, react_hooks_1.renderHook)(use_display_currency_1.useDisplayCurrency, {
            wrapper: wrapWithMocks([]),
        });
        expect(result.current).toMatchObject({
            fractionDigits: 2,
            fiatSymbol: "$",
            displayCurrency: "USD",
        });
        await waitForNextUpdate();
        expect(result.current).toMatchObject({
            fractionDigits: 2,
            fiatSymbol: "$",
            displayCurrency: "USD",
        });
    });
    it("authed should return NGN from mock", async () => {
        const { result, waitFor } = (0, react_hooks_1.renderHook)(use_display_currency_1.useDisplayCurrency, {
            wrapper: wrapWithMocks(mocksNgn),
        });
        expect(result.current).toMatchObject({
            fractionDigits: 2,
            fiatSymbol: "$",
            displayCurrency: "USD",
        });
        // ultimately this is what we want
        // but this is failing in CI
        // await waitForNextUpdate()
        await waitFor(() => {
            return result.current.displayCurrency === "NGN";
        }, {
            timeout: 4000,
        });
        expect(result.current).toMatchObject({
            fractionDigits: 2,
            fiatSymbol: "₦",
            displayCurrency: "NGN",
        });
    });
});
//# sourceMappingURL=use-display-currency.spec.js.map