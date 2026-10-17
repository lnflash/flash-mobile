import {
  AmountPhrase,
  isNumberWord,
  readAmountPhrase,
} from "@app/assistant/engine/amount-phrase"
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
  ["fi", JMD, clarify("format")],
  ["", JMD, clarify("format")],
  ["1,00", JMD, clarify("format")],
  ["0.123456789 btc", JMD, clarify("format")],
  // Cents are hundredths of the display currency, on a USD or a J$ account,
  // and the call carries no currency (ENG-731).
  ["5 cent", USD, amount("0.05")],
  ["5 cent", JMD, amount("0.05")],
  ["5 cents", USD, amount("0.05")],
  ["5 cents", JMD, amount("0.05")],
  ["5c", USD, amount("0.05")],
  ["5c", JMD, amount("0.05")],
  ["5 c", USD, amount("0.05")],
  ["5 c", JMD, amount("0.05")],
  ["50 cents", JMD, amount("0.50")],
  ["150 cents", USD, amount("1.50")],
  ["1,000 cents", USD, amount("10.00")],
  // "c" is cents only against the number or right after it.
  ["c 5", USD, clarify("unit")],
  ["5 usd c", USD, clarify("unit")],
  // A cent is whole, stands alone, and is read only where it is a hundredth.
  ["2.5 cents", USD, clarify("format")],
  ["2.5 cents", JMD, clarify("format")],
  [".5 cents", USD, clarify("format")],
  ["5 euro cents", USD, clarify("unit")],
  ["5 euro cents", JMD, clarify("unit")],
  ["$5 cents", USD, clarify("mixed")],
  ["5 usd cents", JMD, clarify("mixed")],
  ["5 cents sats", USD, clarify("mixed")],
  ["5 cents and 3 dollars", USD, clarify("mixed")],
  ["5 cents and 3 dollars", JMD, clarify("mixed")],
  ["5 cents", EUR, clarify("unit")],
  ["5c", EUR, clarify("unit")],
  // A number in words up to ninety-nine is that number, and "a" or "an"
  // before a dollar, a cent or a sat is one.
  ["five cents", USD, amount("0.05")],
  ["five cents", JMD, amount("0.05")],
  ["twenty five cents", USD, amount("0.25")],
  ["twenty five cents", JMD, amount("0.25")],
  ["ninety-nine cents", USD, amount("0.99")],
  ["ninety-nine cents", JMD, amount("0.99")],
  // How the grammar hands over "ninety-nine": without its hyphen.
  ["ninetynine cents", JMD, amount("0.99")],
  ["two dollars", USD, amount("2", "USD")],
  ["two dollars", JMD, clarify("unit")],
  ["a dollar", USD, amount("1", "USD")],
  ["a dollar", JMD, clarify("unit")],
  ["an dollar", USD, amount("1", "USD")],
  ["a cent", JMD, amount("0.01")],
  ["a sat", USD, amount("0.00000001", "BTC")],
  ["five", JMD, amount("5")],
  ["twelve usd", JMD, amount("12", "USD")],
  ["five sats", JMD, amount("0.00000005", "BTC")],
  ["  five  cents  ", USD, amount("0.05")],
  // Past ninety-nine, a number in words is a question, as "5 hundred" is.
  ["five hundred dollars", USD, clarify("suffix")],
  ["five hundred dollars", JMD, clarify("suffix")],
  ["one thousand", JMD, clarify("suffix")],
  ["2 hundred", JMD, clarify("suffix")],
  // A word for a number never runs into the digits after it, and two
  // numbers in words are not one.
  ["five5", USD, clarify("unit")],
  ["twenty,000", USD, clarify("unit")],
  ["five.5", USD, clarify("unit")],
  ["twenty 5", USD, clarify("mixed")],
  ["two fifty", USD, clarify("unit")],
  ["a dollar fifty", USD, clarify("unit")],
  ["half a dollar", USD, clarify("format")],
  // An article before a currency's name or code is not one of it: "a
  // bitcoin address" asks for an address.
  ["a bitcoin", USD, clarify("format")],
  ["a usd", USD, clarify("format")],
  ["a dollars", USD, clarify("format")],
  // Patois "fi" is "to" or "for", never five.
  ["fi dollars", USD, clarify("format")],
  ["fi cents", JMD, clarify("format")],
  // Still a question, as before.
  ["$5", JMD, clarify("unit")],
  ["5k", USD, clarify("suffix")],
]

/** Every number in words this reads, with its value, written out here rather than taken from the reader. */
const ONES = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
const TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
]
const TENS = [
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]
const SPELLED: [string, number][] = [
  ...ONES.map((word, i): [string, number] => [word, i + 1]),
  ...TEENS.map((word, i): [string, number] => [word, i + 10]),
  ...TENS.flatMap((tens, i): [string, number][] => [
    [tens, (i + 2) * 10],
    ...ONES.flatMap((one, j): [string, number][] => [
      [`${tens}-${one}`, (i + 2) * 10 + j + 1],
      [`${tens} ${one}`, (i + 2) * 10 + j + 1],
      [`${tens}${one}`, (i + 2) * 10 + j + 1],
    ]),
  ]),
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

  it("reads every number in words from one to ninety-nine as its digits", () => {
    // 27 words, and 72 compounds spelled three ways each.
    expect(SPELLED).toHaveLength(27 + 72 * 3)
    SPELLED.forEach(([words, value]) => {
      const cents = `0.${String(value).padStart(2, "0")}`
      expect([words, readAmountPhrase(words, JMD)]).toEqual([
        words,
        amount(String(value)),
      ])
      expect([words, readAmountPhrase(`${words} cents`, USD)]).toEqual([
        words,
        amount(cents),
      ])
      expect([words, readAmountPhrase(`${words} dollars`, USD)]).toEqual([
        words,
        amount(String(value), "USD"),
      ])
    })
  })

  it("tells the grammar which words are numbers it reads", () => {
    SPELLED.filter(([words]) => !words.includes(" ")).forEach(([word]) =>
      expect([word, isNumberWord(word)]).toEqual([word, true]),
    )
    ;["fi", "a", "an", "hundred", "thousand", "half", "dozen", "c", "cents", "5"].forEach(
      (word) => expect([word, isNumberWord(word)]).toEqual([word, false]),
    )
  })
})
