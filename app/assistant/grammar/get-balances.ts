import type { Token } from "./normalize"
import type { GrammarRule, RuleResult } from "./types"
import { indexOfWords } from "./words"

// getBalances (spec §7.2): "what's my balance", "how much money do I have",
// "what's in my wallet", "how much mi have lef". Every wallet's balance; the
// answer names each one, so a question about one wallet ("my bitcoin
// balance") gets them all. Tried last of the five: an ask that names a
// payment, a request, a list or a price is one of theirs.

const BALANCE_WORDS = new Set(["balance", "balances", "funds"])

const HOLDING = new Set(["have", "got", "own", "left"])

const PLACES = new Set(["account", "wallet", "accounts", "wallets"])

/** Every word a balance ask is made of. */
const VOCABULARY = new Set(
  (
    "what is are my the balance balances funds how much many money cash bitcoin btc sats " +
    "do i have got own left in account wallet accounts wallets there on say check current " +
    "me want know see total available usd all of is"
  ).split(" "),
)

const match = (tokens: readonly Token[]): RuleResult => {
  const words = tokens.map(({ word }) => word)
  const asksBalance =
    words.some((word) => BALANCE_WORDS.has(word)) ||
    // "how much (money) do I have", "how many sats do I have".
    ((indexOfWords(tokens, ["how", "much"]) === 0 ||
      indexOfWords(tokens, ["how", "many"]) === 0) &&
      words.some((word) => HOLDING.has(word) || PLACES.has(word))) ||
    // "what's in my wallet", "what do I have in my account", "wah mi have".
    (words[0] === "what" && words.some((word) => PLACES.has(word) || HOLDING.has(word)))
  if (!asksBalance) return undefined
  if (words.some((word) => !VOCABULARY.has(word))) return undefined
  return { kind: "call", call: { intent: "getBalances", args: {} } }
}

export const GET_BALANCES_RULES: readonly GrammarRule[] = [
  {
    name: "getBalances.balance",
    intent: "getBalances",
    match: ({ tokens }) => match(tokens),
  },
]
