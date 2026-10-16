import { AmountPhrase, readAmountPhrase } from "@app/assistant/engine/amount-phrase"
import { parseAmount } from "@app/assistant/engine/parse-amount"

// The bare-amount rule (spec v0.2.5 §5.1), as a table: what each phrase is
// read as, for an account whose display currency is JMD ("J$") unless the
// row says otherwise.
const JMD = { displayCurrency: "JMD", displaySymbol: "J$" }
const USD = { displayCurrency: "USD", displaySymbol: "$" }
const EUR = { displayCurrency: "EUR", displaySymbol: "€" }

const amount = (value: string, currency?: "BTC" | "USD" | "USDT"): AmountPhrase =>
  currency
    ? { kind: "amount", amount: value, currency }
    : { kind: "amount", amount: value }

const clarify = (reason: "suffix" | "mixed" | "unit" | "format"): AmountPhrase => ({
  kind: "clarify",
  reason,
})

const TABLE: [string, typeof JMD, AmountPhrase][] = [
  // A number with no unit is the display currency.
  ["500", JMD, amount("500")],
  ["12.50", JMD, amount("12.50")],
  ["5", USD, amount("5")],
  ["1,000", JMD, amount("1000")],
  ["1,000.50", JMD, amount("1000.50")],
  [".5", JMD, amount("0.5")],
  ["  500  ", JMD, amount("500")],
  // "sats" and "bitcoin" mean BTC; sats are whole and read as bitcoin.
  ["21000 sats", JMD, amount("0.00021000", "BTC")],
  ["1 sat", JMD, amount("0.00000001", "BTC")],
  ["1,000 satoshis", JMD, amount("0.00001000", "BTC")],
  ["0.001 bitcoin", JMD, amount("0.001", "BTC")],
  ["0.5 BTC", JMD, amount("0.5", "BTC")],
  ["₿0.01", JMD, amount("0.01", "BTC")],
  ["1.5 sats", JMD, clarify("format")],
  // A currency symbol or code wins over the default.
  ["$5", USD, amount("5", "USD")],
  ["$5", EUR, amount("5", "USD")],
  ["5$", EUR, amount("5", "USD")],
  ["US$5", JMD, amount("5", "USD")],
  ["5 usd", JMD, amount("5", "USD")],
  ["10 USDT", JMD, amount("10", "USDT")],
  ["J$500", JMD, amount("500")],
  ["J$500", { displayCurrency: "JMD", displaySymbol: undefined as never }, amount("500")],
  ["500 JMD", JMD, amount("500")],
  ["$5 usd", JMD, amount("5", "USD")],
  ["5 dollars", USD, amount("5", "USD")],
  // "$" where the display currency is another dollar is a question.
  ["$500", JMD, clarify("unit")],
  ["$500", { displayCurrency: "JMD", displaySymbol: "$" }, clarify("unit")],
  [
    "$500",
    { displayCurrency: "JMD", displaySymbol: undefined as never },
    clarify("unit"),
  ],
  ["500 dollars", JMD, clarify("unit")],
  ["5 dollars", EUR, clarify("unit")],
  // k and m suffixes are a question, never a guess.
  ["5k", JMD, clarify("suffix")],
  ["5 k", JMD, clarify("suffix")],
  ["1.5m", JMD, clarify("suffix")],
  ["2M", JMD, clarify("suffix")],
  ["$5k", USD, clarify("suffix")],
  ["10 thousand", JMD, clarify("suffix")],
  // Mixed forms are a question.
  ["$5 and 300 sats", USD, clarify("mixed")],
  ["5 dollars 50 cents", USD, clarify("mixed")],
  ["$5 sats", USD, clarify("mixed")],
  ["5 usd jmd", JMD, clarify("mixed")],
  ["$5 sats", JMD, clarify("mixed")],
  // Anything it cannot name is a question.
  ["€5", JMD, clarify("unit")],
  ["5 pounds", JMD, clarify("unit")],
  ["-5", JMD, clarify("unit")],
  ["five", JMD, clarify("format")],
  ["", JMD, clarify("format")],
  ["1,00", JMD, clarify("format")],
  ["0.123456789 btc", JMD, clarify("format")],
]

describe("readAmountPhrase: the bare-amount rule", () => {
  TABLE.forEach(([phrase, context, expected]) =>
    it(`reads ${JSON.stringify(phrase)} (${context.displayCurrency}) as ${JSON.stringify(
      expected,
    )}`, () => {
      expect(readAmountPhrase(phrase, context)).toEqual(expected)
    }),
  )

  it("only ever answers an amount a tool call's schema and the parser accept", () => {
    TABLE.forEach(([phrase, context]) => {
      const read = readAmountPhrase(phrase, context)
      if (read.kind !== "amount") return
      expect(parseAmount(read.amount, read.currency ?? "USD").ok).toBe(true)
    })
  })
})
