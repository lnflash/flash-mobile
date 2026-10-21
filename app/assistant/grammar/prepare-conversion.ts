import { normalize, type Token } from "./normalize"
import type { GrammarContext, GrammarRule, RuleResult } from "./types"
import { amountRuns, readAmount } from "./words"

type Wallet = "USD" | "BTC"
const VERBS = new Set([
  "swap",
  "swaps",
  "swapping",
  "convert",
  "converting",
  "change",
  "exchange",
])
const TO = new Set(["to", "into", "for"])

const walletOf = (word: string): Wallet | undefined => {
  if (["usd", "cash", "dollar", "dollars"].includes(word)) return "USD"
  if (["btc", "bitcoin", "sats"].includes(word)) return "BTC"
  return undefined
}

const walletPhrase = (words: readonly string[]): Wallet | undefined => {
  let at = words[0] === "my" || words[0] === "the" ? 1 : 0
  const wallet = walletOf(words[at])
  if (!wallet) return undefined
  at += 1
  if (words[at] === "wallet" || words[at] === "account") at += 1
  if (words[at] === "them") at += 1
  return at === words.length ? wallet : undefined
}

const opposite = (wallet: Wallet): Wallet => (wallet === "USD" ? "BTC" : "USD")

/** One explicit USD↔BTC direction and at most one amount; never infer a source wallet. */
const match = (tokens: readonly Token[], ctx: GrammarContext): RuleResult => {
  const words = tokens.map(({ word }) => word)
  const start =
    words[0] === "how" && ["do", "can"].includes(words[1]) && words[2] === "i"
      ? 3
      : words[0] === "can" && words[1] === "i"
      ? 2
      : 0
  if (!VERBS.has(words[start])) return undefined
  const asked = tokens.slice(start + 1)
  if (asked.length === 0) return undefined
  const runs = amountRuns(asked, ctx)
  if (runs.length > 1) return { kind: "refuse" }
  const run = runs[0]
  const amount = run ? readAmount(asked, run, ctx) : undefined
  const remaining = asked.filter((_, i) => !run || i < run.start || i >= run.end)
  const rest = remaining.map(({ word }) => word)
  const join = rest.findIndex((word) => TO.has(word))
  if (join < 0) {
    return words[start] === "change" && !asked.some(({ word }) => walletOf(word))
      ? undefined
      : { kind: "refuse" }
  }
  const target = walletPhrase(rest.slice(join + 1))
  if (!target) return { kind: "refuse" }
  const sourceWords = rest.slice(0, join)
  if (sourceWords[0] === "from") sourceWords.shift()
  const namedSource = sourceWords.length ? walletPhrase(sourceWords) : undefined
  if (sourceWords.length && !namedSource) return { kind: "refuse" }
  const amountSource = amount?.kind === "amount" ? amount.currency : undefined
  const source = namedSource ?? amountSource
  if (source !== "USD" && source !== "BTC") return { kind: "refuse" }
  if (source === target || (amountSource && amountSource !== source)) {
    return { kind: "refuse" }
  }
  if (!amount) return { kind: "conversionAmount", from: source, to: target }
  if (amount.kind === "clarify") return { kind: "clarifyAmount", reason: amount.reason }
  return {
    kind: "call",
    call: {
      intent: "prepareConversion",
      args: { from: source, to: target, amount: amount.amount, currency: source },
    },
  }
}

export const PREPARE_CONVERSION_RULES: readonly GrammarRule[] = [
  {
    name: "prepareConversion.swap",
    intent: "prepareConversion",
    match: ({ tokens }, ctx) => match(tokens, ctx),
  },
]

/** A bare amount is meaningful only immediately after Ask Flash requested one. */
export const conversionFollowup = (
  utterance: string,
  from: Wallet,
  to: Wallet,
): RuleResult => {
  const tokens = normalize(utterance).tokens
  const runs = amountRuns(tokens, { displayCurrency: from })
  if (runs.length !== 1 || runs[0].start !== 0 || runs[0].end !== tokens.length)
    return undefined
  const amount = readAmount(tokens, runs[0], { displayCurrency: from })
  if (amount.kind === "clarify") return { kind: "clarifyAmount", reason: amount.reason }
  if (amount.currency && amount.currency !== from) return { kind: "refuse" }
  if (to !== opposite(from)) return { kind: "refuse" }
  return {
    kind: "call",
    call: {
      intent: "prepareConversion",
      args: { from, to, amount: amount.amount, currency: from },
    },
  }
}
