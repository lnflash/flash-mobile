import type { AmountCurrency } from "./parse-amount"

// The bare-amount rule (docs/ai-assistant-tool-registry.md §5.1, v0.2.5):
// what the words a user typed for an amount mean, before they become a tool
// call's `amount` and `currency`.
//
// - A number with no unit is the account's display currency: the call
//   carries no `currency`, and the tool reads the amount in that currency.
// - "sats" or "bitcoin" mean BTC.
// - A currency symbol or code wins over that default.
// - A k or m suffix, a form with two numbers or two currencies, and a unit
//   this cannot name are a clarification, never a guess.
//
// "$" is a symbol for several dollars. It reads as USD only when the display
// currency is USD, or is a currency whose own symbol has no "$"; for anyone
// whose display currency is another dollar (J$), or whose symbol is not
// known here, "$500" is a question. The confirm card then shows the unit
// whatever was read (spec §6).

export type AmountPhrase =
  /** `amount` is a decimal string in display units (bitcoin for BTC); no `currency` means the display currency. */
  | { kind: "amount"; amount: string; currency?: AmountCurrency }
  | { kind: "clarify"; reason: "suffix" | "mixed" | "unit" | "format" }

export type AmountPhraseContext = {
  /** The account's display currency code, as realtimePrice takes it ("JMD"). */
  displayCurrency: string
  /** Its symbol ("J$"), when the caller knows it (useDisplayCurrency's fiatSymbol). */
  displaySymbol?: string
}

const clarify = (reason: "suffix" | "mixed" | "unit" | "format"): AmountPhrase => ({
  kind: "clarify",
  reason,
})

/** Digits, with thousands commas, and a fraction: "1,000.50", "21000", ".5". */
const NUMBER = /\d[\d,]*(?:\.\d+)?|\.\d+/g

/** A multiplier right after the number: "5k", "1.5 m", "2 thousand". */
const SUFFIX = /^\s*(?:k|m|mm|mn|b|bn|thousand|million|billion|grand)\b/i

const SATS = new Set(["sat", "sats", "satoshi", "satoshis"])
const BITCOIN = new Set(["btc", "bitcoin", "bitcoins", "₿"])
const DOLLAR_WORDS = new Set(["dollar", "dollars", "buck", "bucks"])

/** A number's plain decimal form, "1000.50", or undefined when its commas do not group thousands. */
const plainDecimal = (number: string): string | undefined => {
  const [whole, fraction] = number.split(".")
  if (whole.includes(",") && !/^\d{1,3}(?:,\d{3})+$/.test(whole)) return undefined
  const digits = whole.replace(/,/g, "") || "0"
  if (fraction === undefined) return digits
  if (fraction.length > 8) return undefined
  return `${digits}.${fraction}`
}

/** Whole sats as bitcoin: "21000" is "0.00021000". */
const satsAsBitcoin = (sats: string): string => {
  const padded = sats.padStart(9, "0")
  return `${padded.slice(0, -8)}.${padded.slice(-8)}`
}

type Unit = AmountCurrency | "display" | "sats" | "$" | "dollars" | "unknown"

const unitOf = (
  token: string,
  { displayCurrency, displaySymbol }: AmountPhraseContext,
): Unit => {
  if (SATS.has(token)) return "sats"
  if (BITCOIN.has(token)) return "BTC"
  if (token === "usdt") return "USDT"
  if (token === "usd" || token === "us$") return "USD"
  if (token === displayCurrency.toLowerCase()) return "display"
  // "$" before the display symbol: a display currency whose own symbol is a
  // bare "$" (a dollar other than USD) still makes "$5" a question.
  if (token === "$") return "$"
  if (displaySymbol && token === displaySymbol.toLowerCase()) return "display"
  // Jamaica's dollar sign, whether or not the caller knew the symbol.
  if (token === "j$" && displayCurrency === "JMD") return "display"
  if (DOLLAR_WORDS.has(token)) return "dollars"
  return "unknown"
}

/** What "$" or "dollars" can stand for here, or undefined when it is a question. */
const dollarCurrency = (
  unit: "$" | "dollars",
  { displayCurrency, displaySymbol }: AmountPhraseContext,
): AmountCurrency | undefined => {
  if (displayCurrency === "USD") return "USD"
  // Another currency's own symbol settles "$" when it has no dollar in it
  // (EUR's "€"). The word "dollars" stays a question outside USD.
  if (unit === "$" && displaySymbol !== undefined && !displaySymbol.includes("$")) {
    return "USD"
  }
  return undefined
}

export const readAmountPhrase = (
  text: string,
  context: AmountPhraseContext,
): AmountPhrase => {
  const phrase = text.trim().toLowerCase()
  const numbers = phrase.match(NUMBER) ?? []
  const number = numbers[0]
  if (number === undefined) return clarify("format")
  if (numbers.length > 1) return clarify("mixed")
  const at = phrase.indexOf(number)
  const after = phrase.slice(at + number.length)
  if (SUFFIX.test(after)) return clarify("suffix")
  const decimal = plainDecimal(number)
  if (decimal === undefined) return clarify("format")

  // Every token around the number is a unit word: "$", "us$", "sats", "jmd".
  // A symbol written against the number ("$5", "5$") is its own token.
  const tokens = `${phrase.slice(0, at)} ${after}`
    .replace(/(us\$|j\$|\$|₿)/g, " $1 ")
    .split(/\s+/)
    .filter((token) => token.length > 0)
  const units = tokens.map((token) => unitOf(token, context))
  if (units.includes("unknown")) return clarify("unit")

  // The currencies the units name for certain; "$" and "dollars" only
  // where the display currency settles them.
  const named = new Set<AmountCurrency | "display" | "sats">()
  let openDollar = false
  units.forEach((unit) => {
    if (unit === "$" || unit === "dollars") {
      const currency = dollarCurrency(unit, context)
      if (currency) named.add(currency)
      else openDollar = true
    } else if (unit !== "unknown") {
      named.add(unit)
    }
  })
  if (named.size > 1) return clarify("mixed")
  const [unit] = [...named]
  // "$5 usd" names USD twice; "$5" alone, where "$" is open, names nothing.
  if (unit === undefined)
    return openDollar ? clarify("unit") : { kind: "amount", amount: decimal }
  if (openDollar && unit !== "USD" && unit !== "USDT") return clarify("mixed")

  switch (unit) {
    case "display":
      return { kind: "amount", amount: decimal }
    case "sats":
      // Sats are whole; "1.5 sats" is not an amount.
      if (decimal.includes(".")) return clarify("format")
      return { kind: "amount", amount: satsAsBitcoin(decimal), currency: "BTC" }
    default:
      return { kind: "amount", amount: decimal, currency: unit }
  }
}
