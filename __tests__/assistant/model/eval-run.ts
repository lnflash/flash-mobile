// How a device run of the on-device model scores (ENG-690): what the device
// is handed, how its answer is read, and how it is counted, with the launch
// gate's own count (grammar/score.ts, tally), and its wrong calls split by
// what they would have done (ENG-749): wrong prepared actions and wrong
// reads, the two numbers the model tier's bar is set in (MODEL_TIER_BAR).
// The device eval (device-eval.ts) runs it on a corpus; model-eval.spec.ts
// checks it with a fake model over the tuning corpus. Not a spec itself, and
// it imports no corpus.
import type { ToolCall } from "@app/assistant/engine/intent-router"
import type {
  ModelEvalEntry,
  ModelEvalOutcome,
  ModelEvalRow,
  ModelEvalRun,
} from "@app/assistant/engine/model-eval-hook"
import { canonicalNumber } from "@app/assistant/engine/model-tier"
import { isPlainObject } from "@app/assistant/engine/schema-validator"
import { isIntent, tierOf } from "@app/assistant/registry/types"
import { CorpusEntry, Dialect, DISPLAY_SYMBOL, Expected } from "../grammar/corpus/entries"
import { describeScore, Score, tally } from "../grammar/score"

/** What the device reads for each entry: the utterance and its account, never what it means. */
export const deviceEntries = (entries: readonly CorpusEntry[]): ModelEvalEntry[] =>
  entries.map(({ utterance, displayCurrency }) => ({
    utterance,
    displayCurrency,
    displaySymbol: DISPLAY_SYMBOL[displayCurrency],
  }))

/** The shipped order: the grammar's outcome, unless it missed without refusing; then the model's. */
export const pipelineOutcome = (row: ModelEvalRow): Expected =>
  row.grammar === "miss" && !row.refused ? row.model : row.grammar

const isOutcome = (value: unknown): value is ModelEvalOutcome =>
  value === "miss" ||
  value === "clarifyAmount" ||
  (isPlainObject(value) &&
    typeof value.intent === "string" &&
    (value.args === undefined || isPlainObject(value.args)))

/** A device's answer to `entries`, read and checked: one row per entry, in order. */
export const parseDeviceRun = (
  json: string,
  entries: readonly CorpusEntry[],
): ModelEvalRun => {
  const run: unknown = JSON.parse(json)
  if (
    !isPlainObject(run) ||
    typeof run.available !== "boolean" ||
    !Array.isArray(run.rows)
  ) {
    throw new Error("A device run is { available, rows }")
  }
  if (run.rows.length !== entries.length) {
    throw new Error(`${run.rows.length} rows for ${entries.length} entries`)
  }
  run.rows.forEach((row: unknown, index) => {
    if (
      !isPlainObject(row) ||
      !isOutcome(row.grammar) ||
      typeof row.refused !== "boolean" ||
      !isOutcome(row.model) ||
      typeof row.modelMs !== "number"
    ) {
      throw new Error(`Row ${index} is not { grammar, refused, model, modelMs }`)
    }
  })
  return run as ModelEvalRun
}

/** A score overall and per dialect, as the launch gate reports it. */
export type DialectScores = { all: Score; en: Score; jm: Score }

/**
 * A score's wrong calls, by what each would have done (ENG-749), in two
 * numbers that add up to the score's wrongAction:
 *
 * - preparedAction: a wrong call that prepares (an action tool, prepare*):
 *   one the label does not expect (it means a miss, a question, a read or
 *   another action), or one whose payee, amount, currency or wallet differs
 *   from the label's, compared as the tool reads them (samePreparedAction).
 *   Anything the scorer cannot show to be a read counts here.
 * - read: any other wrong call: a read where none, or another, was meant,
 *   or a prepare that matches its label in all four and differs elsewhere
 *   (a memo, a receive's method, a payee's case).
 */
export type WrongCalls = {
  preparedAction: number
  read: number
  preparedActionRate: number
  readRate: number
}

/** The wrong calls of a score overall and per dialect. */
export type DialectWrongCalls = { all: WrongCalls; en: WrongCalls; jm: WrongCalls }

export type DeviceScores = {
  available: boolean
  /** The model on every entry, the grammar set aside. */
  model: DialectScores
  /** The shipped order: the grammar, then the model on what it missed. */
  pipeline: DialectScores
  /** Each score's wrong calls by consequence (ENG-749), the model tier's bar's terms. */
  wrongCalls: { model: DialectWrongCalls; pipeline: DialectWrongCalls }
  /** The model tier's time per entry, in milliseconds. */
  latency: { p50: number; p95: number; max: number }
}

/**
 * The model tier's bar (ENG-749, the owner's decision of 2026-10-18): on the
 * held-out set, on a real device, in the shipped order (the grammar, then
 * the model on a plain miss), no wrong prepared action at all and at most
 * 0.5% wrong reads. The grammar tier's launch gate (accuracy-gate.spec.ts)
 * is its own and unchanged.
 */
