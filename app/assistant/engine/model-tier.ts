import { directionsSaid, isHistoryWord } from "../grammar/get-transactions"
import { normalize } from "../grammar/normalize"
import {
  amountRuns,
  frameWordsOf,
  GROUP_WORDS,
  hasWord,
  indexesInAmounts,
  isNameWord,
  isPurposeOnly,
  namesDate,
  namesTwoPeople,
  neverNames,
  readAmount,
  refersToThreadOnly,
  stripFrame,
} from "../grammar/words"
import type { ContactRow, GraphqlRail } from "../rails/graphql-rail"
import { CONTACT_PICK_PREFIX } from "../registry/actions/shared/payee"
import type { Registry, RegisteredTool } from "../registry/define"
import { comparable, namesContact } from "../registry/read/resolve-contact"
import type { Intent } from "../registry/types"
import type { ThreadEntry, ThreadStore } from "../ui/thread-store"
import type { AmountPhraseContext } from "./amount-phrase"
import { routeIntent, ToolCall } from "./intent-router"
import { MODEL_RESPONSE_TIMEOUT_MS, ModelAdapter } from "./model-adapter"
import { buildModelPrompt, buildModelWarmup, modelTierRegistry } from "./model-prompt"
import { AMOUNT_PATTERN } from "./parse-amount"
import { isPlainObject, JsonSchema } from "./schema-validator"

// The on-device model tier (ENG-690, spec §7): the one place the dispatch
// order reserves for it, after the grammar has missed. It asks the model for
// at most one call and trusts none of it:
//
// 0. A reference to the thread with nothing new in it ("same ting again",
//    "do that again", "again") is no call, and the model is not asked
//    (ENG-749): only the thread knows what it points at, and the thread's
//    own controls issue a call again (refersToThreadOnly, grammar/words.ts).
// 1. The native availability check, every turn. It is the authority, not the
//    coverage heuristic (app/utils/on-device-model-coverage.ts).
// 2. The prompt (model-prompt.ts) and the model's decision, within the
//    timeout. No answer, or none, is no call. The next ask's session is
//    warmed as soon as this one is decided (prewarmOnDeviceModel, ENG-749).
// 3. The router, unmodified, as a pre-check, over the model tier's tools
//    only (modelTierRegistry: the five shipped intents, ENG-749): a
//    non-object, an intent outside the closed set, outside the model tier's
//    five or with no tool, an extra envelope key, arguments the schema
//    refuses and an amount that does not parse are all refused here. So
//    "convert 20 dollars to btc" is never a conversion, whatever the model
//    answers on a platform that does not hold it to its tool list.
// 4. The guards (ENG-751), each a none with its reason: a send to one payee
//    for an ask about more than one person (groupSend); a history read for
//    an ask that names a date, which no read can filter by (timeFilter), or
//    whose search the person never typed, or that looks only for the ask's
//    own words or an amount (ungroundedFilter). A history read's direction
//    that no word of the ask gives is dropped, not refused. Grounding passed
//    both calls of the 2026-10-18 held-out device run that these stop: every
//    word they used was typed.
// 5. Grounding (architect decision 4): an action's free-text arguments
//    (payees, memos, ids), its amounts with their units, and its other
//    closed-set values (a wallet, a way to be paid) must be in what the
//    person typed, so nothing from the thread, a memo someone else wrote or
//    a contact's name, becomes a payee or an amount on the model's word, and
//    no unit is guessed: an amount is read from the words as the grammar
//    reads one (readAmountPhrase), so "$9" is never 9 BTC, and "$5" on a J$
//    account stays the question the grammar makes it. A read's free text is
//    held to the words too (a history search for "none" is not what was
//    asked); its closed sets pass. It keeps the grammar's v1 boundary: no
//    follow-ups ("send him 10 more"), and no amount the grammar would ask
//    about ("5k"), whatever number the model made of it. No free text may
//    be a picked person's id (`contact:<username>`), even typed: only the
//    thread's re-issue of a pick makes one (spec §8).
// 6. The call as the model sent it, intent and raw arguments (a direction
//    the guards dropped aside), for runCall: the router turns amounts into
//    MoneyAmounts, so routed arguments would not route again.
//
// Nothing here throws into the turn: a failure is no call.

