// How a device run of the on-device model scores (ENG-690): what the device
// is handed, how its answer is read, and how it is counted, with the launch
// gate's own count (grammar/score.ts, tally), and its wrong calls split by
// what they would have done (ENG-749): wrong prepared actions and wrong
// reads, the two numbers the model tier's bar is set in (MODEL_TIER_BAR),
// whose verdict is printed for a held-out run in which the model answered
// (whyBarNotJudged).
// The device eval (device-eval.ts) runs it on a corpus; model-eval.spec.ts
// checks it with a fake model over the tuning corpus. Not a spec itself, and
// it imports no corpus.
import type { ToolCall } from "@app/assistant/engine/intent-router"
import type {
  ModelEvalEntry,
  ModelEvalModelResult,
  ModelEvalOutcome,
  ModelEvalRow,
  ModelEvalRun,
  ModelEvalSessions,
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

/** Whether the shipped order asks the model about a row: the grammar missed it without refusing it. */
const asksModel = (row: Pick<ModelEvalRow, "grammar" | "refused">): boolean =>
  row.grammar === "miss" && !row.refused

/** The shipped order: the grammar's outcome, unless it missed without refusing; then the model's. */
export const pipelineOutcome = (
  row: Pick<ModelEvalRow, "grammar" | "refused" | "model">,
): Expected => (asksModel(row) ? row.model : row.grammar)

/**
 * A row as a device answered it. A hook from before ENG-749's per-row
 * results answered no `modelResult`.
 */
export type DeviceRow = Omit<ModelEvalRow, "modelResult"> & {
  modelResult?: ModelEvalModelResult
}

/**
 * A run as a device answered it. A hook from before the warm mode (ENG-749)
 * answered no `sessions`: its asks ran back to back.
 */
export type DeviceRun = Omit<ModelEvalRun, "sessions" | "rows"> & {
  sessions?: ModelEvalSessions
  rows: DeviceRow[]
}

/** The reasons the model tier gives with a result of `Kind` (ModelTierResult). */
type ReasonOf<Kind> = Extract<
  ModelEvalModelResult,
  { kind: Kind; reason: unknown }
>["reason"]

// Every reason the model tier gives for a refused call, and for none.
const REJECTED_REASONS: Record<ReasonOf<"rejected">, true> = {
  precheck: true,
  ungrounded: true,
}
const NONE_REASONS: Record<ReasonOf<"none">, true> = {
  unavailable: true,
  miss: true,
  thread: true,
  groupSend: true,
  timeFilter: true,
  ungroundedFilter: true,
}

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))

const isModelResult = (value: unknown): value is ModelEvalModelResult => {
  if (!isPlainObject(value)) return false
  if (value.kind === "call") return hasOnlyKeys(value, ["kind"])
  const reasons =
    value.kind === "rejected"
      ? REJECTED_REASONS
      : value.kind === "none"
      ? NONE_REASONS
      : undefined
  return (
    reasons !== undefined &&
    hasOnlyKeys(value, ["kind", "reason"]) &&
    typeof value.reason === "string" &&
    Object.prototype.hasOwnProperty.call(reasons, value.reason)
  )
}

const isSessions = (value: unknown): value is ModelEvalSessions =>
  isPlainObject(value) &&
  ((value.mode === "warm" && typeof value.idleMs === "number") || value.mode === "cold")

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
): DeviceRun => {
  const run: unknown = JSON.parse(json)
  if (
    !isPlainObject(run) ||
    typeof run.available !== "boolean" ||
    !Array.isArray(run.rows)
  ) {
    throw new Error("A device run is { available, rows }")
  }
  if (run.sessions !== undefined && !isSessions(run.sessions)) {
    throw new Error(
      'A device run\'s sessions are { mode: "warm", idleMs } or { mode: "cold" }',
    )
  }
  if (run.rows.length !== entries.length) {
    throw new Error(`${run.rows.length} rows for ${entries.length} entries`)
  }
  let recorded = 0
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
    if (row.modelResult === undefined) return
    if (!isModelResult(row.modelResult)) {
      throw new Error(
        `Row ${index}'s modelResult is not { kind: "call" }, ` +
          '{ kind: "rejected", reason } or { kind: "none", reason }',
      )
    }
    // The model's outcome is a call exactly when the model tier's result is one.
    if ((row.modelResult.kind === "call") !== (typeof row.model !== "string")) {
      throw new Error(`Row ${index}'s model and modelResult disagree`)
    }
    recorded += 1
  })
  // One hook wrote every row, so they all record the model tier's result or none does.
  if (recorded !== 0 && recorded !== run.rows.length) {
    throw new Error(`${recorded} of ${run.rows.length} rows record a modelResult`)
  }
  return run as DeviceRun
}

