import { AmountPhrase, isNumberWord, readAmountPhrase } from "../engine/amount-phrase"
import type { Token } from "./normalize"
import type { GrammarContext } from "./types"

// What the rules share: the words around an ask that are not part of it,
// where an amount sits among the words (what it means is readAmountPhrase's
// to say), and what can be a contact's name.

const set = (words: string): ReadonlySet<string> => new Set(words.split(/\s+/))

/** Does the token list start with these words? */
export const startsWith = (tokens: readonly Token[], words: readonly string[]): boolean =>
  words.length <= tokens.length && words.every((word, i) => tokens[i].word === word)

/** Is any of the words in the token list? */
export const hasWord = (tokens: readonly Token[], words: ReadonlySet<string>): boolean =>
  tokens.some(({ word }) => words.has(word))

/** The index of a word sequence in the tokens, or -1. */
export const indexOfWords = (
  tokens: readonly Token[],
  words: readonly string[],
): number => {
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    if (words.every((word, j) => tokens[i + j].word === word)) return i
  }
  return -1
}

// ---------------------------------------------------------------------------
// The frame around an ask
// ---------------------------------------------------------------------------

/** The verbs an ask can start with, once its frame is gone. */
export const VERBS = set(
  "send pay give transfer tip receive request collect check see show view list get make create generate tell",
)

/**
 * Words before an ask that are not part of it, longest first: greetings,
 * please, "can you", "I want to", "show me". `beforeVerb` frames are taken
 * only when a verb follows them (patois "make me send" folds to "make my
 * send"; "make my invoice" is not a frame).
 */
const FRAMES: readonly { words: readonly string[]; beforeVerb?: boolean }[] = [
  ["i", "would", "like", "to"],
  ["i", "want", "to", "see"],
  ["i", "want", "to", "know"],
  ["i", "want", "to"],
  ["i", "need", "to"],
  ["i", "like", "to"],
  ["my", "want", "to"],
  ["can", "i", "see"],
  ["can", "i", "have"],
  ["let", "me", "see"],
  ["go", "ahead", "and"],
  ["can", "you"],
  ["could", "you"],
  ["would", "you"],
  ["will", "you"],
  ["you", "can"],
  ["i", "wanna"],
  ["i", "want"],
  ["i", "need"],
  ["my", "want"],
  ["me", "want"],
  ["let", "me"],
  ["help", "me"],
  ["show", "me"],
  ["show", "my"],
  ["tell", "me"],
  ["tell", "my"],
  ["give", "me"],
  ["give", "my"],
  ["hey"],
  ["hi"],
  ["hello"],
  ["yo"],
  ["ok"],
  ["okay"],
  ["so"],
  ["um"],
  ["please"],
  ["kindly"],
  ["just"],
  ["check"],
  ["see"],
  ["show"],
  ["view"],
  ["list"],
  ["display"],
]
  .map((words) => ({ words }))
  .concat([
    { words: ["make", "my"], beforeVerb: true },
    { words: ["make", "me"], beforeVerb: true },
    { words: ["i"], beforeVerb: true },
    { words: ["my"], beforeVerb: true },
  ] as { words: string[]; beforeVerb: boolean }[])

/** Words after an ask that are not part of it. */
const TRAILERS: readonly (readonly string[])[] = [
  ["thank", "you"],
  ["right", "now"],
  ["real", "quick"],
  ["please"],
  ["thanks"],
  ["now"],
  ["today"],
  ["rn"],
  ["asap"],
  ["quick"],
  ["quickly"],
  ["ok"],
  ["okay"],
]

/** The frame that opens these words, if one does. */
const leadingFrame = (rest: readonly Token[]) =>
  FRAMES.find(
    ({ words, beforeVerb }) =>
      startsWith(rest, words) &&
      rest.length > words.length &&
      (!beforeVerb || VERBS.has(rest[words.length].word)),
  )

/** The trailer that closes these words, if one does. */
const trailerOf = (rest: readonly Token[]) =>
  TRAILERS.find((words) => {
    const at = rest.length - words.length
    return at > 0 && words.every((word, i) => rest[at + i].word === word)
  })

