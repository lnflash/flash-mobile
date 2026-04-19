/**
 * Tests for use-price-conversion.ts -> convertMoneyAmount
 *
 * ENG-315 / Phase 0 hotfix: round ALL currency conversions, not just BTC.
 */

import { renderHook } from "@testing-library/react-hooks"

jest.mock("@app/graphql/is-authed-context", () => ({
  useIsAuthed: () => true,
}))

jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: () => ({
    recordError: jest.fn(),
  }),
}))

const OFFSET = 12
const SCALE = 10 ** OFFSET

const mockRealtimePrice = {
  id: "rtp-test",
  timestamp: Math.floor(Date.now() / 1000),
  btcSatPrice: {
    base: Math.round(9.45 * SCALE),
    offset: OFFSET,
    currencyUnit: "MINORUNIT",
    __typename: "PriceOfOneSatInMinorUnit",
  },
  usdCentPrice: {
    base: Math.round(157.5 * SCALE),
    offset: OFFSET,
    currencyUnit: "MINORUNIT",
    __typename: "PriceOfOneUsdCentInMinorUnit",
  },
  denominatorCurrency: "JMD",
  denominatorCurrencyDetails: {
    id: "JMD",
    symbol: "J$",
    name: "Jamaican Dollar",
    flag: "🇯🇲",
    fractionDigits: 2,
    __typename: "Currency",
  },
  __typename: "RealtimePrice",
}

jest.mock("@app/graphql/generated", () => {
  const actual = jest.requireActual("@app/graphql/generated")
  return {
    ...actual,
    useRealtimePriceQuery: () => ({
      data: {
        me: {
          id: "test-user",
          defaultAccount: {
            id: "test-account",
            realtimePrice: mockRealtimePrice,
            __typename: "ConsumerAccount",
          },
          __typename: "User",
        },
      },
      loading: false,
      error: undefined,
    }),
  }
})

import { usePriceConversion } from "@app/hooks/use-price-conversion"
import {
  DisplayCurrency,
  MoneyAmount,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
} from "@app/types/amounts"

const renderConverter = () => {
  const { result } = renderHook(() => usePriceConversion())
  const convert = result.current.convertMoneyAmount
  if (!convert) {
    throw new Error("convertMoneyAmount was null, check the realtime price mock")
  }
  return convert
}

const toJmdMinor = (minorUnits: number): MoneyAmount<typeof DisplayCurrency> => ({
  amount: minorUnits,
  currency: DisplayCurrency,
  currencyCode: "JMD",
})

describe("usePriceConversion / convertMoneyAmount", () => {
  it("USD -> BTC -> USD round-trip lands within 1 cent of the original", () => {
    const convert = renderConverter()
    const start = toUsdMoneyAmount(100)
    const inBtc = convert(start, "BTC")
    const roundTrip = convert(inBtc, "USD")

    expect(Number.isInteger(inBtc.amount)).toBe(true)
    expect(Number.isInteger(roundTrip.amount)).toBe(true)
    expect(Math.abs(roundTrip.amount - 100)).toBeLessThanOrEqual(1)
  })

  it("JMD -> BTC -> JMD round-trip lands within 1 minor unit", () => {
    const convert = renderConverter()
    const start = toJmdMinor(15750)
    const inBtc = convert(start, "BTC")
    const roundTrip = convert(inBtc, DisplayCurrency)

    expect(Number.isInteger(inBtc.amount)).toBe(true)
    expect(Number.isInteger(roundTrip.amount)).toBe(true)
    expect(Math.abs(roundTrip.amount - 15750)).toBeLessThanOrEqual(1)
  })

  it("JMD -> USD -> JMD round-trip lands within 2 minor units", () => {
    const convert = renderConverter()
    const start = toJmdMinor(12345)
    const inUsd = convert(start, "USD")
    const roundTrip = convert(inUsd, DisplayCurrency)

    expect(Number.isInteger(inUsd.amount)).toBe(true)
    expect(Number.isInteger(roundTrip.amount)).toBe(true)
    expect(Math.abs(roundTrip.amount - 12345)).toBeLessThanOrEqual(2)
  })

  it("amount 0 converts to 0 in every direction", () => {
    const convert = renderConverter()

    const zeroUsd = toUsdMoneyAmount(0)
    expect(convert(zeroUsd, "BTC").amount).toBe(0)
    expect(convert(zeroUsd, DisplayCurrency).amount).toBe(0)
    const zeroBtc = toBtcMoneyAmount(0)
    expect(convert(zeroBtc, "USD").amount).toBe(0)
    expect(convert(zeroBtc, DisplayCurrency).amount).toBe(0)

    const zeroJmd = toJmdMinor(0)
    expect(convert(zeroJmd, "BTC").amount).toBe(0)
    expect(convert(zeroJmd, "USD").amount).toBe(0)
  })

  it("amount 1 stays integer after conversion", () => {
    const convert = renderConverter()

    const oneSat = toBtcMoneyAmount(1)
    const oneSatInJmd = convert(oneSat, DisplayCurrency)
    expect(oneSatInJmd.amount).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(oneSatInJmd.amount)).toBe(true)

    const oneCent = toUsdMoneyAmount(1)
    const oneCentInJmd = convert(oneCent, DisplayCurrency)
    expect(oneCentInJmd.amount).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(oneCentInJmd.amount)).toBe(true)

    const oneJmd = toJmdMinor(1)
    const oneJmdInBtc = convert(oneJmd, "BTC")
    expect(Number.isInteger(oneJmdInBtc.amount)).toBe(true)
  })

  it("very large amounts do not overflow and stay integers", () => {
    const convert = renderConverter()
    // const oneBtc = toBtcMoneyAmount(100_000_000)
    const sats = toBtcMoneyAmount(100_000_001)
    const inUsd = convert(sats, "USD")
    expect(Number.isInteger(inUsd.amount)).toBe(true)
    expect(inUsd.amount).toBe(6_000_000)

    const inJmd = convert(sats, DisplayCurrency)
    expect(Number.isInteger(inJmd.amount)).toBe(true)
    expect(inJmd.amount).toBe(945_000_009)
  })

  it("ENG-316 / #282 repro: converter output is always an integer", () => {
    const convert = renderConverter()

    const oneCent = toUsdMoneyAmount(1)
    const centInJmd = convert(oneCent, DisplayCurrency)
    expect(centInJmd.amount).toBe(Math.round(centInJmd.amount))

    const displayAmt = toJmdMinor(12345)
    const displayInUsd = convert(displayAmt, "USD")
    expect(displayInUsd.amount).toBe(Math.round(displayInUsd.amount))

    const displayInBtc = convert(displayAmt, "BTC")
    expect(displayInBtc.amount).toBe(Math.round(displayInBtc.amount))
  })
})
