import type { Registry, RegisteredTool } from "../registry/define"
import type { Intent } from "../registry/types"
import type { ThreadEntry, ThreadStore } from "../ui/thread-store"
import { routeIntent, ToolCall } from "./intent-router"
import { MODEL_RESPONSE_TIMEOUT_MS, ModelAdapter } from "./model-adapter"
import { buildModelPrompt } from "./model-prompt"
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
// 3. The router, unmodified, as a pre-check: a non-object, an intent outside
//    the closed set or with no tool, an extra envelope key, arguments the
//    schema refuses and an amount that does not parse are all refused here.
// 4. Grounding (architect decision 4): an action's free-text arguments
//    (payees, memos, ids) and its amounts must be in what the person typed,
//    so nothing from the thread, a memo someone else wrote or a contact's
//    name, becomes a payee or an amount on the model's word. Enum arguments
//    are closed sets and pass; read intents move nothing and skip it. It
//    keeps the grammar's v1 boundary: no follow-ups ("send him 10 more"),
//    and no amount the model rewrote ("5k", "five", sats as bitcoin).
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

/** What the person typed, as grounding compares it: lower case, single spaces. */
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

/** The numbers the person typed, each written one way. */
const numbersIn = (utterance: string): Set<string> =>
  new Set(
    utterance.split(/\s+/).flatMap((word) => {
      const number = NUMBER_WORD.exec(word)?.[1]
      const canonical = number === undefined ? undefined : canonicalNumber(number)
      return canonical === undefined ? [] : [canonical]
    }),
  )

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

type Typed = { text: string; numbers: Set<string> }

/** Whether a value of one argument is in what the person typed. */
const groundedValue = (
  value: unknown,
  schema: { field?: JsonSchema; amount: boolean },
  typed: Typed,
): boolean => {
  const { field, amount } = schema
  if (field === undefined) return false
  if (field.type === "array") {
    return (
      Array.isArray(value) &&
      value.every((item) => groundedValue(item, { field: field.items, amount }, typed))
    )
  }
  // A closed set: the schema, not the model, holds every value it can take.
  if (field.enum !== undefined || field.type === "boolean") return true
  const isAmount =
    amount ||
    field.type === "integer" ||
    field.type === "number" ||
    (field.type === "string" && field.pattern === AMOUNT_PATTERN)
  if (isAmount) {
    if (typeof value !== "string" && typeof value !== "number") return false
    const number = canonicalNumber(String(value))
    return number !== undefined && typed.numbers.has(number)
  }
  if (field.type === "string") {
    return typeof value === "string" && holdsWords(typed.text, normalizedText(value))
  }
  // An object, or a shape this check cannot read: not shown to be typed.
  return false
}

/**
 * Whether an action call's arguments are all in what the person typed
 * (case-insensitive, as whole words; amounts as numbers). Read intents move
 * nothing and always pass. Generic over each tool's input schema, so a new
 * action intent is checked without an edit here: today no tool declares
 * `amounts` (define.ts), so a string with the amount pattern is an amount
 * as well.
 */
export const isGrounded = (
  tool: RegisteredTool,
  args: Record<string, unknown>,
  utterance: string,
): boolean => {
  if (tool.tier !== "action") return true
  const typed: Typed = { text: normalizedText(utterance), numbers: numbersIn(utterance) }
  return Object.entries(args).every(([name, value]) =>
    groundedValue(
      value,
      {
        field: tool.input.properties[name],
        amount: Object.prototype.hasOwnProperty.call(tool.amounts, name),
      },
      typed,
    ),
  )
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

/** The on-device model's call for an utterance the grammar missed, checked. */
export const tryOnDeviceModel = async (
  runtime: ModelTierRuntime,
  utterance: string,
): Promise<ModelTierResult> => {
  try {
    if (!(await runtime.modelAdapter.isAvailable())) return NO_MODEL
    const prompt = buildModelPrompt(
      runtime.registry,
      threadBefore(runtime.transcript.get().entries, utterance),
      utterance,
    )
    const decision = await runtime.modelAdapter.decide(prompt, {
      timeoutMs: MODEL_RESPONSE_TIMEOUT_MS,
    })
    if (decision.kind !== "call") return { kind: "none", reason: decision.kind }

    const route = routeIntent(decision.raw, runtime.registry)
    // A routed call is a plain object with an intent and, at most, args.
    if (!route.ok || !isPlainObject(decision.raw)) {
      return { kind: "rejected", reason: "precheck", intent: route.intent }
    }
    const args = isPlainObject(decision.raw.args) ? decision.raw.args : {}
    if (!isGrounded(route.tool, args, utterance)) {
      return { kind: "rejected", reason: "ungrounded", intent: route.intent }
    }
    return { kind: "call", call: { intent: route.intent, args } }
  } catch (err) {
    console.warn("[assistant] the on-device model tier failed", err)
    return NO_MODEL
  }
}