/** The ask without its frame: no greeting, "please", "can you" or "show me" around it. */
export const stripFrame = (tokens: readonly Token[]): Token[] => {
  let rest = [...tokens]
  for (let frame = leadingFrame(rest); frame; frame = leadingFrame(rest)) {
    rest = rest.slice(frame.words.length)
  }
  for (let trailer = trailerOf(rest); trailer; trailer = trailerOf(rest)) {
    rest = rest.slice(0, rest.length - trailer.length)
  }
  return rest
}

/**
 * Asks about how something works, or whether, rather than for something:
 * "how do I send money", "why is bitcoin down", "is bitcoin going up".
 */
const QUESTIONS: readonly (readonly string[])[] = [
  ["how", "do"],
  ["how", "can"],
  ["how", "does"],
  ["how", "to"],
  ["how", "should"],
  ["how", "my", "to"],
  ["why"],
  ["where"],
  ["when"],
  ["is"],
  ["are"],
  ["should"],
  ["will"],
  ["does"],
  ["do"],
]

export const isQuestionAboutHow = (tokens: readonly Token[]): boolean =>
  QUESTIONS.some((words) => startsWith(tokens, words))

/**
 * Asks what something is (ENG-749): "what is lightning", "what's a sat",
 * "whats an invoice", "what are fees". "What's" and "whats" both reach the
 * rules as "what" (normalize.ts, folds.ts), so the word as typed tells
 * them from a plain "what"; a patois "wah is" folds to "what is" and is one
 * too. Unlike the openers above, a rule reads first: "what is my balance"
 * and "what's the price" are reads, and only an ask no rule reads is a
 * question about what something is (readGrammar).
 */
