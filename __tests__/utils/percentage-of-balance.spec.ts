import {
  percentageOfBalance,
  toSpendableBalance,
  toUsdMoneyAmount,
} from "@app/types/amounts"

// The API can report USD cash-wallet balances in fractional cents, e.g.
// 109.9346 = $1.099346 held at IBEX (flash#480). The percentage quick-buttons
// (conversion 25/50/75 + top chip, cashout 50/100) previously Math.round-ed
// the raw balance, so 100% of 109.9346 filled 110¢ — more than is spendable
// (#696). Every quick-set amount must be a whole minor unit <= the spendable
// balance: floor the balance first, then floor the percentage result.
describe("percentageOfBalance", () => {
  it("fills the floored spendable balance at 100%, not the rounded-up raw one", () => {
    // Math.round(109.9346) = 110 was the bug: 110¢ > 109.9346¢ held
    expect(percentageOfBalance(109.9346, 100)).toEqual(109)
  })

  it("floors partial percentages instead of rounding", () => {
    // Math.round(109.9346 * 0.5) = 55; 50% of the 109¢ spendable is 54
    expect(percentageOfBalance(109.9346, 50)).toEqual(54)
    expect(percentageOfBalance(109.9346, 75)).toEqual(81)
    expect(percentageOfBalance(109.9346, 25)).toEqual(27)
  })

  it("computes from the spendable balance so small balances cannot overshoot", () => {
    // The conversion top chip passes 99 for USD: Math.round(1.9 * 0.99) = 2
    // overshot both the 1¢ spendable and the 1.9¢ raw balance
    expect(percentageOfBalance(1.9, 99)).toEqual(0)
  })

  it("passes integer balances through unchanged at 100%", () => {
    expect(percentageOfBalance(88413, 100)).toEqual(88413)
    expect(percentageOfBalance(158, 100)).toEqual(158)
  })

  it("computes exact partials of integer balances", () => {
    expect(percentageOfBalance(200, 25)).toEqual(50)
    expect(percentageOfBalance(200, 50)).toEqual(100)
    expect(percentageOfBalance(158, 90)).toEqual(142)
  })

  it("returns zero for a zero balance at any percentage", () => {
    expect(percentageOfBalance(0, 25)).toEqual(0)
    expect(percentageOfBalance(0, 100)).toEqual(0)
  })

  it("returns zero for sub-cent residue (e.g. after a MAX drain)", () => {
    expect(percentageOfBalance(0.9346, 100)).toEqual(0)
  })

  it("propagates NaN so missing balances keep the existing invalid-amount handling", () => {
    expect(percentageOfBalance(NaN, 100)).toBeNaN()
    expect(percentageOfBalance(NaN, 50)).toBeNaN()
  })

  it("matches toSpendableBalance exactly at 100%", () => {
    for (const balance of [109.9346, 0.9346, 88413, 12.5]) {
      expect(percentageOfBalance(balance, 100)).toEqual(
        toSpendableBalance(toUsdMoneyAmount(balance)).amount,
      )
    }
  })

  it("never exceeds the spendable balance for any button percentage", () => {
    const balances = [109.9346, 0.9346, 1.9, 12.5, 55, 88413]
    const percentages = [25, 50, 75, 90, 99, 100]
    for (const balance of balances) {
      for (const percentage of percentages) {
        expect(percentageOfBalance(balance, percentage)).toBeLessThanOrEqual(
          Math.floor(balance),
        )
      }
    }
  })
})
