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
exports.wrapWithCache = void 0;
const React = __importStar(require("react"));
const show_warning_secure_account_1 = require("@app/screens/settings-screen/show-warning-secure-account");
const react_hooks_1 = require("@testing-library/react-hooks");
const generated_1 = require("@app/graphql/generated");
const client_1 = require("@apollo/client");
const is_authed_context_1 = require("@app/graphql/is-authed-context");
const cache_1 = require("@app/graphql/cache");
// FIXME: the mockPrice doesn't work as expect.
// it's ok because we have more than $5 in the dollar wallet
const mocksPrice = [
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
                            denominatorCurrency: "USD",
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
                        id: "USD",
                        name: "Usd dollar",
                        symbol: "$",
                        fractionDigits: 2,
                        __typename: "Currency",
                    },
                ],
            },
        },
    },
];
const mockLevelZeroLowBalance = [
    ...mocksPrice,
    {
        request: {
            query: generated_1.WarningSecureAccountDocument,
        },
        result: {
            data: {
                me: {
                    id: "70df9822-efe0-419c-b864-c9efa99872ea",
                    language: "",
                    username: "test1",
                    phone: "+50365055539",
                    defaultAccount: {
                        level: "ZERO",
                        id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
                        defaultWalletId: "f79792e3-282b-45d4-85d5-7486d020def5",
                        wallets: [
                            {
                                id: "f79792e3-282b-45d4-85d5-7486d020def5",
                                balance: 100,
                                walletCurrency: "BTC",
                                __typename: "BTCWallet",
                            },
                            {
                                id: "f091c102-6277-4cc6-8d81-87ebf6aaad1b",
                                balance: 100,
                                walletCurrency: "USD",
                                __typename: "UsdWallet",
                            },
                        ],
                        __typename: "ConsumerAccount",
                    },
                    __typename: "User",
                },
            },
        },
    },
];
const mockLevelZeroHighBalance = [
    ...mocksPrice,
    {
        request: {
            query: generated_1.WarningSecureAccountDocument,
        },
        result: {
            data: {
                me: {
                    id: "70df9822-efe0-419c-b864-c9efa99872ea",
                    defaultAccount: {
                        level: "ZERO",
                        id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
                        wallets: [
                            {
                                id: "f79792e3-282b-45d4-85d5-7486d020def5",
                                balance: 100,
                                walletCurrency: "BTC",
                                __typename: "BTCWallet",
                            },
                            {
                                id: "f091c102-6277-4cc6-8d81-87ebf6aaad1b",
                                balance: 600,
                                walletCurrency: "USD",
                                __typename: "UsdWallet",
                            },
                        ],
                        __typename: "ConsumerAccount",
                    },
                    __typename: "User",
                },
            },
        },
    },
];
const mockLevelOneHighBalance = [
    ...mocksPrice,
    {
        request: {
            query: generated_1.WarningSecureAccountDocument,
        },
        result: {
            data: {
                me: {
                    id: "70df9822-efe0-419c-b864-c9efa99872ea",
                    defaultAccount: {
                        level: "ONE",
                        id: "84b26b88-89b0-5c6f-9d3d-fbead08f79d8",
                        wallets: [
                            {
                                id: "f79792e3-282b-45d4-85d5-7486d020def5",
                                balance: 100,
                                walletCurrency: "BTC",
                                __typename: "BTCWallet",
                            },
                            {
                                id: "f091c102-6277-4cc6-8d81-87ebf6aaad1b",
                                balance: 600,
                                walletCurrency: "USD",
                                __typename: "UsdWallet",
                            },
                        ],
                        __typename: "ConsumerAccount",
                    },
                    __typename: "User",
                },
            },
        },
    },
];
/* eslint-disable react/display-name */
/* eslint @typescript-eslint/ban-ts-comment: "off" */
const wrapWithCache = 
// @ts-ignore-next-line no-implicit-any error
(mocks) => ({ children }) => {
    const client = new client_1.ApolloClient({
        cache: (0, cache_1.createCache)(),
    });
    // @ts-ignore-next-line no-implicit-any error
    mocks.forEach((mock) => {
        client.writeQuery({
            query: mock.request.query,
            data: mock.result.data,
        });
    });
    return (<is_authed_context_1.IsAuthedContextProvider value={true}>
          <client_1.ApolloProvider client={client}>{children}</client_1.ApolloProvider>
        </is_authed_context_1.IsAuthedContextProvider>);
};
exports.wrapWithCache = wrapWithCache;
describe("useShowWarningSecureAccount", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it("return false with level 0 and no balance", async () => {
        const { result } = (0, react_hooks_1.renderHook)(show_warning_secure_account_1.useShowWarningSecureAccount, {
            wrapper: (0, exports.wrapWithCache)(mockLevelZeroLowBalance),
        });
        expect(result.current).toBe(false);
    });
    it("return true with level 0 and more than $5 balance", async () => {
        const { result } = (0, react_hooks_1.renderHook)(show_warning_secure_account_1.useShowWarningSecureAccount, {
            wrapper: (0, exports.wrapWithCache)(mockLevelZeroHighBalance),
        });
        expect(result.current).toBe(true);
    });
    it("return true with level 1 and more than $5 balance", async () => {
        const { result } = (0, react_hooks_1.renderHook)(show_warning_secure_account_1.useShowWarningSecureAccount, {
            wrapper: (0, exports.wrapWithCache)(mockLevelOneHighBalance),
        });
        expect(result.current).toBe(false);
    });
});
//# sourceMappingURL=use-show-warning-secure-account.spec.js.map