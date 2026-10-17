import type { Token } from "./normalize"
import type { GrammarRule, RuleResult } from "./types"
import { indexOfWords } from "./words"

// getPrice (spec §7.2): "bitcoin price", "how much is a bitcoin", "what's BTC
// worth", "wah di rate fi bitcoin". The live price in the display currency,
// or in a currency the ask names ("in usd"). A number of bitcoin other than
// one ("how much is 5 bitcoin") is a conversion, not the price: no match.

const PRICE_WORDS = new Set(
  "price prices rate rates worth cost costs value trading exchange selling sell".split(
    " ",
  ),
)

const COINS = new Set(["bitcoin", "btc"])

/** A coin of one: "1 bitcoin", "one bitcoin", "a bitcoin". */
const ONE = new Set(["1", "one", "a"])

/** Currency codes the price can be asked in, as realtimePrice takes them. */
const CURRENCY_CODES = new Set(
  "usd jmd eur gbp cad ttd bbd xcd kyd bsd htg dop mxn brl ngn kes ghs zar inr".split(
    " ",
  ),
)

/** Every word a price ask is made of, besides its currency code. */
const VOCABULARY = new Set(
  (
    "what is the of a one 1 bitcoin btc price prices rate rates worth cost costs value " +
    "current currently how much does do for to at trading exchange in right there on sell " +
    "selling go going live latest market"
  ).split(" "),
)

const match = (tokens: readonly Token[]): RuleResult => {
  const words = tokens.map(({ word }) => word)
  const hasCoin = words.some((word) => COINS.has(word))
  const asksPrice =
    words.some((word) => PRICE_WORDS.has(word)) ||
    (hasCoin && indexOfWords(tokens, ["how", "much"]) >= 0) ||
    // "what's bitcoin at", "wah bitcoin deh pon", "wah bitcoin a go fa".
    (hasCoin &&
      words[0] === "what" &&
      words.some((word) => ["at", "on", "for"].includes(word)))
  if (!asksPrice) return undefined

  // "in usd": the currency the price is asked in.
  let currency: string | undefined
  const inAt = words.lastIndexOf("in")
  if (inAt >= 0 && inAt === words.length - 2 && CURRENCY_CODES.has(words[inAt + 1])) {
    currency = words[inAt + 1].toUpperCase()
  }
  const rest = currency ? words.slice(0, words.length - 2) : words
  if (rest.some((word) => !VOCABULARY.has(word))) return undefined
  // A count of coins other than one is a conversion.
  if (
    rest.some((word, i) => /^\d/.test(word) && !(ONE.has(word) && COINS.has(rest[i + 1])))
  ) {
    return undefined
  }
  return {
    kind: "call",
    call: { intent: "getPrice", args: currency ? { currency } : {} },
  }
}

export const GET_PRICE_RULES: readonly GrammarRule[] = [
  { name: "getPrice.price", intent: "getPrice", match: ({ tokens }) => match(tokens) },
]
