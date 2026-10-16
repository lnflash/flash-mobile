import { splitMoneyAmount } from "@app/assistant/registry/actions/shared/split"
import { WalletCurrency } from "@app/graphql/generated"
import {
  DisplayCurrency,
  toBtcMoneyAmount,
  toUsdMoneyAmount,
  toWalletAmount,
} from "@app/types/amounts"

const sum = (shares: { amount: number }[]) =>
  shares.reduce((total, { amount }) => total + amount, 0)

describe("splitMoneyAmount", () => {
  it("splits evenly when it can", () => {
    expect(
      splitMoneyAmount(toUsdMoneyAmount(900), 3).map(({ amount }) => amount),
    ).toEqual([300, 300, 300])
  })

  it("hands the leftover cents out in payee-list order, from index 0", () => {
    // $10.00 three ways: 333 each and one cent over, which goes to the first.
    expect(
      splitMoneyAmount(toUsdMoneyAmount(1000), 3).map(({ amount }) => amount),
    ).toEqual([334, 333, 333])
    // Two cents over among four: the first two get one each.
    expect(
      splitMoneyAmount(toUsdMoneyAmount(1002), 4).map(({ amount }) => amount),
    ).toEqual([251, 251, 250, 250])
  })

  it("always adds up to the total", () => {
    for (const total of [1, 7, 99, 100, 101, 12_345, 1_000_003]) {
      for (const parts of [1, 2, 3, 4, 7, 10]) {
        const shares = splitMoneyAmount(toUsdMoneyAmount(total), parts)
        expect(shares).toHaveLength(parts)
        expect(sum(shares)).toBe(total)
        // No share is more than one minor unit from another.
        const amounts = shares.map(({ amount }) => amount)
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1)
      }
    }
  })

  it("gives the whole total to a single payee", () => {
    expect(splitMoneyAmount(toUsdMoneyAmount(1234), 1)).toEqual([toUsdMoneyAmount(1234)])
  })

  it("leaves the later shares at zero when the total is smaller than the payees", () => {
    // The caller refuses a zero share; the split never invents a cent.
    expect(splitMoneyAmount(toUsdMoneyAmount(2), 3).map(({ amount }) => amount)).toEqual([
      1, 1, 0,
    ])
  })

  it("keeps the currency: USDT, sats and a display currency split in their own units", () => {
    const usdt = toWalletAmount({ amount: 1001, currency: WalletCurrency.Usdt })
    const jmd = { amount: 50_001, currency: DisplayCurrency, currencyCode: "JMD" }

    expect(splitMoneyAmount(usdt, 2)).toEqual([
      { amount: 501, currency: "USDT", currencyCode: "USDT" },
      { amount: 500, currency: "USDT", currencyCode: "USDT" },
    ])
    expect(splitMoneyAmount(toBtcMoneyAmount(10), 4).map(({ amount }) => amount)).toEqual(
      [3, 3, 2, 2],
    )
    expect(splitMoneyAmount(jmd, 2)).toEqual([
      { ...jmd, amount: 25_001 },
      { ...jmd, amount: 25_000 },
    ])
  })

  it("refuses what it cannot split exactly", () => {
    expect(() => splitMoneyAmount(toUsdMoneyAmount(100), 0)).toThrow(RangeError)
    expect(() => splitMoneyAmount(toUsdMoneyAmount(100), 1.5)).toThrow(RangeError)
    expect(() => splitMoneyAmount(toUsdMoneyAmount(10.5), 2)).toThrow(RangeError)
    expect(() => splitMoneyAmount(toUsdMoneyAmount(-4), 2)).toThrow(RangeError)
    expect(() => splitMoneyAmount(toUsdMoneyAmount(NaN), 2)).toThrow(RangeError)
  })
})
