import type { AmountCurrency } from "./parse-amount"

// The bare-amount rule (docs/ai-assistant-tool-registry.md §5.1, v0.2.5):
// what the words a user typed for an amount mean, before they become a tool
// call's `amount` and `currency`.
//
// - A number with no unit is the account's display currency: the call
//   carries no `currency`, and the tool reads the amount in that currency.
// - "sats" or "bitcoin" mean BTC.
// - A currency symbol or code wins over that default.
// - Cents ("5 cents", "5c") are hundredths of the display currency, on an
//   account whose display currency is USD or JMD (ENG-731).
// - A number in words up to ninety-nine is that number ("twenty five
//   cents"), and "a" or "an" before a dollar, cent or sat is one.
// - A k or m suffix, a number in words past ninety-nine, a form with two
//   numbers or two currencies, and a unit this cannot name are a
//   clarification, never a guess.
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

/** A multiplier right after the number: "5k", "1.5 m", "2 thousand", "5 hundred". */
const SUFFIX = /^\s*(?:k|m|mm|mn|b|bn|hundred|thousand|million|billion|grand)\b/i

const SATS = new Set(["sat", "sats", "satoshi", "satoshis"])
const BITCOIN = new Set(["btc", "bitcoin", "bitcoins", "₿"])
const DOLLAR_WORDS = new Set(["dollar", "dollars", "buck", "bucks"])

/**
 * Words for cents. "c" is one only written against the number or right
 * after it ("5c", "5 c"), never as a word anywhere else.
 */
const CENT_WORDS = new Set(["cent", "cents", "c"])

/**
 * The display currencies whose cents this reads: the two the app shows,
 * whose minor unit is a hundredth. Another currency's minor unit need not
 * be, so its cents stay a question (ENG-731 decision 1).
 */
const CENT_CURRENCIES = new Set(["USD", "JMD"])

// Numbers in words, up to ninety-nine (ENG-731 decision 2). Larger ones
// stay a question: "hundred", "thousand" and "million" are multipliers
// (SUFFIX). English words only: patois writes these numbers the same, and
// "fi" is the preposition "to" or "for", never five (decision 3).

const ONES: ReadonlyMap<string, number> = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
])

const TEENS: ReadonlyMap<string, number> = new Map([
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
])

const TENS: ReadonlyMap<string, number> = new Map([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
])

/**
 * Each one-word number and its value: "five", "twelve", "forty", and the
 * compounds "twenty-one" to "ninety-nine", with their hyphen or without it.
 * The grammar hands "twenty-five" over as "twentyfive": it drops the hyphen
 * of a word with no digit (grammar/normalize.ts).
 */
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ...ONES,
  ...TEENS,
  ...TENS,
  ...[...TENS].flatMap(([tens, tensValue]) =>
    [...ONES].flatMap(([one, oneValue]): [string, number][] => [
      [`${tens}-${one}`, tensValue + oneValue],
      [`${tens}${one}`, tensValue + oneValue],
    ]),
  ),
])

/** Whether readAmountPhrase reads a word as a number: "five", "ninety-nine", "ninetynine". */
export const isNumberWord = (word: string): boolean => NUMBER_WORDS.has(word)

/**
 * The words "a" and "an" are one only before these: "a dollar", "a cent".
 * Not before a currency's name or code, which an article modifies far more
 * often than it counts: "a bitcoin address" is no amount of bitcoin.
 */
const ARTICLES = new Set(["a", "an"])
const ONE_OF = new Set(["dollar", "buck", "cent", "sat", "satoshi"])

/**
 * The phrase with a number in words at its start written in digits: "five
 * cents" is "5 cents", "twenty five" and "twenty-five" are "25", "a dollar"
 * is "1 dollar". Each word must stand on its own, so "five5" or "twenty,000"
 * never runs a word into the digits after it. Anything else is unchanged.
 */
const spelledOut = (phrase: string): string => {
  const words = /^([a-z]+(?:-[a-z]+)?)(?=\s|$)(?:\s+([a-z]+)(?=\s|$))?/.exec(phrase)
  if (!words) return phrase
  const [both, first, second] = words
  // "twenty five": a tens word and a ones word are one number.
  const tens = TENS.get(first)
  const ones = second === undefined ? undefined : ONES.get(second)
  if (tens !== undefined && ones !== undefined) {
    return `${tens + ones}${phrase.slice(both.length)}`
  }
  const value = NUMBER_WORDS.get(first)
  if (value !== undefined) return `${value}${phrase.slice(first.length)}`
  if (ARTICLES.has(first) && second !== undefined && ONE_OF.has(second)) {
    return `1${phrase.slice(first.length)}`
  }
  return phrase
}

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

/** Whole cents in display units, with two places: "5" is "0.05", "150" is "1.50". */
const centsAsDisplay = (cents: string): string => {
  const padded = cents.replace(/^0+/, "").padStart(3, "0")
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`
}

type Unit = AmountCurrency | "display" | "sats" | "cents" | "$" | "dollars" | "unknown"

const unitOf = (
  token: string,
  { displayCurrency, displaySymbol }: AmountPhraseContext,
  rightAfterNumber: boolean,
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
  if (CENT_WORDS.has(token) && (token !== "c" || rightAfterNumber)) return "cents"
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

/** The unit words around a number: "$", "us$", "sats", "jmd". A symbol written against the number ("$5", "5$") is its own word. */
const unitWords = (text: string): string[] =>
  text
    .replace(/(us\$|j\$|\$|₿)/g, " $1 ")
    .split(/\s+/)
    .filter((token) => token.length > 0)

export const readAmountPhrase = (
  text: string,
  context: AmountPhraseContext,
): AmountPhrase => {
  const phrase = spelledOut(text.trim().toLowerCase())
  const numbers = phrase.match(NUMBER) ?? []
  const number = numbers[0]
  if (number === undefined) return clarify("format")
  if (numbers.length > 1) return clarify("mixed")
  const at = phrase.indexOf(number)
  const after = phrase.slice(at + number.length)
  if (SUFFIX.test(after)) return clarify("suffix")
  const decimal = plainDecimal(number)
  if (decimal === undefined) return clarify("format")

  // Every word around the number is a unit word; "c" is cents only as the
  // first word after it.
  const units = [
    ...unitWords(phrase.slice(0, at)).map((token) => unitOf(token, context, false)),
    ...unitWords(after).map((token, i) => unitOf(token, context, i === 0)),
  ]
  if (units.includes("unknown")) return clarify("unit")

  if (units.includes("cents")) {
    // Cents stand alone: beside "$5" or "usd" the unit is two things at once.
    if (units.some((unit) => unit !== "cents")) return clarify("mixed")
    if (!CENT_CURRENCIES.has(context.displayCurrency)) return clarify("unit")
    // A cent is whole: "2.5 cents" is not an amount.
    if (decimal.includes(".")) return clarify("format")
    return { kind: "amount", amount: centsAsDisplay(decimal) }
  }

  // The currencies the units name for certain; "$" and "dollars" only
  // where the display currency settles them.
  const named = new Set<AmountCurrency | "display" | "sats">()
  let openDollar = false
  units.forEach((unit) => {
    if (unit === "$" || unit === "dollars") {
      const currency = dollarCurrency(unit, context)
      if (currency) named.add(currency)
      else openDollar = true
    } else if (unit !== "unknown" && unit !== "cents") {
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
