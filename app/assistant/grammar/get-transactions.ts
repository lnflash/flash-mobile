import { TX_PAGE_SIZE } from "../registry/read/get-transactions"
import type { Token } from "./normalize"
import { RECEIVE_VERBS } from "./prepare-receive"
import { SEND_VERBS } from "./prepare-send"
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

// ---------------------------------------------------------------------------
// What a history read the on-device model made may hold (ENG-751)
// ---------------------------------------------------------------------------

/**
 * Words that say money moved without saying which way: a refund the user
 * got ("my refunds") or one they gave ("who did i refund"). Each gives both
 * directions, as words that are unsure do.
 */
const EITHER_WAY: readonly string[] = ["refund", "refunds", "refunded"]

/**
 * Words that say the money went out: the grammar's own, its history rule's
 * (SENT) and its send verbs (SEND_VERBS: send, pay, give, transfer, tip);
 * the other forms of those verbs ("paid", "gave", "transferred", "tipped");
 * spending (patois "spen"); the nouns for what went out ("expenses",
 * "purchases"); and a refund, which goes either way (EITHER_WAY).
 */
const SEND_WORDS: ReadonlySet<string> = new Set([
  ...SENT,
  ...SEND_VERBS,
  ...(
    "sending paid paying pays gave gives giving transferred transferring tipped tipping " +
    "spending spen expenses purchases"
  ).split(" "),
  ...EITHER_WAY,
])

/**
 * Words that say the money came in: the grammar's own, its history rule's
 * (RECEIVED) and its receive verbs (RECEIVE_VERBS: receive, request,
 * collect); the other forms of those verbs ("receiving", "requested",
 * "collected"); "from"; earning; the nouns for what came in ("earnings",
 * "income"); and a refund, which goes either way (EITHER_WAY).
 */
const RECEIVE_WORDS: ReadonlySet<string> = new Set([
  ...RECEIVED,
  ...RECEIVE_VERBS,
  ..."receiving requested collected from earned earn earning earnings income".split(" "),
  ...EITHER_WAY,
])

/**
 * The directions a history ask's words give (ENG-751): SEND for a word of
 * money going out ("sent", "paid", "spent", "tip", "transfer", "outgoing",
 * "expenses") or "to" someone; RECEIVE for a word of money coming in
 * ("received", "got", "collect", "from", "earned", "earnings", "income"),
 * or a word of money going out that points at the user ("sent me", "who
 * pay mi", "to us"); both for a refund, which goes either way. Patois "mi"
 * is "my" as often as "me", so "fi mi madda" gives both. The model tier
 * keeps the model's direction only when the words give it, and drops it
 * otherwise: a direction the words do not give is not what was asked ("how
 * much did I spend" is no list of what came in).
 */
export const directionsSaid = (
  tokens: readonly Token[],
): ReadonlySet<"SEND" | "RECEIVE"> => {
  const said = new Set<"SEND" | "RECEIVE">()
  tokens.forEach(({ word }, i) => {
    const next = tokens[i + 1]?.raw.toLowerCase()
    const atUser = next === "me" || next === "us" || next === "mi"
    const atOther = next !== undefined && next !== "me" && next !== "us"
    if (SEND_WORDS.has(word)) said.add("SEND")
    if ((SEND_WORDS.has(word) || word === "to") && atUser) said.add("RECEIVE")
    if (word === "to" && atOther) said.add("SEND")
    if (RECEIVE_WORDS.has(word)) said.add("RECEIVE")
  })
  return said
}

/**
 * Words about amounts or order, which name no one and no memo: "my biggest
 * payment", "my first payment", "how much", and a comparison with an amount
 * ("over $50", "less than 2000"), which no read filters by.
 */
const ORDER_WORDS = new Set(
  (
    "biggest largest smallest highest lowest total totals sum average most least much many " +
    "first oldest newest earliest over above under below than less greater bigger larger " +
    "smaller"
  ).split(" "),
)

/**
 * Whether a word is one a history ask is made of, never what it looks for
 * (ENG-751): its nouns and the rest of its vocabulary, its directions, its
 * counts, and words about amounts or order. A search made of such words
 * alone ("my payments", "money i received", "tip" in "who did i tip")
 * looks for nothing the person named.
 */
export const isHistoryWord = (word: string): boolean =>
  VOCABULARY.has(word) ||
  LIST_NOUNS.has(word) ||
  SEND_WORDS.has(word) ||
  RECEIVE_WORDS.has(word) ||
  ORDER_WORDS.has(word) ||
  Object.prototype.hasOwnProperty.call(COUNT_WORDS, word)

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