/**
 * The corpora a device run reads (device-eval.ts, MODEL_EVAL_SET). The model
 * tier's bar is judged on the held-out set alone.
 */
export type EvalSet = "tuning" | "held-out"

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

/**
 * What the model tier made of a run's entries (ModelEvalModelResult),
 * counted. The model answered the entries in `call`, `rejected`, `none`
 * and the guards' three (ENG-751), gave no answer on those in `noAnswer`,
 * and was never asked about those in `thread`.
 */
export type ModelResults = {
  /** The entries counted. */
  total: number
  /** A call the pre-check, the guards and grounding passed. */
  call: number
  /** A call the pre-check or grounding refused. */
  rejected: number
  /** The model answered none, or no call. */
  none: number
  /** No answer: no model, a failure, or the time ran out. */
  noAnswer: number
  /** A reference to the thread alone, which the model is not asked about. */
  thread: number
  /** A send to one payee for an ask about more than one person, which a guard made none. */
  groupSend: number
  /** A history read for an ask that names a date, which a guard made none. */
  timeFilter: number
  /** A history read whose search the person never asked for, which a guard made none. */
  ungroundedFilter: number
}

/** How many entries the model answered, a refused call, a guard's none and its own none included. */
const answeredBy = ({
  call,
  rejected,
  none,
  groupSend,
  timeFilter,
  ungroundedFilter,
}: ModelResults): number =>
  call + rejected + none + groupSend + timeFilter + ungroundedFilter

