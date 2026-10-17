import { TX_PAGE_SIZE } from "../registry/read/get-transactions"
import type { Token } from "./normalize"
import type { GrammarRule, RuleResult } from "./types"
import { indexOfWords, nameOf, startsWith, TIME_WORDS } from "./words"

// getTransactions (spec §7.2): "show my transactions", "what did I send",
// "who paid me", "payments to mom", "last 5 payments", "wah mi sen". The
// tool's three arguments, when the ask names them: a direction, a name to
// look for ("to"/"from"/"with" a name), which the tool finds in the memo,
// the payee or the contact it names, and how many ("last 5"). Nothing
// else: an aggregate ("how much did I spend") is not a list, and is no
// match.

/** Nouns for a list of payments. */
const LIST_NOUNS = new Set(
  "transactions transaction history payments payment activity statement deposits sends".split(
    " ",
  ),
)

const SINGULAR = new Set(["transaction", "payment"])

const SENT = new Set("sent send spent spend outgoing sends out".split(" "))
const RECEIVED = new Set(
  "received receive incoming deposits deposit got get came come".split(" "),
)

/** Every word a history ask is made of, besides the name it looks for and its count. */
const VOCABULARY = new Set(
  (
    "transactions transaction history payments payment activity statement deposits " +
    "sends my me the recent recently latest last all what who did i have sent send " +
    "received receive got get spent spend money paid pay came come in out incoming " +
    "outgoing lately to from with anything of"
  ).split(" "),
)

/** Words for small counts: "last five payments". */
const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
}

const countOf = (token: Token | undefined): number | undefined => {
  if (!token) return undefined
  if (/^\d+$/.test(token.word)) return Number(token.word)
  return COUNT_WORDS[token.word]
}

/**
 * Whether the ask is for a list of payments: a noun for one ("history",
 * "payments"), or a question about what went or came ("what did I send",
 * "who paid me", "money I received", "what came in").
 */
const asksForHistory = (tokens: readonly Token[]): boolean => {
  if (tokens.some(({ word }) => LIST_NOUNS.has(word))) return true
  const words = tokens.map(({ word }) => word)
  const [first, second, third] = words
  if (first === "what" && (second === "did" || second === "have") && third === "i")
    return true
  // Patois: "wah mi sen", "wah mi get"; "what came in".
  if (first === "what" && second === "my" && (SENT.has(third) || RECEIVED.has(third))) {
    return true
  }
  if (first === "what" && (second === "came" || second === "come")) return true
  if (first === "who") return true
  if (first === "money" && second === "i") return true
  // "the money weh mi sen": the money that I sent.
  return indexOfWords(tokens, ["money", "what", "my"]) >= 0
}

const match = (tokens: readonly Token[]): RuleResult => {
  if (!asksForHistory(tokens)) return undefined
  if (tokens.some(({ word }) => TIME_WORDS.has(word))) return undefined

  const args: { first?: number; direction?: "SEND" | "RECEIVE"; query?: string } = {}

  // The name it looks for: "to mom", "from bob", "with tanya".
  let rest = [...tokens]
  const at = rest.findIndex(
    ({ word }) => word === "to" || word === "from" || word === "with",
  )
  if (at >= 0) {
    const name = nameOf(rest.slice(at + 1))
    if (name === "none" || name === "refuse") return undefined
    args.query = name
    if (rest[at].word === "to") args.direction = "SEND"
    if (rest[at].word === "from") args.direction = "RECEIVE"
    rest = rest.slice(0, at)
  }

  // How many: "last 5", "last five", "my last payment".
  const last = rest.findIndex(({ word }) => word === "last")
  if (last >= 0) {
    const count = countOf(rest[last + 1])
    if (count !== undefined) {
      if (count < 1) return undefined
      args.first = Math.min(count, TX_PAGE_SIZE)
      rest = [...rest.slice(0, last + 1), ...rest.slice(last + 2)]
    } else if (SINGULAR.has(rest[last + 1]?.word ?? "")) {
      args.first = 1
    }
  }
  if (rest.some(({ word }) => !VOCABULARY.has(word))) return undefined

  // Which way: "who paid me" came in; "who did I pay" went out.
  const words = rest.map(({ word }) => word)
  if (words[0] === "who") {
    if (startsWith(rest, ["who", "did", "i"])) {
      args.direction = "SEND"
    } else if (words.includes("me") || words.includes("my")) {
      args.direction = "RECEIVE"
    } else {
      return undefined
    }
  } else if (args.direction === undefined) {
    const sent = words.some((word) => SENT.has(word)) || startsWith(rest, ["who", "did"])
    const received = words.some((word) => RECEIVED.has(word))
    if (sent !== received) args.direction = sent ? "SEND" : "RECEIVE"
  }
  return { kind: "call", call: { intent: "getTransactions", args } }
}

export const GET_TRANSACTIONS_RULES: readonly GrammarRule[] = [
  {
    name: "getTransactions.history",
    intent: "getTransactions",
    match: ({ tokens }) => match(tokens),
  },
]
