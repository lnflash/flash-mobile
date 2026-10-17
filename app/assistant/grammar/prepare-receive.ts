import type { Token } from "./normalize"
import type { GrammarContext, GrammarRule, RuleResult } from "./types"
import {
  amountRuns,
  indexOfWords,
  readAmount,
  splitAroundRuns,
  startsWith,
} from "./words"

// prepareReceive (spec §7.2): a payment request for one of the user's
// wallets. "receive $5", "make an invoice for 2000", "my bitcoin address",
// "gi mi a qr code". The amount is optional, and readAmountPhrase reads it
// as for a send. The cash wallet receives unless the ask names the bitcoin
// wallet; an address, or "on-chain", asks for an on-chain request. Nothing
// here moves money: the answer is the invoice card.

const RECEIVE_VERBS = new Set(["receive", "request", "collect"])

/** The things a payment request is called. */
const REQUEST_NOUNS = new Set(["invoice", "invoices", "qr", "address", "onchain"])

/** Every word a receive ask is made of, besides its amount and what "from" names. */
const VOCABULARY = new Set(
  (
    "receive request collect get paid pay invoice invoices qr code address onchain " +
    "lightning payment a an my the for to new create make generate give me i want need " +
    "some money bitcoin btc wallet account cash usd usdt sats it link"
  ).split(" "),
)

const isWalletBtc = (tokens: readonly Token[]): boolean =>
  ["bitcoin", "btc"].some(
    (coin) =>
      indexOfWords(tokens, [coin, "wallet"]) >= 0 ||
      indexOfWords(tokens, [coin, "account"]) >= 0,
  )

const match = (tokens: readonly Token[], ctx: GrammarContext): RuleResult => {
  const anchored =
    (tokens.length > 0 && RECEIVE_VERBS.has(tokens[0].word)) ||
    startsWith(tokens, ["get", "paid"]) ||
    startsWith(tokens, ["get", "pay"]) ||
    tokens.some(({ word }) => REQUEST_NOUNS.has(word)) ||
    indexOfWords(tokens, ["payment", "request"]) >= 0
  if (!anchored) return undefined

  // "request $5 from bob": who pays an invoice does not change it.
  const from = tokens.findIndex(({ word }) => word === "from")
  const asked =
    from >= 0 && tokens.length - from - 1 <= 3 ? tokens.slice(0, from) : tokens

  const runs = amountRuns(asked, ctx)
  const { before, between, after } = splitAroundRuns(asked, runs)
  const words = [...before, ...between.flat(), ...after]
  if (words.some(({ word }) => !VOCABULARY.has(word))) return undefined
  if (runs.length > 1) return { kind: "clarifyAmount", reason: "mixed" }

  const args: Record<string, string> = {}
  if (runs.length === 1) {
    const amount = readAmount(asked, runs[0], ctx)
    if (amount.kind === "clarify") return { kind: "clarifyAmount", reason: amount.reason }
    args.amount = amount.amount
    if (amount.currency) args.currency = amount.currency
  }
  if (isWalletBtc(words)) args.wallet = "BTC"
  if (words.some(({ word }) => word === "address" || word === "onchain")) {
    args.method = "onchain"
  }
  return { kind: "call", call: { intent: "prepareReceive", args } }
}

export const PREPARE_RECEIVE_RULES: readonly GrammarRule[] = [
  {
    name: "prepareReceive.request",
    intent: "prepareReceive",
    match: ({ tokens }, ctx) => match(tokens, ctx),
  },
]