/** What the model tier reads from the runtime. */
export type ModelTierRuntime = {
  registry: Registry
  modelAdapter: ModelAdapter
  transcript: Pick<ThreadStore, "get">
  /**
   * The reads from the app's cache alone: the contacts it holds, which the
   * group check knows people by (ENG-751). The thread's runtime has them;
   * without them (the device eval) the check reads the words alone.
   */
  cachedGraphql?: Pick<GraphqlRail, "contacts">
}

/**
 * Why a guard made the model's call none (ENG-751):
 *
 * - groupSend: a send to one payee for an ask about more than one person;
 * - timeFilter: a history read for an ask that names a date;
 * - ungroundedFilter: a history read whose search the person never typed,
 *   or that looks only for the ask's own words or an amount.
 */
export type ModelGuardReason = "groupSend" | "timeFilter" | "ungroundedFilter"

/**
 * - call: a call the pre-check, the guards and the grounding check passed.
 * - rejected: the model answered with a call the pre-check or grounding
 *   refused, and the intent it named ("unknown" when it named none of the
 *   closed set); the turn reports it with the model's flag set (the model's
 *   rejection rate) and the reason.
 * - none: no model, no answer in time, a failure, or no call in the
 *   answer; or a reference to the thread alone, which the model is never
 *   asked about ("thread"); or a call a guard made none (ENG-751): the
 *   model answered an ask no call serves (a group's send, a read by date)
 *   or with a search the person never asked for, so no call is the answer.
 *   A guard's none carries the intent the model named, and the turn reports
 *   it as it reports a refused call, with the model's flag and the reason.
 */
export type ModelTierResult =
  | { kind: "call"; call: ToolCall }
  | { kind: "rejected"; reason: "precheck" | "ungrounded"; intent: Intent | "unknown" }
  | { kind: "none"; reason: "unavailable" | "miss" | "thread" }
  | { kind: "none"; reason: ModelGuardReason; intent: Intent }

/**
 * Why the model tier refused a call the model answered with: the pre-check,
 * grounding, or a guard (ENG-751). The turn's `assistant_event` carries it
 * (AssistantEventParams.onDeviceModelReason, app/utils/analytics.ts).
 */
export type ModelRefusalReason =
  | Extract<ModelTierResult, { kind: "rejected" }>["reason"]
  | ModelGuardReason

/**
 * The call the model answered with that the model tier refused, the intent
 * it named, and why (ENG-751): a rejected call, or a guard's none.
 * Undefined when the model answered no call, or was never asked.
 */
export const refusalOf = (
  result: ModelTierResult,
): { intent: Intent | "unknown"; reason: ModelRefusalReason } | undefined => {
  if (result.kind === "rejected") return { intent: result.intent, reason: result.reason }
  if (result.kind === "none" && "intent" in result) {
    return { intent: result.intent, reason: result.reason }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

/** What the person typed, and the account they typed it on, as grounding reads them. */
export type Said = AmountPhraseContext & { utterance: string }

/** What the person typed, lower case, with single spaces. */
const normalizedText = (text: string): string =>
  text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase()

/**
 * A word of the utterance that is a number: digits with an optional decimal
 * part or thousands commas, behind an optional currency sign (with up to
 * three letters before it, as in J$ or TT$) and before closing punctuation.
 * A word with letters in it ("5k", "bob123", "10usd") is not one.
 */
const NUMBER_WORD =
  /^\(?(?:[A-Za-z]{0,3}[$€£¥₿])?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)[)\].,!?;:]*$/

/** A decimal number written one way: no commas, no leading or trailing zeros. */
export const canonicalNumber = (text: string): string | undefined => {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.replace(/,/g, ""))
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return undefined
  const whole = match[1].replace(/^0+(?=\d)/, "") || "0"
  const fraction = (match[2] ?? "").replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole
}