export type DeviceScores = {
  /** Whether the model could answer when the run began. */
  available: boolean
  /** How each ask found the model's session; undefined when the run did not say. */
  sessions: ModelEvalSessions | undefined
  /**
   * What the model tier made of every entry (model) and of the entries the
   * shipped order asks it about (pipeline); undefined when the run did not
   * say.
   */
  modelResults: { model: ModelResults; pipeline: ModelResults } | undefined
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

/** The arguments that name who a prepared action pays: a person, or a group's people. */
const PAYEE_FIELDS = ["payee", "payees"]
/** The argument that says who a cash-out pays: a bank account's id, compared as written. */
const PAYEE_ID_FIELDS = ["bankAccountId"]
/** The arguments that hold its amount. */
const AMOUNT_FIELDS = ["amount", "total"]
/** The arguments that name a wallet: the one it pays from or into, a conversion's two. */
const WALLET_FIELDS = ["sourceWallet", "wallet", "from", "to"]

/**
 * A payee as resolveContact matches one: in any case, with single spaces. A
 * group's payees keep their order, since their order decides who is paid
 * what: the shares hand the leftover minor units out one each in payee-list
 * order from index 0 (spec §5, prepareGroupSend; splitMoneyAmount), and the
 * legs go one at a time and stop at the first that fails. So the same names
 * in another order are another payment.
 */
const payeeWords = (value: unknown): unknown => {
  const words = (text: unknown) =>
    typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLowerCase() : text
  return Array.isArray(value) ? value.map(words) : words(value)
}

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/**
 * Whether two calls of one action prepare the same money movement: the same
 * payee, amount, currency and wallet, read as the tool reads them. A payee's
 * name in any case with single spaces (resolveContact matches names so), a
 * group's payees in their order, a bank account's id as written, an amount
 * as a number ("10.00" is 10), and no currency as the account's display
 * currency (requestedAmount). A wallet is compared as named.
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
    PAYEE_ID_FIELDS.every((field) => sameValue(gotArgs[field], meantArgs[field])) &&
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

/** The count each reason the model tier gives for none goes to. */
const NONE_COUNTS: Record<
  ReasonOf<"none">,
  keyof Omit<ModelResults, "total" | "call" | "rejected">
> = {
  miss: "none",
  unavailable: "noAnswer",
  thread: "thread",
  groupSend: "groupSend",
  timeFilter: "timeFilter",
  ungroundedFilter: "ungroundedFilter",
}

const countResults = (rows: readonly ModelEvalRow[]): ModelResults => {
  const counts: ModelResults = {
    total: rows.length,
    call: 0,
    rejected: 0,
    none: 0,
    noAnswer: 0,
    thread: 0,
    groupSend: 0,
    timeFilter: 0,
    ungroundedFilter: 0,
  }
  rows.forEach(({ modelResult }) => {
    if (modelResult.kind === "call") counts.call += 1
    else if (modelResult.kind === "rejected") counts.rejected += 1
    else counts[NONE_COUNTS[modelResult.reason]] += 1
  })
  return counts
}

const hasModelResult = (row: DeviceRow): row is ModelEvalRow =>
  row.modelResult !== undefined

/** What the model tier made of a run's entries, when every row says. */
const modelResultsOf = (rows: readonly DeviceRow[]): DeviceScores["modelResults"] => {
  if (!rows.every(hasModelResult)) return undefined
  return { model: countResults(rows), pipeline: countResults(rows.filter(asksModel)) }
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
  run: DeviceRun,
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
    sessions: run.sessions,
    modelResults: modelResultsOf(run.rows),
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

/** How the run's asks found the model's session, as the run recorded it (ModelEvalSessions). */
const describeSessions = (
  label: string,
  sessions: ModelEvalSessions | undefined,
): string => {
  if (sessions === undefined) {
    return `${label}: sessions not recorded (a hook from before the warm mode): asks back to back, near-cold times`
  }
  return sessions.mode === "warm"
    ? `${label}: sessions warm: each ask warmed, then ${sessions.idleMs} ms idle, as the app leaves every ask`
    : `${label}: sessions cold: asks back to back, near-cold times, not the state the app leaves an ask in`
}

/**
 * Whether the model could answer when the run began, and what that meant
 * for its rows: none answered, unless the model came later, which the rows
 * show when they record the model tier's results.
 */
const describeAvailable = (label: string, scores: DeviceScores): string => {
  const line = `${label}: model available when the run began:`
  if (scores.available) return `${line} yes`
  const results = scores.modelResults?.model
  const answered = results === undefined ? 0 : answeredBy(results)
  return answered === 0 || results === undefined
    ? `${line} NO, so every model row is a miss`
    : `${line} NO, though it answered later (${answered} of ${results.total} entries)`
}

/** What the model tier made of some entries, as the PR reports it. */
const describeResults = (results: ModelResults): string =>
  [
    counted(results.call, "call"),
    counted(results.rejected, "refused call"),
    `${results.none} answered none`,
    `${results.noAnswer} unanswered (no model, a failure or the time ran out)`,
    `${results.thread} not asked (a reference to the thread alone)`,
    `${
      results.groupSend + results.timeFilter + results.ungroundedFilter
    } made none by a guard (${results.groupSend} groupSend, ${
      results.timeFilter
    } timeFilter, ${results.ungroundedFilter} ungroundedFilter)`,
  ].join(", ")

/** What the model tier made of every entry, and of the entries the shipped order asks it about. */
const describeModelResults = (
  label: string,
  results: DeviceScores["modelResults"],
): string[] => {
  if (results === undefined) {
    return [
      `${label}: model tier results not recorded (a hook from before ENG-749's per-row results)`,
    ]
  }
  const line = (entries: string, counts: ModelResults) =>
    `${label}: model tier results, ${entries} (${counts.total}): ${describeResults(
      counts,
    )}`
  return [
    line("every entry", results.model),
    line("entries the shipped order asks the model about", results.pipeline),
  ]
}

/**
 * Why the model tier's bar is not judged on a run, or undefined when it is.
 * The bar reads a held-out run (ENG-749 decision 2) of this ticket's hook
 * (the held-out run waits for ENG-749's prompt and session changes) in
 * which the model answered. A run that began with no model, or one in which
 * the model never answered an ask the shipped order made, measured the
 * grammar alone, and the grammar alone can meet the bar without a single
 * model answer.
 */
export const whyBarNotJudged = (
  scores: DeviceScores,
  set: EvalSet,
): string | undefined => {
  if (set !== "held-out") {
    return "not the held-out set (the model tier's bar reads the held-out set, real device, grammar then model)"
  }
  if (!scores.available) {
    return "no model when the run began, so this run measured the grammar alone"
  }
  if (scores.sessions === undefined) {
    return (
      "no sessions recorded: a hook from before ENG-749 ran it, and the held-out run " +
      "waits for ENG-749's prompt and session changes"
    )
  }
  if (scores.modelResults === undefined) {
    return (
      "no model tier results recorded: a hook from before ENG-749's per-row results ran it, " +
      "so the run cannot show the model answered"
    )
  }
  const asks = scores.modelResults.pipeline
  if (answeredBy(asks) === 0 && asks.noAnswer > 0) {
    const times = counted(asks.noAnswer, "time")
    return (
      `the shipped order asked the model ${times} and it never answered (no model, ` +
      "a failure or the time ran out each time), so this run measured the grammar alone"
    )
  }
  return undefined
}

/**
 * The model tier's bar, read on the shipped order's overall score, and its
 * verdict when whyBarNotJudged has no reason to withhold it: a held-out run
 * of this ticket's hook in which the model answered. Otherwise the bar is
 * not judged, whatever the numbers, and the line says why. Either way, every
 * wrong prepared action is listed.
 */
const describeBar = (label: string, scores: DeviceScores, set: EvalSet): string[] => {
  const wrong = scores.wrongCalls.pipeline.all
  const verdict = meetsModelTierBar(wrong) ? "met" : "NOT met"
  const prepared = scores.pipeline.all.failures.filter(
    ({ entry, got }) => typeof got !== "string" && isWrongPreparedAction(got, entry),
  )
  const notJudged = whyBarNotJudged(scores, set)
  return [
    notJudged === undefined
      ? `${label}: the model tier's bar (held-out set, real device, grammar then model): ` +
        `${counted(wrong.preparedAction, "wrong prepared action")} (allowed ${
          MODEL_TIER_BAR.maxWrongPreparedActions
        }), ${percent(wrong.readRate)} wrong reads (allowed at most ${percent(
          MODEL_TIER_BAR.maxWrongReadRate,
        )}): ${verdict}`
      : `${label}: bar not judged: ${notJudged}`,
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
 * A run's scores as the PR reports them: how its asks found the model's
 * session; what the model tier made of every entry and of the shipped
 * order's asks; the failures listed once, under each overall line; each line
 * with its wrong calls by consequence; and, last, the model tier's bar, read
 * on the shipped order, with its verdict when `set`, the corpus the run
 * read, is the held-out set and the run shows the model answered
 * (whyBarNotJudged).
 */
export const describeDeviceRun = (
  label: string,
  scores: DeviceScores,
  set: EvalSet,
): string => {
  const { model, pipeline } = scores.wrongCalls
  return [
    describeAvailable(label, scores),
    describeSessions(label, scores.sessions),
    ...describeModelResults(label, scores.modelResults),
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
    ...describeBar(label, scores, set),
  ].join("\n")
}