export const MODEL_TIER_BAR = { maxWrongPreparedActions: 0, maxWrongReadRate: 0.005 }

/** Whether wrong calls are within the model tier's bar. */
export const meetsModelTierBar = (wrong: WrongCalls): boolean =>
  wrong.preparedAction <= MODEL_TIER_BAR.maxWrongPreparedActions &&
  wrong.readRate <= MODEL_TIER_BAR.maxWrongReadRate

/** The arguments that say who a prepared action pays (a contact, a group, a bank account). */
const PAYEE_FIELDS = ["payee", "payees", "bankAccountId"]
/** The arguments that hold its amount. */
const AMOUNT_FIELDS = ["amount", "total"]
/** The arguments that name a wallet: the one it pays from or into, a conversion's two. */
const WALLET_FIELDS = ["sourceWallet", "wallet", "from", "to"]

/** A payee as resolveContact matches one: in any case, with single spaces. */
const payeeWords = (value: unknown): unknown => {
  const words = (text: unknown) =>
    typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLowerCase() : text
  // A group's payees share the total equally: their order pays no one else.
  return Array.isArray(value) ? JSON.stringify(value.map(words).sort()) : words(value)
}

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Whether two calls of one action prepare the same money movement: the same
 * payee, amount, currency and wallet, read as the tool reads them. A payee
 * in any case with single spaces (resolveContact matches names so), an
 * amount as a number ("10.00" is 10), and no currency as the account's
 * display currency (requestedAmount). A wallet is compared as named.
 */
export const samePreparedAction = (
  got: ToolCall,
  meant: ToolCall,
  displayCurrency: string,
): boolean => {
  const gotArgs = got.args ?? {}
  const meantArgs = meant.args ?? {}
  const amount = (value: unknown) =>
    typeof value === "string" ? canonicalNumber(value) ?? value : value
  return (
    got.intent === meant.intent &&
    PAYEE_FIELDS.every((field) =>
      sameValue(payeeWords(gotArgs[field]), payeeWords(meantArgs[field])),
    ) &&
    AMOUNT_FIELDS.every((field) =>
      sameValue(amount(gotArgs[field]), amount(meantArgs[field])),
    ) &&
    sameValue(
      gotArgs.currency ?? displayCurrency,
      meantArgs.currency ?? displayCurrency,
    ) &&
    WALLET_FIELDS.every((field) => sameValue(gotArgs[field], meantArgs[field]))
  )
}

/** Whether a wrong call is a wrong prepared action, by WrongCalls' rule. */
export const isWrongPreparedAction = (got: ToolCall, entry: CorpusEntry): boolean => {
  if (isIntent(got.intent) && tierOf(got.intent) === "read") return false
  const meant = entry.expected
  return (
    typeof meant === "string" || !samePreparedAction(got, meant, entry.displayCurrency)
  )
}

/** A score's wrong calls, by consequence. */
export const wrongCallsOf = ({ total, failures }: Score): WrongCalls => {
  let preparedAction = 0
  let read = 0
  failures.forEach(({ entry, got }) => {
    // A miss or a question is no call, so never a wrong one.
    if (typeof got === "string") return
    if (isWrongPreparedAction(got, entry)) preparedAction += 1
    else read += 1
  })
  return {
    preparedAction,
    read,
    preparedActionRate: total === 0 ? 0 : preparedAction / total,
    readRate: total === 0 ? 0 : read / total,
  }
}

const wrongCallsByDialect = (scores: DialectScores): DialectWrongCalls => ({
  all: wrongCallsOf(scores.all),
  en: wrongCallsOf(scores.en),
  jm: wrongCallsOf(scores.jm),
})

/**
 * An outcome with its decimal arguments written one way, so "10.00" and "10"
 * are the same amount: the grammar copies what was typed and a model may
 * write the same number otherwise. Anything else is compared as it is.
 */
export const sameNumbersAs = (outcome: Expected): Expected => {
  if (typeof outcome === "string" || outcome.args === undefined) return outcome
  const args = Object.fromEntries(
    Object.entries(outcome.args).map(([name, value]) => [
      name,
      typeof value === "string" && /^\d*\.?\d+$|^\d+\.$/.test(value)
        ? canonicalNumber(value) ?? value
        : value,
    ]),
  )
  return { intent: outcome.intent, args }
}

const byDialect = (
  corpus: readonly CorpusEntry[],
  answered: readonly Expected[],
): DialectScores => {
  // Both sides with their numbers written one way.
  const entries = corpus.map((entry) => ({
    ...entry,
    expected: sameNumbersAs(entry.expected),
  }))
  const outcomes = answered.map(sameNumbersAs)
  const only = (dialect: Dialect): Score => {
    const kept = entries.flatMap((entry, index) =>
      entry.dialect === dialect ? [index] : [],
    )
    return tally(
      kept.map((index) => entries[index]),
      kept.map((index) => outcomes[index]),
    )
  }
  return { all: tally(entries, outcomes), en: only("en"), jm: only("jm") }
}