/** A letter or a digit, in any script, as the grammar reads words (normalize.ts). */
const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}_]/u.test(char)

/** Whether `words` stand in `text` as whole words: "bob" in "pay bob's", never in "bobby". */
const holdsWords = (text: string, words: string): boolean => {
  if (words === "") return false
  let at = text.indexOf(words)
  while (at >= 0) {
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + words.length])) return true
    at = text.indexOf(words, at + 1)
  }
  return false
}

/**
 * The words that name each closed-set value an action takes (a currency or
 * a wallet, the way to be paid), as the grammar names them (words.ts,
 * amount-phrase.ts). "Dollars", "bucks" and "$" name USD only on an account
 * whose display currency is USD: elsewhere they are a question
 * (readAmountPhrase), never a guess. A value no word names here is never
 * shown to be typed.
 */
const VALUE_WORDS: Readonly<Record<string, readonly string[]>> = {
  BTC: ["btc", "bitcoin", "bitcoins", "sat", "sats", "satoshi", "satoshis"],
  USD: ["usd", "us$"],
  USDT: ["usdt", "tether"],
  lightning: ["lightning", "invoice", "bolt11"],
  onchain: ["onchain", "on-chain", "address"],
}
const USD_ACCOUNT_WORDS = ["dollar", "dollars", "buck", "bucks"]

/** The closed-set values the person's words name. */
const valuesNamed = (text: string, { displayCurrency }: Said): Set<string> => {
  const named = new Set(
    Object.keys(VALUE_WORDS).filter((value) =>
      VALUE_WORDS[value].some((word) => holdsWords(text, word)),
    ),
  )
  // Signs that stand against a number: "₿0.001", "us$5".
  if (text.includes("₿")) named.add("BTC")
  if (text.includes("us$")) named.add("USD")
  // A bare "$", not part of J$ or TT$: USD only on a USD account.
  const bareDollar = /(^|[^a-z])\$/.test(text)
  if (
    displayCurrency === "USD" &&
    (bareDollar || USD_ACCOUNT_WORDS.some((word) => holdsWords(text, word)))
  ) {
    named.add("USD")
  }
  return named
}

type TypedAmount = { amount: string; currency: string }

/**
 * Every amount the person typed, as the grammar reads it (amountRuns,
 * readAmountPhrase): its number, and its currency, which is the display
 * currency when the words name none. An amount the grammar would ask about
 * ("5k", "$5" on a J$ account) is not one.
 */
const amountsTyped = (said: Said): TypedAmount[] => {
  const { tokens } = normalize(said.utterance)
  return amountRuns(tokens, said).flatMap((run) => {
    const phrase = readAmount(tokens, run, said)
    if (phrase.kind !== "amount") return []
    const amount = canonicalNumber(phrase.amount)
    return amount === undefined
      ? []
      : [{ amount, currency: phrase.currency ?? said.displayCurrency }]
  })
}

type Typed = {
  text: string
  /** Every number typed, written one way, for an integer argument. */
  numbers: Set<string>
  amounts: TypedAmount[]
  values: Set<string>
}

const readTyped = (said: Said): Typed => {
  const text = normalizedText(said.utterance)
  return {
    text,
    numbers: new Set(
      said.utterance.split(/\s+/).flatMap((word) => {
        const number = NUMBER_WORD.exec(word)?.[1]
        const canonical = number === undefined ? undefined : canonicalNumber(number)
        return canonical === undefined ? [] : [canonical]
      }),
    ),
    amounts: amountsTyped(said),
    values: valuesNamed(text, said),
  }
}

/**
 * How strictly one call's arguments are held to the words: an action's
 * closed-set values must be named; a read's pass, since a read moves
 * nothing and every choice of its sets answers what the person asked.
 */
type Check = { typed: Typed; closedSetsPass: boolean }

