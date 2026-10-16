import { WalletCurrency } from "@app/graphql/generated"
import { DisplayCurrency, toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"
import {
  createConvertMoneyAmount,
  priceOfCurrencyInCurrencyFor,
} from "@app/utils/price-conversion"

// The NGN rates use-price-conversion.spec.ts pins the hook with: $1,000 is
// 4,550,299 sats and 460,434.88 naira.
const RATES = {
  btcSatPrice: { base: 10118784000000, offset: 12 },
  usdCentPrice: { base: 460434879, offset: 6 },
}

const naira = (amount: number) => ({
  amount,
  currency: DisplayCurrency,
  currencyCode: "NGN",
})

describe("priceOfCurrencyInCurrencyFor", () => {
  it("has no table without a usable price", () => {
    expect(priceOfCurrencyInCurrencyFor(undefined)).toBeUndefined()
    expect(priceOfCurrencyInCurrencyFor(null)).toBeUndefined()
    expect(
      priceOfCurrencyInCurrencyFor({
        btcSatPrice: { base: 0, offset: 0 },
        usdCentPrice: RATES.usdCentPrice,
      }),
    ).toBeUndefined()
  })

  it("prices one sat and one cent in display minor units, and each in the other", () => {
    const price = priceOfCurrencyInCurrencyFor(RATES)

    expect(price?.(WalletCurrency.Btc, DisplayCurrency)).toBeCloseTo(10.118784, 9)
    expect(price?.(WalletCurrency.Usd, DisplayCurrency)).toBeCloseTo(460.434879, 9)
    expect(price?.(WalletCurrency.Usdt, WalletCurrency.Usd)).toBe(1)
    expect(price?.(DisplayCurrency, DisplayCurrency)).toBe(1)
  })
})

describe("createConvertMoneyAmount", () => {
  const onDisplayCurrencyMismatch = jest.fn()
  const price = priceOfCurrencyInCurrencyFor(RATES)
  if (!price) throw new Error("no price table")
  const convert = createConvertMoneyAmount({
    priceOfCurrencyInCurrency: price,
    displayCurrency: "NGN",
    onDisplayCurrencyMismatch,
  })

  beforeEach(() => onDisplayCurrencyMismatch.mockClear())

  it("converts as the hook's spec pins it", () => {
    expect(convert(toUsdMoneyAmount(100_000), WalletCurrency.Btc)).toEqual(
      toBtcMoneyAmount(4_550_299),
    )
    expect(convert(toUsdMoneyAmount(100_000), DisplayCurrency).amount).toBeCloseTo(
      46_043_487.9,
      1,
    )
    expect(convert(naira(46_043_488), WalletCurrency.Usd).amount).toBeCloseTo(100_000, 2)
  })

  it("rounds sats to whole sats and leaves cents as they come", () => {
    const sats = convert(naira(1_000), WalletCurrency.Btc)
    const cents = convert(naira(1_000), WalletCurrency.Usd)

    expect(Number.isInteger(sats.amount)).toBe(true)
    expect(Number.isInteger(cents.amount)).toBe(false)
    expect(cents.currencyCode).toBe("USD")
  })

  it("hands back an amount already in the currency as it is", () => {
    const usd = toUsdMoneyAmount(500)

    expect(convert(usd, WalletCurrency.Usd)).toBe(usd)
  })

  it("answers NaN, never a number at the wrong rate, for another display currency", () => {
    const jmd = { amount: 50_000, currency: DisplayCurrency, currencyCode: "JMD" }

    expect(convert(jmd, WalletCurrency.Usd).amount).toBeNaN()
    expect(onDisplayCurrencyMismatch).toHaveBeenCalledWith(jmd)
  })

  it("labels a display amount with the display currency", () => {
    expect(convert(toUsdMoneyAmount(1), DisplayCurrency).currencyCode).toBe("NGN")
  })
})
