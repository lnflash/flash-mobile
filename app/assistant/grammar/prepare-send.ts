import type { Token } from "./normalize"
import type { GrammarContext, GrammarRule, RuleResult } from "./types"
import {
  AMOUNT_PLACEHOLDERS,
  amountRuns,
  CONNECTORS,
  FOLLOW_UP_WORDS,
  hasWord,
  nameOf,
  PURPOSE_NAMES,
  PURPOSE_WORDS,
  readAmount,
  Run,
  splitAroundRuns,
  TIME_WORDS,
} from "./words"

// prepareSend, to a contact (spec §7.2): "send $5 to bob", "pay mom 500",
// "sen 1000 fi tanya". The grammar takes the payee's words and the amount's
// words, and nothing else decides here:
//
// - the payee's words go to resolvePayee and resolveContact, which answer
//   only a contact those words name exactly, and otherwise ask
//   (registry/actions/shared/payee.ts). A pronoun or a follow-up ("him",
//   "same again"), two payees, a time, or an invoice or an address
//   (words.ts) are no call at all: v1 sends to a contact the user names,
//   now. So is what a payment is for ("sen 500 fi di rent", "pay my bill
//   500", "pay di light-bill 3000"), when the word is on PURPOSE_WORDS: it
//   names no one, so resolveContact could only ask about a contact whose
//   name holds it (Brent, Billy). A word the list lacks gets that question;
// - the amount's words go to readAmountPhrase, which reads them or makes
//   them a question (a k or m suffix, a "$" on a J$ account, a number in
//   words past ninety-nine). An ask with no amount is a question too.

/**
 * The verbs a send opens with. A history read's direction reuses them
 * (get-transactions.ts, ENG-751): "who did i tip" asks what went out.
 */
export const SEND_VERBS: ReadonlySet<string> = new Set([
  "send",
  "pay",
  "give",
  "transfer",
  "tip",
])

const FROM_BTC = new Set(["bitcoin", "btc"])
const FROM_CASH = new Set(["cash", "usd", "usdt", "dollar", "dollars"])
const WALLET_WORDS = new Set(["wallet", "account"])

/** The most words a memo is taken to be. */
const MAX_MEMO_WORDS = 6

type Parts = {
  payee: string
  run: Run | undefined
  /** More than one amount: the ask is a question. */
  mixed: boolean
}

/**
 * Which wallet "from my bitcoin wallet" names: BTC, the cash wallet (the
 * default, so nothing), or a phrase this does not know.
 */
const sourceWalletOf = (words: readonly Token[]): "BTC" | "cash" | "refuse" => {
  let rest = [...words]
  while (rest.length > 0 && (rest[0].word === "my" || rest[0].word === "the")) {
    rest = rest.slice(1)
  }
  if (rest.length === 0 || rest.length > 2) return "refuse"
  if (rest.length === 2 && !WALLET_WORDS.has(rest[1].word)) return "refuse"
  if (FROM_BTC.has(rest[0].word)) return "BTC"
  if (FROM_CASH.has(rest[0].word)) return "cash"
  return "refuse"
}

/**
 * The words one payee word holds, for the purpose check: the word as the
 * rules match it, and each part of it between hyphens, as typed. A name may
 * hold a hyphen (Kerry-Ann), so "light-bill" reaches here as one word, which
 * folds to "lightbill", a word on no list; its parts are "light" and "bill".
 */