/** Whether a value of one argument, not an amount or its currency, is in what the person typed. */
const valueTyped = (
  value: unknown,
  field: JsonSchema | undefined,
  check: Check,
): boolean => {
  if (field === undefined) return false
  if (field.type === "array") {
    return (
      Array.isArray(value) && value.every((item) => valueTyped(item, field.items, check))
    )
  }
  // A currency, a wallet, a way to be paid: named in the words, never only
  // picked by the model from the schema's choices.
  if (field.enum !== undefined) {
    return (
      check.closedSetsPass || (typeof value === "string" && check.typed.values.has(value))
    )
  }
  if (field.type === "integer" || field.type === "number") {
    const number = canonicalNumber(String(value))
    return (
      typeof value === "number" && number !== undefined && check.typed.numbers.has(number)
    )
  }
  if (field.type === "string") {
    // A picked person's id (`contact:<username>`), however the words hold
    // it: only the thread's re-issue of a pick makes one (spec §8), and
    // resolvePayee takes it as that person with no question. Read as
    // resolvePayee reads it: trimmed, in any case.
    return (
      typeof value === "string" &&
      !value.trim().toLowerCase().startsWith(CONTACT_PICK_PREFIX) &&
      holdsWords(check.typed.text, normalizedText(value))
    )
  }
  // A flag or an object: nothing in the words can show the model did not make it up.
  return field.type === "boolean" && check.closedSetsPass
}

/** An action tool's amount fields, each with the field that holds its currency, if it has one. */
const amountFieldsOf = (tool: RegisteredTool): Map<string, string | undefined> => {
  const { properties } = tool.input
  const has = (name: string) => Object.prototype.hasOwnProperty.call(properties, name)
  const amounts = new Map<string, string | undefined>()
  Object.keys(properties).forEach((name) => {
    const declared = Object.prototype.hasOwnProperty.call(tool.amounts, name)
    const field = properties[name]
    const isAmount =
      declared || (field.type === "string" && field.pattern === AMOUNT_PATTERN)
    if (isAmount) {
      // No tool declares its amounts yet (define.ts): each names its
      // amount's currency `currency`.
      const currency = declared ? tool.amounts[name] : "currency"
      amounts.set(name, has(currency) ? currency : undefined)
    }
  })
  return amounts
}

/**
 * Whether a call's arguments are all in what the person typed: free text as
 * whole words, case aside, and numbers as typed. An action's amount comes
 * with its currency as the grammar would read the words (the display
 * currency when the call names none), so the model can neither invent an
 * amount nor a unit for one, and every other closed-set value it takes (a
 * wallet, a way to be paid) must be named in the words. A read moves
 * nothing, so its closed sets pass; its free text is held to the words all
 * the same, because a filter the person never named answers another
 * question, and an empty search reads as "you never paid them" (spec
 * v0.2.13, history search). Generic over each tool's input schema, so a
 * new intent is checked without an edit here.
 */
export const isGrounded = (
  tool: RegisteredTool,
  args: Record<string, unknown>,
  said: Said,
): boolean => {
  const typed = readTyped(said)
  if (tool.tier !== "action") {
    const check = { typed, closedSetsPass: true }
    return Object.entries(args).every(([name, value]) =>
      valueTyped(value, tool.input.properties[name], check),
    )
  }
  const amountFields = amountFieldsOf(tool)
  const unitFields = new Set(
    [...amountFields].flatMap(([amount, currency]) =>
      args[amount] !== undefined && currency !== undefined ? [currency] : [],
    ),
  )
  return Object.entries(args).every(([name, value]) => {
    if (amountFields.has(name)) {
      const currencyField = amountFields.get(name)
      const named = currencyField === undefined ? undefined : args[currencyField]
      const amount = typeof value === "string" ? canonicalNumber(value) : undefined
      const currency = typeof named === "string" ? named : said.displayCurrency
      return typed.amounts.some((typedAmount) => {
        return typedAmount.amount === amount && typedAmount.currency === currency
      })
    }
    // A currency that goes with an amount was checked with it.
    if (unitFields.has(name)) return true
    return valueTyped(value, tool.input.properties[name], {
      typed,
      closedSetsPass: false,
    })
  })
}