/** The nearest-rank percentile `p` (0 to 100) of `values`; 0 for none. */
export const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

/** How a run scored on `entries`: the model alone, the shipped order, and the time. */
export const scoreDeviceRun = (
  entries: readonly CorpusEntry[],
  run: ModelEvalRun,
): DeviceScores => {
  if (run.rows.length !== entries.length) {
    throw new Error(`${run.rows.length} rows for ${entries.length} entries`)
  }
  const times = run.rows.map(({ modelMs }) => modelMs)
  const model = byDialect(
    entries,
    run.rows.map((row) => row.model),
  )
  const pipeline = byDialect(entries, run.rows.map(pipelineOutcome))
  return {
    available: run.available,
    model,
    pipeline,
    wrongCalls: {
      model: wrongCallsByDialect(model),
      pipeline: wrongCallsByDialect(pipeline),
    },
    latency: {
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times.length === 0 ? 0 : Math.max(...times),
    },
  }
}

const withoutFailures = (s: Score): Score => ({ ...s, failures: [] })

const percent = (rate: number): string => `${(rate * 100).toFixed(2)}%`

/** "1 wrong read", "2 wrong reads". */
const counted = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

/** Wrong calls as the PR reports them. */
export const describeWrongCalls = (wrong: WrongCalls): string =>
  [
    `${counted(wrong.preparedAction, "wrong prepared action")} (${percent(
      wrong.preparedActionRate,
    )})`,
    `${counted(wrong.read, "wrong read")} (${percent(wrong.readRate)})`,
  ].join(", ")

/** A score with its wrong calls by consequence on its first line. */
const describeWithWrongCalls = (label: string, s: Score, wrong: WrongCalls): string => {
  const [first, ...failures] = describeScore(label, s).split("\n")
  return [`${first}; ${describeWrongCalls(wrong)}`, ...failures].join("\n")
}

/** The model tier's bar, read on the shipped order's overall score. */
const describeBar = (label: string, scores: DeviceScores): string[] => {
  const wrong = scores.wrongCalls.pipeline.all
  const verdict = meetsModelTierBar(wrong) ? "met" : "NOT met"
  const prepared = scores.pipeline.all.failures.filter(
    ({ entry, got }) => typeof got !== "string" && isWrongPreparedAction(got, entry),
  )
  return [
    `${label}: the model tier's bar (held-out set, real device, grammar then model): ` +
      `${counted(wrong.preparedAction, "wrong prepared action")} (allowed ${
        MODEL_TIER_BAR.maxWrongPreparedActions
      }), ${percent(wrong.readRate)} wrong reads (allowed at most ${percent(
        MODEL_TIER_BAR.maxWrongReadRate,
      )}): ${verdict}`,
    ...prepared.map(
      ({ entry, got }) =>
        `  wrong prepared action: ${entry.dialect}/${
          entry.displayCurrency
        } ${JSON.stringify(entry.utterance)}: meant ${JSON.stringify(
          entry.expected,
        )}, got ${JSON.stringify(got)}`,
    ),
  ]
}

/**
 * A run's scores as the PR reports them: the failures listed once, under
 * each overall line; each line with its wrong calls by consequence; and,
 * last, the model tier's bar, read on the shipped order.
 */
export const describeDeviceRun = (label: string, scores: DeviceScores): string => {
  const { model, pipeline } = scores.wrongCalls
  return [
    `${label}: model available when the run began: ${
      scores.available ? "yes" : "NO, so every model row is a miss"
    }`,
    `${label}: model time p50 ${scores.latency.p50} ms, p95 ${scores.latency.p95} ms, max ${scores.latency.max} ms`,
    describeWithWrongCalls(`${label}, model alone`, scores.model.all, model.all),
    describeWithWrongCalls(
      `${label}, model alone, English`,
      withoutFailures(scores.model.en),
      model.en,
    ),
    describeWithWrongCalls(
      `${label}, model alone, Jamaican patois`,
      withoutFailures(scores.model.jm),
      model.jm,
    ),
    describeWithWrongCalls(
      `${label}, grammar then model`,
      scores.pipeline.all,
      pipeline.all,
    ),
    describeWithWrongCalls(
      `${label}, grammar then model, English`,
      withoutFailures(scores.pipeline.en),
      pipeline.en,
    ),
    describeWithWrongCalls(
      `${label}, grammar then model, Jamaican patois`,
      withoutFailures(scores.pipeline.jm),
      pipeline.jm,
    ),
    ...describeBar(label, scores),
  ].join("\n")
}
