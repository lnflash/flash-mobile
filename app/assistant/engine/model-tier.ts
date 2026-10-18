import { normalize } from "../grammar/normalize"
import { amountRuns, readAmount } from "../grammar/words"
import { CONTACT_PICK_PREFIX } from "../registry/actions/shared/payee"
import type { Registry, RegisteredTool } from "../registry/define"
import type { Intent } from "../registry/types"
import type { ThreadEntry, ThreadStore } from "../ui/thread-store"
import type { AmountPhraseContext } from "./amount-phrase"
import { routeIntent, ToolCall } from "./intent-router"
import { MODEL_RESPONSE_TIMEOUT_MS, ModelAdapter } from "./model-adapter"
import { buildModelPrompt, modelTierRegistry } from "./model-prompt"
import { AMOUNT_PATTERN } from "./parse-amount"
import { isPlainObject, JsonSchema } from "./schema-validator"

// The on-device model tier (ENG-690, spec §7): the one place the dispatch
// order reserves for it, after the grammar has missed. It asks the model for
// at most one call and trusts none of it:
//
// 1. The native availability check, every turn. It is the authority, not the
//    coverage heuristic (app/utils/on-device-model-coverage.ts).
// 2. The prompt (model-prompt.ts) and the model's decision, within the
//    timeout. No answer, or none, is no call.
// 3. The router, unmodified, as a pre-check, over the model tier's tools
//    only (modelTierRegistry: the five shipped intents, ENG-749): a
//    non-object, an intent outside the closed set, outside the model tier's
//    five or with no tool, an extra envelope key, arguments the schema
//    refuses and an amount that does not parse are all refused here. So
//    "convert 20 dollars to btc" is never a conversion, whatever the model
//    answers on a platform that does not hold it to its tool list.
// 4. Grounding (architect decision 4): an action's free-text arguments
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
// 5. The call as the model sent it, intent and raw arguments, for runCall:
//    the router turns amounts into MoneyAmounts, so routed arguments would
//    not route again.
//
// Nothing here throws into the turn: a failure is no call.

/** What the model tier reads from the runtime. */
export type ModelTierRuntime = {
  registry: Registry
  modelAdapter: ModelAdapter
  transcript: Pick<ThreadStore, "get">
}

/**
 * - call: a call the pre-check and the grounding check passed.
 * - rejected: the model answered with a call they refused, and the intent
 *   it named ("unknown" when it named none of the closed set); the turn
 *   reports it with the model's flag set (the model's rejection rate).
 * - none: no model, no answer in time, a failure, or no call in the answer.
 */
export type ModelTierResult =
  | { kind: "call"; call: ToolCall }
  | { kind: "rejected"; reason: "precheck" | "ungrounded"; intent: Intent | "unknown" }
  | { kind: "none"; reason: "unavailable" | "miss" }

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
    if (decision.kind !== "call") return { kind: "none", reason: decision.kind }

    const route = routeIntent(decision.raw, registry)
    // A routed call is a plain object with an intent and, at most, args.
    if (!route.ok || !isPlainObject(decision.raw)) {
      return { kind: "rejected", reason: "precheck", intent: route.intent }
    }
    const args = isPlainObject(decision.raw.args) ? decision.raw.args : {}
    if (!isGrounded(route.tool, args, { ...account, utterance })) {
      return { kind: "rejected", reason: "ungrounded", intent: route.intent }
    }
    return { kind: "call", call: { intent: route.intent, args } }
  } catch (err) {
    console.warn("[assistant] the on-device model tier failed", err)
    return NO_MODEL
  }
}