// ---------------------------------------------------------------------------
// Guards (ENG-751)
// ---------------------------------------------------------------------------

/** A call through the guards: its arguments, or none and why. */
type Guarded =
  | { kind: "pass"; args: Record<string, unknown> }
  | { kind: "none"; reason: ModelGuardReason }

/**
 * The contacts the app's cache holds (ModelTierRuntime.cachedGraphql), or
 * none: with no cache to read (the device eval), or no list in it, the
 * group check reads the words alone. It never waits on the network.
 */
const cachedContacts = async (
  runtime: ModelTierRuntime,
): Promise<readonly ContactRow[]> => {
  try {
    const contacts = await runtime.cachedGraphql?.contacts()
    return Array.isArray(contacts) ? contacts : []
  } catch {
    return []
  }
}

/** What the person typed, word by word, as resolveContact compares names; "alice's" is alice. */
const comparableWords = (utterance: string): string =>
  normalize(utterance)
    .tokens.map(({ raw }) => comparable(raw.replace(/['’]s$/i, "")))
    .filter((word) => word !== "")
    .join(" ")

/** `text` with each whole-word `words` in it cut out. */
const withoutWords = (text: string, words: string): string => {
  if (words === "") return text
  let rest = text
  let at = rest.indexOf(words)
  while (at >= 0) {
    if (!isWordChar(rest[at - 1]) && !isWordChar(rest[at + words.length])) {
      rest = `${rest.slice(0, at)}|${rest.slice(at + words.length)}`
    }
    at = rest.indexOf(words, at + 1)
  }
  return rest
}

/**
 * The names a contact goes by, compared as resolveContact compares them:
 * its username, its alias, and each word of its alias, which names it
 * alone (namesContact: "joe" for Uncle Joe). A word of the alias counts
 * only when the grammar could read it as part of a person's name: a name
 * word (isNameWord), never "the", the determiner nameOf skips, and never a
 * word for what a payment is for, which the grammar never reads as a
 * person (isPurposeOnly). So never a word that names no one as the grammar
 * reads it once folded, whether "my" in "My Mom", patois "mi" (my) in "Mi
 * Madda", "di" (the) in "Di Boss", "the" in "The Barber" or "taxi" in
 * "Taxi Man". The whole alias counts only when one of its words does: a
 * one-word alias that folds to such a word ("Fi", "Di", "Mi") would
 * otherwise name the contact in every patois ask that holds it, while an
 * alias of initials ("J B") names its contact whole, though no one letter
 * does.
 */
const namesOfContact = ({ username, alias }: ContactRow): string[] => {
  const aliasWords = alias
    ? normalize(alias)
        .tokens.filter(
          (token) =>
            isNameWord(token) && token.word !== "the" && !isPurposeOnly(token.word),
        )
        .map(({ raw }) => comparable(raw))
    : []
  const wholeAlias = alias && aliasWords.length > 0 ? [comparable(alias)] : []
  return [comparable(username), ...wholeAlias, ...aliasWords].filter(
    (name) => name.length > 1 && !neverNames(name),
  )
}

/**
 * Whether the words name a contact the account knows other than the payee:
 * its username, its alias or a word of its alias, as whole words outside
 * the payee's own words. A contact the payee names (namesContact) is the
 * payee.
 */
const namesAnotherContact = (
  utterance: string,
  payee: string,
  contacts: readonly ContactRow[],
): boolean => {
  if (contacts.length === 0) return false
  const rest = withoutWords(comparableWords(utterance), comparable(payee))
  return contacts.some(
    (contact) =>
      !namesContact(payee, contact) &&
      namesOfContact(contact).some((name) => holdsWords(rest, name)),
  )
}

/**
 * Whether a send to one payee answers an ask about more than one person
 * (groupSend): the ask holds a group word ("split", "between", "each",
 * "both", "everyone", "us", patois "dem"; GROUP_WORDS), two people joined
 * as one ask ("tanya and kemar", patois "mi an jason"; namesTwoPeople), or
 * more than one amount (two payments, or a question the grammar would ask,
 * never one send), or it names a contact the account knows besides the
 * payee, anywhere, a memo included. A single payee for a group's ask moves
 * the whole amount to one person: the 2026-10-18 held-out device run had
 * $20 split between two named people answered as a $20 send to the first.
 * The grammar's own refusals stand as they are.
 */
const isGroupAsk = async (
  args: Record<string, unknown>,
  said: Said,
  runtime: ModelTierRuntime,
): Promise<boolean> => {
  const tokens = stripFrame(normalize(said.utterance).tokens)
  if (
    hasWord(tokens, GROUP_WORDS) ||
    namesTwoPeople(tokens, said) ||
    amountRuns(tokens, said).length > 1
  ) {
    return true
  }
  return (
    typeof args.payee === "string" &&
    namesAnotherContact(said.utterance, args.payee, await cachedContacts(runtime))
  )
}

/**
 * Whether a history search looks for something the person named: a word of
 * it that names someone or something, not one that names no one
 * (NOT_A_NAME), one a history ask is made of ("payments", "received",
 * "biggest", "over"; isHistoryWord), one of the ask's frame ("show" in "show
 * my earnings"; frameWordsOf), a date's, or part of an amount, read in the
 * person's account as the grammar reads one (amountRuns): a search for "50"
 * or "over $50" looks for the size of a payment, which no read filters by,
 * not a name or a memo's text. "invoice 2041" looks for one.
 */
const looksForSomething = (query: string, said: Said): boolean => {
  const { tokens } = normalize(query)
  const inAmount = indexesInAmounts(tokens, said)
  const frame = frameWordsOf(normalize(said.utterance).tokens)
  return tokens.some(
    (token, i) =>
      !inAmount.has(i) &&
      !frame.has(token.word) &&
      !neverNames(token.word) &&
      !isHistoryWord(token.word) &&
      !namesDate([token]),
  )
}

/**
 * A history read, held to the words. A date anywhere in the ask makes it
 * none (timeFilter): getTransactions has no date filter, so a read would
 * answer for a stretch of time other than the one asked about, or search
 * payees and memos for the date's words, as the 2026-10-18 held-out device
 * run's model did for "this month". A direction no word of the ask gives
 * (directionsSaid) is dropped, not refused. A search must be in the words,
 * as typed, and look for a contact, a username or a memo's text, not only
 * the ask's own words or an amount ("my payments", "money i received",
 * "over $50") (ungroundedFilter): a search for what no payment holds reads
 * as "you never paid them".
 */
const guardHistory = (args: Record<string, unknown>, said: Said): Guarded => {
  const tokens = normalize(said.utterance).tokens
  if (namesDate(tokens)) return { kind: "none", reason: "timeFilter" }
  const { direction, ...withoutDirection } = args
  const given =
    direction === undefined ||
    ((direction === "SEND" || direction === "RECEIVE") &&
      directionsSaid(tokens).has(direction))
  const kept = given ? args : withoutDirection
  const { query } = kept
  const searched =
    query === undefined ||
    (typeof query === "string" &&
      holdsWords(normalizedText(said.utterance), normalizedText(query)) &&
      looksForSomething(query, said))
  return searched
    ? { kind: "pass", args: kept }
    : { kind: "none", reason: "ungroundedFilter" }
}

/**
 * The model's call through the guards: a send to one payee and a history
 * read, each held to what the person asked. Every other call passes as it
 * came.
 */
const guardCall = async (
  { intent, args }: { intent: Intent; args: Record<string, unknown> },
  said: Said,
  runtime: ModelTierRuntime,
): Promise<Guarded> => {
  if (intent === "prepareSend" && (await isGroupAsk(args, said, runtime))) {
    return { kind: "none", reason: "groupSend" }
  }
  return intent === "getTransactions" ? guardHistory(args, said) : { kind: "pass", args }
}

// ---------------------------------------------------------------------------
// The tier
// ---------------------------------------------------------------------------

/** The thread before this turn: the request's own line, appended first, left out. */
const threadBefore = (
  entries: readonly ThreadEntry[],
  utterance: string,
): readonly ThreadEntry[] => {
  const last = entries[entries.length - 1]
  return last?.kind === "user" && last.text === utterance ? entries.slice(0, -1) : entries
}

const NO_MODEL: ModelTierResult = { kind: "none", reason: "unavailable" }

/**
 * Warm the on-device model's next session (ENG-749): when the model can
 * answer now, hand the native side the instructions every request carries,
 * sending nothing. iOS makes a session for them and processes them in
 * advance, so the next request, once that warm-up has finished, pays only
 * for its own words. Android's warm-up loads the model only (ML Kit's
 * warmup() takes no instructions), and each request still reads the
 * instructions within its own time; ML Kit's CachedContext is the
 * follow-up. Ask Flash calls it when it opens, and tryOnDeviceModel after
 * each request the model was asked, so each ask in the thread finds one
 * started before it: a session is never reused across asks, since one that
 * answered holds that turn's words. The caller asks only while both flags
 * are on. It never throws, reports no event of its own, and does nothing
 * without a model.
 */
export const prewarmOnDeviceModel = async (
  runtime: Pick<ModelTierRuntime, "registry" | "modelAdapter">,
): Promise<void> => {
  try {
    if (!(await runtime.modelAdapter.isAvailable())) return
    await runtime.modelAdapter.prewarm(buildModelWarmup(runtime.registry))
  } catch {
    // Best effort: a request that finds no warm session starts its own.
  }
}

/**
 * The on-device model's call for an utterance the grammar missed, checked,
 * on the account `account` names (its display currency and symbol), which
 * grounding reads amounts in.
 */
export const tryOnDeviceModel = async (
  runtime: ModelTierRuntime,
  utterance: string,
  account: AmountPhraseContext,
): Promise<ModelTierResult> => {
  try {
    if (refersToThreadOnly(stripFrame(normalize(utterance).tokens))) {
      return { kind: "none", reason: "thread" }
    }
    if (!(await runtime.modelAdapter.isAvailable())) return NO_MODEL
    const registry = modelTierRegistry(runtime.registry)
    const prompt = buildModelPrompt(
      registry,
      threadBefore(runtime.transcript.get().entries, utterance),
      utterance,
    )
    const decision = await runtime.modelAdapter.decide(prompt, {
      timeoutMs: MODEL_RESPONSE_TIMEOUT_MS,
    })
    // This request used the warmed session, or started its own: warm the
    // next one now, after it, never awaited (ENG-749).
    prewarmOnDeviceModel(runtime)
    if (decision.kind !== "call") return { kind: "none", reason: decision.kind }

    const route = routeIntent(decision.raw, registry)
    // A routed call is a plain object with an intent and, at most, args.
    if (!route.ok || !isPlainObject(decision.raw)) {
      return { kind: "rejected", reason: "precheck", intent: route.intent }
    }
    const said = { ...account, utterance }
    const guarded = await guardCall(
      {
        intent: route.intent,
        args: isPlainObject(decision.raw.args) ? decision.raw.args : {},
      },
      said,
      runtime,
    )
    if (guarded.kind === "none") {
      return { kind: "none", reason: guarded.reason, intent: route.intent }
    }
    if (!isGrounded(route.tool, guarded.args, said)) {
      return { kind: "rejected", reason: "ungrounded", intent: route.intent }
    }
    return { kind: "call", call: { intent: route.intent, args: guarded.args } }
  } catch (err) {
    console.warn("[assistant] the on-device model tier failed", err)
    return NO_MODEL
  }
}
