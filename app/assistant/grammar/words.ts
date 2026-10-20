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

/**
 * Every word of a frame or a trailer ("please", "thanks", "hey", "can",
 * "you"), which never names the person a send pays (ENG-751).
 */
export const FRAME_WORDS: ReadonlySet<string> = new Set([
  ...FRAMES.flatMap(({ words }) => words),
  ...TRAILERS.flat(),
])

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
 * The words of an ask's frame, as stripFrame takes them off it (ENG-751):
 * "show" and "my" in "show my earnings"; "can", "you", "list" and "please"
 * in "can you list my payments please". They are the ask's own words, never
 * what it looks for. A word the ask itself holds is not one, wherever else
 * it stands: "check" in "what did i pay for the check" and in "check what i
 * paid for the check" is the memo's, and "will" in "will you show me what
 * i got from will" is the name the ask ends with.
 */
export const frameWordsOf = (tokens: readonly Token[]): ReadonlySet<string> => {
  const askWords = new Set(stripFrame(tokens).map(({ word }) => word))
  return new Set(tokens.map(({ word }) => word).filter((word) => !askWords.has(word)))
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

/** "What's" as typed, its chat forms included (folds.ts, ENG-753). */
const WHATS = set("whats wats wuts")

/**
 * Asks what something is (ENG-749): "what is lightning", "what's a sat",
 * "whats an invoice", "what are fees". "What's", "whats" and the chat
 * forms "wats" and "wuts" all reach the rules as "what" (normalize.ts,
 * folds.ts), so the word as typed tells them from a plain "what"; a patois
 * "wah is" folds to "what is" and is one too. Unlike the openers above, a
 * rule reads first: "what is my balance" and "what's the price" are reads,
 * and only an ask no rule reads is a question about what something is
 * (readGrammar).
 */
export const isQuestionAboutWhat = (tokens: readonly Token[]): boolean => {
  const [first, second] = tokens
  if (first?.word !== "what") return false
  const typed = first.raw.toLowerCase().replace(/['’‘]/g, "")
  return WHATS.has(typed) || second?.word === "is" || second?.word === "are"
}

/** Words that ask to change one of the user's currencies into another. */
const CONVERSION_WORDS = set("swap swaps swapping convert converting conversion")
/** Words that ask for a conversion only when another currency follows ("exchange 20 usd for btc"). */
const CHANGE_WORDS = set("exchange change")
const INTO_WORDS = set("to into for")
/** The currencies and wallets a conversion names on its far side. */
const MONEY_WORDS = set("bitcoin btc sats usd usdt jmd dollar dollars cash")

/**
 * Asks for a conversion between the user's own currencies (ENG-753): a
 * word for one ("swap", "convert"), or "exchange" or "change" with another
 * currency after a "to", "into" or "for" ("change my dollars to bitcoin",
 * patois "change mi dolla dem to bitcoin"). The model tier has no tool for
 * one (prepareConversion is not among its five), so the model can only
 * answer with a call for another ask. readGrammar asks only once no rule
 * has read the words: "what is the exchange rate" is a price, and "send bob
 * 5 for swap meet" a send with its memo.
 */
export const asksConversion = (tokens: readonly Token[]): boolean => {
  if (hasWord(tokens, CONVERSION_WORDS)) return true
  const change = tokens.findIndex(({ word }) => CHANGE_WORDS.has(word))
  if (change < 0) return false
  const into = tokens.findIndex(({ word }, i) => i > change && INTO_WORDS.has(word))
  return into > change && hasWord(tokens.slice(into + 1), MONEY_WORDS)
}

/** Words that name the user's contacts as a list. */
const CONTACT_LIST_WORDS = set("contacts phonebook")

/**
 * Asks about the user's contacts as a list (ENG-753): "show my contacts",
 * "who is in my contacts", "my address book", "my contact list". No intent
 * reads them. As with asksConversion, readGrammar asks only once no rule
 * has read the words, so "send contacts 5" stays a send to someone of that
 * name.
 */
export const asksContacts = (tokens: readonly Token[]): boolean =>
  hasWord(tokens, CONTACT_LIST_WORDS) ||
  indexOfWords(tokens, ["address", "book"]) >= 0 ||
  indexOfWords(tokens, ["contact", "list"]) >= 0

/** Words that ask to move money out to a bank or cash (ENG-753): cashout, not shipped. */
const CASHOUT_WORDS = set("cashout withdraw withdrawing withdrawal")

/**
 * Asks to cash out to a bank or hand (ENG-753): "cash out 5000", "withdraw
 * 100 to my bank", "mi wan cash out". No assistant intent reads them, and
 * the model answers one with a send to a payee it invented ("your bank"),
 * which grounding refuses after a 1-2 s call. A send to a contact of that
 * name still reads first: readGrammar asks only once no rule has read the
 * words.
 */
export const asksCashout = (tokens: readonly Token[]): boolean =>
  hasWord(tokens, CASHOUT_WORDS) ||
  (hasWord(tokens, set("cash")) && hasWord(tokens, set("out outta")))

/**
 * Asks to top up the Flashcard (ENG-753): "top up my card". No intent
 * reads it, and the model answers with a send to a payee it invented
 * ("card"). A send to a contact called Top still reads first, and so does
 * "top up" inside a memo: only an ask no rule reads is refused.
 */
export const asksCardTopUp = (tokens: readonly Token[]): boolean => {
  const top = tokens.findIndex(({ word }) => word === "top")
  return (
    top >= 0 &&
    tokens[top + 1]?.word === "up" &&
    tokens.some(({ word }, i) => i > top + 1 && CARD_WORDS.has(word))
  )
}

/** Words a card ask names the card by. */
const CARD_WORDS = set("card cards flashcard")

/** Words that ask to change a setting or reach the app's own help (ENG-753). */
const SETTINGS_WORDS = set("pin username password notifications backup support")

/**
 * Asks to change a setting or reach help (ENG-753): "change my pin",
 * "contact support", "how do i back up my wallet". No intent reads them;
 * the model answered "change my pin" with a send to "your_payee", which
 * grounding refused. Read only once no rule has read the words, so "pay
 * support 5" stays a send and "pin 1234" (if a rule ever reads one) too.
 */
export const asksSettings = (tokens: readonly Token[]): boolean => {
  const change = tokens.findIndex(({ word }) => CHANGE_WORDS.has(word))
  const named = tokens.findIndex(({ word }) => SETTINGS_WORDS.has(word))
  return named >= 0 && (change >= 0 || tokens.some(({ word }) => SETTING_HELP.has(word)))
}

/** Words that carry a settings ask to its target ("change", "how do i"). */
const SETTING_HELP = set("backup set change how contact")

/** Words that ask where a price is heading, not what it is (ENG-753). */
const TREND_WORDS = set("going rising falling up down climbing dropping")

/**
 * Asks where a price is heading ("is bitcoin going up"), not what it is
 * (ENG-753). The model answers one with a price read for a currency it
 * named, which the ENG-753 currency drop would then turn into the display
 * currency's price: an answer to another question. Refused before the
 * model; a price ask still reads first, and "are we up" (no price noun)
 * is not one of these.
 */
export const asksPriceTrend = (tokens: readonly Token[]): boolean => {
  const trend = tokens.some(({ word }) => TREND_WORDS.has(word))
  const priced = tokens.some(({ word }) =>
    ["bitcoin", "btc", "price", "market", "it"].includes(word),
  )
  return trend && priced
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

/** The indexes of the tokens that are part of an amount (amountRuns). */
export const indexesInAmounts = (
  tokens: readonly Token[],
  ctx: GrammarContext,
): ReadonlySet<number> =>
  new Set(
    amountRuns(tokens, ctx).flatMap(({ start, end }) =>
      Array.from({ length: end - start }, (_, offset) => start + offset),
    ),
  )

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
 * Words for more than one payee, held in one place (ENG-751): the grammar
 * never reads one as a name (NOT_A_NAME), and the model tier's group check
 * reads each as a group's send (GROUP_WORDS). The grammar has no group-send
 * rule, so this is the list of its own that the check reuses.
 */
const MORE_THAN_ONE_PAYEE = "between split each everyone everybody people"

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
    `and or plus with all someone somebody anyone anybody ${MORE_THAN_ONE_PAYEE} ` +
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

/** Whether a word, as the rules match it, never names a contact (NOT_A_NAME). */
export const neverNames = (word: string): boolean => NOT_A_NAME.has(word)

/**
 * Whether a word can be part of a contact's name, as nameOf reads one: a
 * NAME_WORD as typed, and not a word that never names one. The model tier
 * reads names with it too (ENG-751): a second person in a send.
 */
export const isNameWord = ({ word, raw }: Token): boolean =>
  !neverNames(word) && NAME_WORD.test(raw)

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
  if (words.some((token) => !isNameWord(token))) return "refuse"
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

/**
 * Whether a word, as the rules match it, says what a payment is for and is
 * never read as a person (ENG-751): one of PURPOSE_WORDS but the names among
 * them (PURPOSE_NAMES), so "taxi" and never "bill".
 */
export const isPurposeOnly = (word: string): boolean =>
  PURPOSE_WORDS.has(word) && !PURPOSE_NAMES.has(word)

/** Words of a time, which make an ask one v1 does not serve ("next week", "every month"). */
export const TIME_WORDS = set(
  "tomorrow tonight later next week weeks month months year every daily weekly monthly " +
    "yesterday monday tuesday wednesday thursday friday saturday sunday",
)

/** Follow-ups: v1 parses every utterance on its own (spec §7.2). */
export const FOLLOW_UP_WORDS = set("again more another same back extra rest also too")

/** Words that point back at the thread: "again", "same", "repeat". */
const THREAD_POINTERS = set("again same repeat redo another more")

/**
 * Words that name nothing new beside a pointer: "do that again", "same ting
 * again", "one more time", "same as before", patois "dweet again" (do it
 * again). "Ting" reaches here as "thing" (folds.ts).
 */
const THREAD_FILLERS = set(
  "do did does it that this the one thing time as before last over dweet dat now please",
)

/**
 * A reference to the thread with nothing new in it (ENG-749): "same ting
 * again", "do that again", "again", "one more time", once its frame is
 * stripped. Only the thread knows what it points at, and the thread's own
 * controls issue a call again (a card's Try again or Refresh, a question's
 * pick), so the on-device model is never asked about one: a model reads it
 * as whatever call it likes ("same ting again" was a balance read to the
 * macOS model). Anything else in the words ("same again for bob") is not
 * one.
 */
export const refersToThreadOnly = (tokens: readonly Token[]): boolean =>
  tokens.some(({ word }) => THREAD_POINTERS.has(word)) &&
  tokens.every(({ word }) => THREAD_POINTERS.has(word) || THREAD_FILLERS.has(word))

/** Pronouns that stand for a person. */
export const PERSON_PRONOUNS = set("him her them they it she he us im yall unu")

// ---------------------------------------------------------------------------
// Groups and dates, which the on-device model's calls are held to (ENG-751)
// ---------------------------------------------------------------------------

/**
 * Words that make a send more than one person's, whoever the model names as
 * its payee (ENG-751): a split or a share ("split", "between", "among",
 * "amongst", "half", "halves"), each or both of them, everyone, people, and
 * the plural pronouns "us" (as in "all of us") and "them", which patois
 * "dem" folds to. The words for more than one payee are NOT_A_NAME's own
 * (MORE_THAN_ONE_PAYEE), and "us" and "them" are its pronouns, so the
 * grammar never takes one for a payee's name either. "among" and "amongst"
 * are the group check's alone: in NOT_A_NAME they would change what the
 * grammar reads. "and", "or", "with" and "all" are not here: each is in a
 * send to one person as often ("hook bob up with 5"), and two people joined
 * by a connector are namesTwoPeople's.
 */
export const GROUP_WORDS = set(
  `${MORE_THAN_ONE_PAYEE} among amongst splits splitting both half halves us them`,
)

/** Words for a person that are no name: the user, the one they ask, a pronoun. */
const PERSON_WORDS: ReadonlySet<string> = new Set([
  ...PERSON_PRONOUNS,
  "i",
  "me",
  "you",
  "yourself",
])

/**
 * Whether a word stands for a person in a send: one that can be part of a
 * name (isNameWord) and is not part of an amount, a frame's word, a verb, a
 * placeholder for an amount, a unit, or a word for what a payment is for;
 * or a word for a person that is no name ("me", "him"), patois "mi" (me)
 * included, which reaches the rules as "my".
 */
const isPerson = (token: Token, inAmount: boolean, ctx: GrammarContext): boolean => {
  if (inAmount) return false
  if (PERSON_WORDS.has(token.word) || token.raw.toLowerCase() === "mi") return true
  return (
    isNameWord(token) &&
    !FRAME_WORDS.has(token.word) &&
    !VERBS.has(token.word) &&
    !AMOUNT_PLACEHOLDERS.has(token.word) &&
    !isUnit(token.word, ctx) &&
    !isPurposeOnly(token.word)
  )
}

/**
 * Words that join two people: "and", "or" and "plus" ("&" and "+" reach
 * here as "and"), patois "an" and chat "n" ("tanya n kemar").
 */
const joinsPeople = ({ word }: Token): boolean =>
  CONNECTORS.has(word) || word === "an" || word === "n"

/**
 * Whether the words name two people as one ask (ENG-751): two joined by a
 * connector ("tanya and kemar", "mom & dad", "bob or alice", patois "mi an
 * jason") or by a comma ("bob, tanya"), a "my" or "the" before the second
 * aside ("bob and my sister"). A person is read as nameOf reads a name it
 * does not know (isNameWord), so this needs no address book. An amount is
 * never a person ("$5 and $10"), and the words are the ask without its frame
 * (stripFrame), so "send $5 to bob, please" names one.
 */
export const namesTwoPeople = (
  tokens: readonly Token[],
  ctx: GrammarContext,
): boolean => {
  const inAmount = indexesInAmounts(tokens, ctx)
  const person = (i: number): boolean =>
    i >= 0 && i < tokens.length && isPerson(tokens[i], inAmount.has(i), ctx)
  // The second person's word, past a "my" or "the" before it. Patois "mi"
  // stands for "me" as often as for "my", so it is a person itself.
  const second = (i: number): number => {
    const owner = tokens[i]
    const skips =
      owner !== undefined &&
      (owner.word === "my" || owner.word === "the") &&
      owner.raw.toLowerCase() !== "mi"
    return skips ? i + 1 : i
  }
  return tokens.some(
    (token, i) =>
      (joinsPeople(token) && person(i - 1) && person(second(i + 1))) ||
      (token.comma === true && person(i) && person(second(i + 1))),
  )
}

/** The months, by name. */
const MONTHS = set(
  "january february march april june july august september october november december",
)

/**
 * "may", and the months' short forms, which name a month only beside a
 * number ("may 5", "5 oct"): "may" opens a question as often, and "jan" is
 * a name.
 */
const MONTHS_BESIDE_A_NUMBER = set("may jan feb mar apr jun jul aug sep sept oct nov dec")

/**
 * Words of a date or a stretch of time (ENG-751): the times a send refuses
 * (TIME_WORDS) but "every", which opens a list as often ("every payment to
 * bob"); today, tonight, a day, an hour, a weekend, years, "ago" and
 * "since"; the parts of a day; the months; and patois "tideh" (today),
 * "yessideh" and "yesside" (yesterday) and "mont" (month), which await the
 * same native-speaker review as the patois corpus.
 */
const DATE_WORDS: ReadonlySet<string> = new Set([
  ...[...TIME_WORDS].filter((word) => word !== "every"),
  ...set(
    "today todays tonights yesterdays day days hour hours weekend weekends years ago " +
      "since morning afternoon evening night",
  ),
  ...MONTHS,
  ...set("tideh yessideh yesside mont"),
])

/** A date written in numbers: "10/15", "15/10/2026", "2026-10-15". */
const DATE_NUMBERS = /^\d{1,4}[/-]\d{1,2}(?:[/-]\d{1,4})?$/

/** A day of the month: "1st", "22nd", "15th". */
const ORDINAL_DAY = /^\d{1,2}(?:st|[nr]d|th)$/

/** A year. */
const YEAR = /^(?:19|20)\d{2}$/

/** Words before a year that make it one: "in 2025", "from 2024 to 2025". */
const BEFORE_A_YEAR = set("in since during until till before after from to")

const holdsNumber = (token: Token | undefined): boolean =>
  token !== undefined && /^\d/.test(token.word)

/**
 * Whether the words name a date or a stretch of time (ENG-751), which no
 * history read can filter by: a word of one ("yesterday", "this month",
 * "last week", "since monday", "september"), a date in numbers or a day of
 * the month ("10/15", "the 15th"), "may" or a month's short form beside a
 * number, a year after "in", "since", "from", "to" and the like or after a
 * month ("in 2025", "from 2024 to 2025", "june 2025"), or "between" right
 * before a word that starts a number, as the grammar reads one
 * (NUMBER_START, "$50" and "j$500" included), whatever joins the span: a
 * span of years ("between 2024 and 2025", "between 2024-2025"), which no
 * other word marks, or of amounts ("between 500 and 1000", "between 500 to
 * 1000", "between $50 and $100"), which no read filters by either. A span
 * of days, months or dates is a date by its own words, and "between me and
 * kemar" is a read filtered by a contact, not a date, wherever a count
 * stands ("between me and kemar, last 5"). "last" on its own is no date:
 * "my last 5 payments" is a count.
 */
export const namesDate = (tokens: readonly Token[]): boolean =>
  tokens.some(({ word }, i) => {
    const before = tokens[i - 1]
    const after = tokens[i + 1]
    return (
      DATE_WORDS.has(word) ||
      DATE_NUMBERS.test(word) ||
      ORDINAL_DAY.test(word) ||
      (MONTHS_BESIDE_A_NUMBER.has(word) && (holdsNumber(before) || holdsNumber(after))) ||
      (YEAR.test(word) &&
        before !== undefined &&
        (BEFORE_A_YEAR.has(before.word) ||
          MONTHS.has(before.word) ||
          MONTHS_BESIDE_A_NUMBER.has(before.word))) ||
      (word === "between" && NUMBER_START.test(after?.word ?? ""))
    )
  })
