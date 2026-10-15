import { WalletCurrency } from "@app/graphql/generated"
import {
  AMOUNT_PATTERN,
  AmountCurrency,
  parseAmount,
} from "@app/assistant/engine/parse-amount"
import { toBtcMoneyAmount, toUsdMoneyAmount, toWalletAmount } from "@app/types/amounts"

describe("parseAmount", () => {
  const usd: [string, number][] = [
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["0", 0],
    ["0.01", 1],
    ["007.10", 710],
  ]
  usd.forEach(([value, cents]) =>
    it(`reads ${value} USD as ${cents} cents, through toUsdMoneyAmount`, () => {
      expect(parseAmount(value, "USD")).toEqual({
        ok: true,
        amount: toUsdMoneyAmount(cents),
      })
    }),
  )

  it("reads USDT in cents, labelled USDT", () => {
    expect(parseAmount("12.50", "USDT")).toEqual({
      ok: true,
      amount: toWalletAmount({ amount: 1250, currency: WalletCurrency.Usdt }),
    })
  })

  const btc: [string, number][] = [
    ["0.00000001", 1],
    ["0.00021", 21000],
    ["1", 100_000_000],
    ["21000000", 2_100_000_000_000_000],
  ]
  btc.forEach(([value, sats]) =>
    it(`reads ${value} BTC as ${sats} sats, through toBtcMoneyAmount`, () => {
      expect(parseAmount(value, "BTC")).toEqual({
        ok: true,
        amount: toBtcMoneyAmount(sats),
      })
    }),
  )

  it("accepts trailing zeros past the currency's places, which are exact", () => {
    expect(parseAmount("12.50000000", "USD")).toEqual({
      ok: true,
      amount: toUsdMoneyAmount(1250),
    })
  })

  const overPrecise: [string, AmountCurrency][] = [
    ["12.505", "USD"],
    ["0.001", "USD"],
    ["12.501", "USDT"],
  ]
  overPrecise.forEach(([value, currency]) =>
    it(`refuses ${value} ${currency} instead of rounding it`, () => {
      expect(parseAmount(value, currency)).toEqual({ ok: false, reason: "precision" })
    }),
  )

  const notAmounts: unknown[] = [
    12.5,
    1250,
    "1e3",
    "-1",
    "",
    " 1",
    "1 ",
    "1.",
    ".5",
    "0x10",
    "1,000",
    "$5",
    "５",
    "0.123456789",
    null,
    undefined,
  ]
  notAmounts.forEach((value) =>
    it(`refuses ${
      JSON.stringify(value) ?? "undefined"
    } as not a decimal amount string`, () => {
      expect(parseAmount(value, "USD")).toEqual({ ok: false, reason: "format" })
    }),
  )

  it("refuses an amount too large to count in minor units exactly", () => {
    // 10^8 BTC is 10^16 sats, past Number.MAX_SAFE_INTEGER (about 9 * 10^15).
    expect(parseAmount("100000000", "BTC")).toEqual({ ok: false, reason: "range" })
    expect(parseAmount("90071992547409.92", "USD")).toEqual({
      ok: false,
      reason: "range",
    })
    expect(parseAmount("90071992547409.91", "USD")).toEqual({
      ok: true,
      amount: toUsdMoneyAmount(Number.MAX_SAFE_INTEGER),
    })
  })

  it("never hands back a fractional minor unit", () => {
    const values = ["0.07", "1.10", "19.99", "0.29", "4.35", "1.15"]
    values.forEach((value) => {
      const parsed = parseAmount(value, "USD")
      expect(parsed.ok && Number.isInteger(parsed.amount.amount)).toBe(true)
    })
    // The float trap the string arithmetic avoids: 0.29 * 100 is 28.999999999999996.
    expect(parseAmount("0.29", "USD")).toEqual({ ok: true, amount: toUsdMoneyAmount(29) })
  })

  it("matches the pattern the tool schemas declare", () => {
    expect(AMOUNT_PATTERN).toBe("^[0-9]+(\\.[0-9]{1,8})?$")
  })
})
