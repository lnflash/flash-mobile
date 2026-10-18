// How a device run of the on-device model scores (ENG-690): what the device
// is handed, how its answer is read, and how it is counted, with the launch
// gate's own count (grammar/score.ts, tally). The device eval
// (device-eval.ts) runs it on a corpus; model-eval.spec.ts checks it with a
// fake model over the tuning corpus. Not a spec itself, and it imports no
// corpus.
import type {
  ModelEvalEntry,
  ModelEvalOutcome,
  ModelEvalRow,
  ModelEvalRun,
} from "@app/assistant/engine/model-eval-hook"
import { canonicalNumber } from "@app/assistant/engine/model-tier"
import { isPlainObject } from "@app/assistant/engine/schema-validator"
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

export type DeviceScores = {
  available: boolean
  /** The model on every entry, the grammar set aside. */
  model: DialectScores
  /** The shipped order: the grammar, then the model on what it missed. */
  pipeline: DialectScores
  /** The model tier's time per entry, in milliseconds. */
  latency: { p50: number; p95: number; max: number }
}

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
  return {
    available: run.available,
    model: byDialect(
      entries,
      run.rows.map(({ model }) => model),
    ),
    pipeline: byDialect(entries, run.rows.map(pipelineOutcome)),
    latency: {
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      max: times.length === 0 ? 0 : Math.max(...times),
    },
  }
}

const withoutFailures = (s: Score): Score => ({ ...s, failures: [] })

/** A run's scores as the PR reports them: the failures listed once, under each overall line. */
export const describeDeviceRun = (label: string, scores: DeviceScores): string =>
  [
    `${label}: model available when the run began: ${
      scores.available ? "yes" : "NO, so every model row is a miss"
    }`,
    `${label}: model time p50 ${scores.latency.p50} ms, p95 ${scores.latency.p95} ms, max ${scores.latency.max} ms`,
    describeScore(`${label}, model alone`, scores.model.all),
    describeScore(`${label}, model alone, English`, withoutFailures(scores.model.en)),
    describeScore(
      `${label}, model alone, Jamaican patois`,
      withoutFailures(scores.model.jm),
    ),
    describeScore(`${label}, grammar then model`, scores.pipeline.all),
    describeScore(
      `${label}, grammar then model, English`,
      withoutFailures(scores.pipeline.en),
    ),
    describeScore(
      `${label}, grammar then model, Jamaican patois`,
      withoutFailures(scores.pipeline.jm),
    ),
  ].join("\n")
