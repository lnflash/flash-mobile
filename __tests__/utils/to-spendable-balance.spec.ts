import { WalletCurrency } from "@app/graphql/generated"
import {
  toBtcMoneyAmount,
  toSpendableBalance,
  toUsdMoneyAmount,
} from "@app/types/amounts"

// The API can report USD cash-wallet balances in fractional cents, e.g.
// 109.9346 = $1.099346 held at IBEX (#690). Displayed balances must floor to
// whole minor units so users are never shown money they can't send.
describe("toSpendableBalance", () => {
  it("floors a fractional USD cent balance to whole cents", () => {
    expect(toSpendableBalance(toUsdMoneyAmount(109.9346))).toEqual({
      amount: 109,
      currency: WalletCurrency.Usd,
      currencyCode: "USD",
    })
  })

  it("floors sub-cent residue (e.g. after a MAX drain) to zero", () => {
    expect(toSpendableBalance(toUsdMoneyAmount(0.9346)).amount).toEqual(0)
  })

  it("passes integer balances through unchanged", () => {
    expect(toSpendableBalance(toUsdMoneyAmount(88413)).amount).toEqual(88413)
    expect(toSpendableBalance(toUsdMoneyAmount(0)).amount).toEqual(0)
  })

  it("is a no-op for integer BTC sat balances and keeps the currency", () => {
    expect(toSpendableBalance(toBtcMoneyAmount(158))).toEqual({
      amount: 158,
      currency: WalletCurrency.Btc,
      currencyCode: "BTC",
    })
  })

  it("passes NaN through so missing balances keep their existing rendering", () => {
    expect(toSpendableBalance(toUsdMoneyAmount(undefined)).amount).toBeNaN()
    expect(toSpendableBalance(toUsdMoneyAmount(null)).amount).toBeNaN()
  })

  it("floors negative balances toward negative infinity (displayed <= actual)", () => {
    // Balances should never be negative, but if one ever is we'd rather
    // understate than overstate what is spendable.
    expect(toSpendableBalance(toUsdMoneyAmount(-0.5)).amount).toEqual(-1)
  })

  it("does not mutate its input", () => {
    const original = toUsdMoneyAmount(109.9346)
    toSpendableBalance(original)
    expect(original.amount).toEqual(109.9346)
  })
})