const piecesOf = ({ word, raw }: Token): string[] => [
  word,
  ...raw
    .toLowerCase()
    .split("-")
    .map((part) => part.replace(/['’‘]/g, "")),
]

/**
 * Whether the payee's words say what the payment is for rather than who
 * gets it (words.ts, PURPOSE_WORDS): "the rent", "my bill", "fi lunch",
 * "di light-bill". Patois "fi" is "for" as often as "to", so only a typed
 * "to" before a purpose word that is also a name, with no "my" or "the",
 * leaves it a name: "send $5 to bill" pays a contact called Bill.
 */
const namesPurpose = (payeeWords: readonly Token[], typedTo: boolean): boolean => {
  const purposes = payeeWords.flatMap(piecesOf).filter((part) => PURPOSE_WORDS.has(part))
  if (purposes.length === 0) return false
  const owned = payeeWords[0]?.word === "my" || payeeWords[0]?.word === "the"
  return !typedTo || owned || purposes.some((part) => !PURPOSE_NAMES.has(part))
}

/**
 * The payee and the amount in what follows the verb: "$5 to bob", "bob $5",
 * "to bob $5". Undefined when the words do not make one payee and one
 * amount (or no amount) in one of those shapes.
 */
const partsOf = (words: readonly Token[], ctx: GrammarContext): Parts | undefined => {
  const runs = amountRuns(words, ctx)
  const { before, between, after } = splitAroundRuns(words, runs)
  // Two amounts are one ask only when nothing but "and" or "or" is between
  // them; "$10 to bob and $5 to alice" is two payments.
  if (between.some((gap) => gap.some(({ word }) => !CONNECTORS.has(word)))) {
    return undefined
  }
  // A payee on both sides of the amount ("bob $5 alice") is not one payee.
  const rest =
    runs.length === 0
      ? before
      : before.length > 0 && after.length > 0
      ? undefined
      : [...before, ...after]
  if (!rest) return undefined
  const named = rest.filter(({ word }) => !AMOUNT_PLACEHOLDERS.has(word))
  const to = named.findIndex(({ word }) => word === "to")
  let payeeWords = named
  if (to >= 0) {
    // "to" leads the payee; whatever precedes it other than the amount
    // would be a second payee or a word this does not read.
    if (named.slice(0, to).length > 0) return undefined
    payeeWords = named.slice(to + 1)
    if (payeeWords.some(({ word }) => word === "to")) return undefined
  }
  // "to" as typed, not patois "fi" folded into it.
  const typedTo = to >= 0 && named[to].raw.toLowerCase() === "to"
  if (namesPurpose(payeeWords, typedTo)) return undefined
  const payee = nameOf(payeeWords)
  if (payee === "none" || payee === "refuse") return undefined
  return { payee, run: runs[0], mixed: runs.length > 1 }
}

const match = (tokens: readonly Token[], ctx: GrammarContext): RuleResult => {
  const [verb, ...words] = tokens
  if (!verb || !SEND_VERBS.has(verb.word)) return undefined
  // A follow-up or a time is a send v1 does not serve: no other rule gets it.
  if (hasWord(words, FOLLOW_UP_WORDS) || hasWord(words, TIME_WORDS)) {
    return { kind: "refuse" }
  }

  let core = words
  let sourceWallet: "BTC" | undefined
  const from = core.findIndex(({ word }) => word === "from")
  if (from >= 0) {
    const wallet = sourceWalletOf(core.slice(from + 1))
    if (wallet === "refuse") return { kind: "refuse" }
    if (wallet === "BTC") sourceWallet = "BTC"
    core = core.slice(0, from)
  }

  // A memo is what follows the last "for", when what precedes it is a
  // payee and an amount on their own: "send $5 to bob for lunch".
  let parts = partsOf(core, ctx)
  let memo: string | undefined
  const lastFor = core.map(({ word }) => word).lastIndexOf("for")
  if (lastFor > 0) {
    const memoWords = core.slice(lastFor + 1)
    const head = partsOf(core.slice(0, lastFor), ctx)
    if (
      head?.run !== undefined &&
      memoWords.length > 0 &&
      memoWords.length <= MAX_MEMO_WORDS &&
      amountRuns(memoWords, ctx).length === 0
    ) {
      parts = head
      memo = memoWords.map(({ raw }) => raw).join(" ")
    }
  }
  if (!parts) return { kind: "refuse" }

  if (parts.mixed) return { kind: "clarifyAmount", reason: "mixed" }
  if (!parts.run) return { kind: "clarifyAmount", reason: "missing" }
  const amount = readAmount(core, parts.run, ctx)
  if (amount.kind === "clarify") return { kind: "clarifyAmount", reason: amount.reason }

  return {
    kind: "call",
    call: {
      intent: "prepareSend",
      args: {
        payee: parts.payee,
        amount: amount.amount,
        ...(amount.currency ? { currency: amount.currency } : {}),
        ...(memo ? { memo } : {}),
        ...(sourceWallet ? { sourceWallet } : {}),
      },
    },
  }
}

export const PREPARE_SEND_RULES: readonly GrammarRule[] = [
  {
    name: "prepareSend.verbFirst",
    intent: "prepareSend",
    match: ({ tokens }, ctx) => match(tokens, ctx),
  },
]