export const isQuestionAboutWhat = (tokens: readonly Token[]): boolean => {
  const [first, second] = tokens
  if (first?.word !== "what") return false
  const typed = first.raw.toLowerCase().replace(/['’‘]/g, "")
  return typed === "whats" || second?.word === "is" || second?.word === "are"
}

// ---------------------------------------------------------------------------
// Payment requests and addresses, which v1 does not take
// ---------------------------------------------------------------------------

const PAYMENT_REQUEST = /^(?:lnbc|lntb|lnbcrt|lnurl|lightning:|bitcoin:|bc1|tb1|bcrt1)/

/**
 * An invoice, an LNURL, an on-chain address, a Lightning address or a link:
 * v1's grammar sends to contacts only, so any of these in an ask is a miss,
 * whatever else the ask says (spec §7.2, decision 3).
 */
export const namesPaymentRequest = (tokens: readonly Token[]): boolean =>
  tokens.some(
    ({ word }) =>
      PAYMENT_REQUEST.test(word) ||
      word.includes("@") ||
      word.includes("://") ||
      // An address or an invoice with no prefix the list above knows.
      (word.length > 25 && /^[a-z0-9]+$/.test(word)),
  )

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/**
 * A word that starts a number: "5", "$5", "j$500", "500jmd", ".5", "usd5",
 * and one with a sign, "-5" or "+5", which readAmountPhrase makes a
 * question rather than the grammar dropping the sign.
 */
const NUMBER_START = /^[-+]?(?:us\$|j\$|\$|₿|usd|usdt|jmd|btc)?(?:\d|\.\d)/

/** Words that name a unit, a symbol or a multiplier beside a number. */
const UNIT_WORDS = set(
  "$ j$ us$ ₿ usd usdt jmd btc bitcoin sat sats satoshi satoshis dollar dollars buck bucks " +
    "k m mm mn b bn thousand million billion grand cent cents euro euros eur pound pounds gbp",
)

/**
 * Words for a number, part of the amount whatever they say: readAmountPhrase
 * reads one up to ninety-nine and makes the rest a question ("five
 * hundred", "half").
 */
const NUMBER_WORDS = set(
  "one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
    "fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy " +
    "eighty ninety hundred thousand million dozen half quarter couple",
)

const ARTICLES = set("a an")

/** Words that stand for an amount the ask does not give: "send money to mom". */
export const AMOUNT_PLACEHOLDERS = set(
  "money cash funds something anything some few little bit",
)

type Kind = "number" | "unit" | "numberWord" | "other"

/**
 * Whether a word names a unit beside a number: one of UNIT_WORDS, or the
 * account's own display currency code ("100 ttd" on a TT$ account), which
 * readAmountPhrase reads as the display currency. Assistant.amountUnclear
 * gives that code as its example, so the example is always one this reads.
 */
const isUnit = (word: string, ctx: GrammarContext): boolean =>
  UNIT_WORDS.has(word) || word === ctx.displayCurrency.toLowerCase()

/** What a word's kind depends on around it: the kind before it, and the word after it. */
type Neighbours = { previous: Kind | undefined; next: Token | undefined }

/** Words that open what follows an amount: "5 c to bob", "5 c for lunch". */
const AFTER_AMOUNT = set("to for from")

/**
 * Whether an amount can end before this word: it is the last, or it opens
 * what follows the amount, or it joins a second amount ("5 c and 10 c").
 */
const endsAmount = (next: Token | undefined): boolean =>
  next === undefined || AFTER_AMOUNT.has(next.word) || CONNECTORS.has(next.word)

const kindOf = (
  token: Token,
  { previous, next }: Neighbours,
  ctx: GrammarContext,
): Kind => {
  if (NUMBER_START.test(token.word)) return "number"
  if (isUnit(token.word, ctx)) return "unit"
  // "c" is cents only right after a number, as readAmountPhrase reads it,
  // and where the amount ends: "send bob 5 c", "send 5 c to bob". Before a
  // name it is the name's initial ("send 500 c brown" is 500 to C Brown,
  // never 5.00 to Brown), and anywhere else it is a word too.
  if (
    token.word === "c" &&
    (previous === "number" || previous === "numberWord") &&
    endsAmount(next)
  ) {
    return "unit"
  }
  // "ninety-nine" reaches here as "ninetynine" (normalize.ts drops the
  // hyphen of a word with no digit), a word only readAmountPhrase knows.
  if (NUMBER_WORDS.has(token.word) || isNumberWord(token.word)) return "numberWord"
  // "a dollar", "an amount" is not: an article counts only before a unit.
  if (ARTICLES.has(token.word) && next && isUnit(next.word, ctx)) return "numberWord"
  return "other"
}

/** Where an amount sits among the words: [start, end). */
export type Run = { start: number; end: number }

/**
 * The amounts in an ask: each a run of numbers, words for numbers, units
 * and multipliers that holds at least one number or word for one. A unit
 * on its own ("my bitcoin wallet") is no amount.
 */
export const amountRuns = (tokens: readonly Token[], ctx: GrammarContext): Run[] => {
  const kinds: Kind[] = []
  tokens.forEach((token, i) =>
    kinds.push(kindOf(token, { previous: kinds[i - 1], next: tokens[i + 1] }, ctx)),
  )
  const runs: Run[] = []
  let i = 0
  while (i < tokens.length) {
    if (kinds[i] === "other") {
      i += 1
    } else {
      const start = i
      while (i < tokens.length && kinds[i] !== "other") i += 1
      const run = kinds.slice(start, i)
      if (run.includes("number") || run.includes("numberWord")) {
        runs.push({ start, end: i })
      }
    }
  }
  return runs
}

/** What an amount's words mean, as readAmountPhrase reads them. */
export const readAmount = (
  tokens: readonly Token[],
  { start, end }: Run,
  ctx: GrammarContext,
): AmountPhrase =>
  readAmountPhrase(
    tokens
      .slice(start, end)
      .map(({ word }) => word)
      .join(" "),
    ctx,
  )

/** The tokens with the runs taken out, and what lies between them. */
export const splitAroundRuns = (
  tokens: readonly Token[],
  runs: readonly Run[],
): { before: Token[]; between: Token[][]; after: Token[] } => {
  if (runs.length === 0) return { before: [...tokens], between: [], after: [] }
  const between = runs.slice(1).map((run, i) => tokens.slice(runs[i].end, run.start))
  return {
    before: tokens.slice(0, runs[0].start),
    between,
    after: tokens.slice(runs[runs.length - 1].end),
  }
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Words that can join two amounts: "$5 and $10" is one ask with two
 * amounts. "&" and "+" reach the rules as "and" (normalize.ts).
 */
export const CONNECTORS = set("and or plus")

/**
 * Words that never name a contact: people the ask points at rather than
 * names (a pronoun, "the same"), more than one payee, a wallet or account
 * of the user's own, a time, an amount the ask does not give.
 */
const NOT_A_NAME = set(
  // Pronouns: every utterance stands alone in v1, so "him" names no one.
  "i me my mine myself you your yourself him her hers his them they their it its us we " +
    "our she he yall unu im " +
    // Follow-ups.
    "same again more another back too also else extra rest " +
    // More than one payee ("&" and "+" reach here as "and", normalize.ts).
    "and or plus with between split each everyone everybody all someone somebody " +
    "anyone anybody people " +
    // The user's own wallets and accounts.
    "wallet wallets account accounts bank card flashcard savings saving btc bitcoin usd " +
    "usdt jmd cash dollar dollars sats " +
    // Times: v1 sends now or not at all.
    "tomorrow tonight later next week month year every daily weekly monthly yesterday " +
    "monday tuesday wednesday thursday friday saturday sunday morning evening night am pm " +
    // Amounts the ask does not give, and words that are not names.
    "money funds something anything nothing some thing that this these those there here " +
    "what which who how to for from on in at of",
)

/**
 * A word a username or a contact's name can hold: letters, digits, "_" and
 * ".", with a hyphen or an apostrophe inside it, as in Kerry-Ann, Sherry-Ann
 * and D'Andre (or D’Andre, as a phone's keyboard types it).
 */
const NAME_WORD = /^[\p{L}\p{N}_.]+(?:['’-][\p{L}\p{N}_.]+)*$/u

/** The most words a contact's name is taken to be. */
export const MAX_NAME_WORDS = 4

/**
 * The words that name a contact, as typed and lower-cased, or why they do
 * not: "none" when there are none, "refuse" when they point at someone
 * rather than name them, or name more than one ("mom and dad", "mom & dad",
 * "mom, dad"). A leading "my" or "the" is not part of the name ("my mom" is
 * "mom").
 */
export const nameOf = (tokens: readonly Token[]): string | "none" | "refuse" => {
  let words = [...tokens]
  while (words.length > 0 && (words[0].word === "my" || words[0].word === "the")) {
    words = words.slice(1)
  }
  if (words.length === 0) return "none"
  if (words.length > MAX_NAME_WORDS) return "refuse"
  if (words.some(({ word, raw }) => NOT_A_NAME.has(word) || !NAME_WORD.test(raw))) {
    return "refuse"
  }
  // A comma inside the words is a list of names; one after the last ends
  // the sentence ("send $5 to bob, please").
  if (words.slice(0, -1).some(({ comma }) => comma)) return "refuse"
  return words.map(({ raw }) => raw.toLowerCase()).join(" ")
}

/**
 * Words for what a payment is for, which never name who gets it: "sen 500
 * fi di rent" pays the rent, "pay my bill" a bill and "sen 2000 fi gas" the
 * gas, not a contact whose name holds the word (Brent, Billy, Vargas). "bill"
 * is a name too, so a send takes it as one only after a typed "to"
 * (prepare-send.ts).
 *
 * No list holds every such word, so this one is not the guard: a word it
 * lacks reaches resolveContact as a name, and resolveContact answers only a
 * contact the words name exactly, and asks about any other (spec §4). The
 * list spares the user that question for the common ones.
 */
export const PURPOSE_WORDS = set(
  "rent bill bills light lights electricity water school tuition fee fees lunch dinner " +
    "breakfast food groceries grocery taxi fare bus data credit internet cable phone " +
    "insurance mortgage loan gas petrol fuel book books market supermarket shopping " +
    "uniform uniforms medicine ticket tickets parking toll",
)

/** Purpose words that are also names: a send takes one only after a typed "to". */
export const PURPOSE_NAMES = set("bill")

/** Words of a time, which make an ask one v1 does not serve ("next week", "every month"). */
export const TIME_WORDS = set(
  "tomorrow tonight later next week weeks month months year every daily weekly monthly " +
    "yesterday monday tuesday wednesday thursday friday saturday sunday",
)

/** Follow-ups: v1 parses every utterance on its own (spec §7.2). */
export const FOLLOW_UP_WORDS = set("again more another same back extra rest also too")

/** Pronouns that stand for a person. */
export const PERSON_PRONOUNS = set("him her them they it she he us im yall unu")
