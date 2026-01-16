"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_hooks_1 = require("@testing-library/react-hooks");
const mockUseRealtimePriceQuery = jest.fn();
const use_price_conversion_1 = require("@app/hooks/use-price-conversion");
const amounts_1 = require("@app/types/amounts");
jest.mock("@app/graphql/generated", () => {
    return Object.assign(Object.assign({}, jest.requireActual("@app/graphql/generated")), { useRealtimePriceQuery: mockUseRealtimePriceQuery });
});
const mockPriceData = {
    data: {
        __typename: "Query",
        me: {
            id: "f2b1d23f-816c-51db-aea4-4b773cfdf7a7",
            __typename: "User",
            defaultAccount: {
                __typename: "ConsumerAccount",
                id: "f2b1d0bf-816c-51db-aea4-4b773cfdf7a7",
                realtimePrice: {
                    __typename: "RealtimePrice",
                    btcSatPrice: {
                        __typename: "PriceOfOneSatInMinorUnit",
                        base: 10118784000000,
                        offset: 12,
                    },
                    denominatorCurrency: "NGN",
                    id: "f2b1d0bf-816c-51db-aea4-4b773cfdf7a7",
                    timestamp: 1678314952,
                    usdCentPrice: {
                        __typename: "PriceOfOneUsdCentInMinorUnit",
                        base: 460434879,
                        offset: 6,
                    },
                },
            },
        },
    },
};
const oneThousandDollars = (0, amounts_1.toUsdMoneyAmount)(100000); // $1,000
const oneThousandDollarsInSats = (0, amounts_1.toBtcMoneyAmount)(4550299); // 4,550,299 sats
const oneThousandDollarsInNairaMinorUnits = {
    amount: 46043488,
    currency: amounts_1.DisplayCurrency,
    currencyCode: "NGN",
}; // 460,434.88 Naira
const amounts = {
    oneThousandDollars,
    oneThousandDollarsInSats,
    oneThousandDollarsInNairaMinorUnits,
};
describe("usePriceConversion", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it("should return null fields when no price is provided", () => {
        mockUseRealtimePriceQuery.mockReturnValue({ data: undefined });
        const { result } = (0, react_hooks_1.renderHook)(() => (0, use_price_conversion_1.usePriceConversion)());
        expect(result.current).toEqual(expect.objectContaining({
            convertMoneyAmount: undefined,
            usdPerSat: null,
        }));
    });
    describe("convertMoneyAmount", () => {
        mockUseRealtimePriceQuery.mockReturnValue(mockPriceData);
        const { result } = (0, react_hooks_1.renderHook)(() => (0, use_price_conversion_1.usePriceConversion)());
        const convertMoneyAmount = result.current.convertMoneyAmount;
        if (!convertMoneyAmount) {
            throw new Error("convertMoneyAmount is undefined");
        }
        it("should make proper conversions", () => {
            // test all conversions
            for (const fromCurrency of Object.keys(amounts)) {
                for (const toCurrency of Object.keys(amounts)) {
                    const fromAmount = amounts[fromCurrency];
                    const toAmount = amounts[toCurrency];
                    const convertedAmount = convertMoneyAmount(fromAmount, toAmount.currency);
                    // expect amounts to be within .01% of each other due to rounding
                    expect((toAmount.amount - convertedAmount.amount) / convertedAmount.amount).toBeLessThan(0.0001);
                }
            }
        });
        it("should return input if the toCurrency is the same", () => {
            const amountsArray = Object.values(amounts);
            amountsArray.forEach((amount) => {
                expect(convertMoneyAmount(amount, amount.currency)).toBe(amount);
            });
        });
    });
});
//# sourceMappingURL=use-price-conversion.spec.js.map