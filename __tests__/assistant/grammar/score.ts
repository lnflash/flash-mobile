// How the grammar did on a corpus, as the launch gate counts it
// (docs/ai-assistant-tool-registry.md §7.2), and the same count for any
// other reader's outcomes (`tally`: the on-device model's device run,
// ENG-690). Not a spec itself.
import { matchGrammar } from "@app/assistant/grammar"
import type { GrammarMatch } from "@app/assistant/grammar/types"
import { CorpusEntry, DISPLAY_SYMBOL, Expected } from "./corpus/entries"

/** What the grammar made of an entry, in the corpus's own terms. */
export const outcomeOf = (match: GrammarMatch | undefined): Expected => {
  if (match === undefined) return "miss"
  if (match.kind === "clarifyAmount" || match.kind === "conversionAmount")
    return "clarifyAmount"
  return match.call
}

/** The grammar's reading of an entry, in the entry's own account. */
export const resolve = (entry: CorpusEntry): Expected =>
  outcomeOf(
    matchGrammar(entry.utterance, {
      displayCurrency: entry.displayCurrency,
      displaySymbol: DISPLAY_SYMBOL[entry.displayCurrency],
    }),
  )

/** Two outcomes are the same: the same intent and arguments, or the same refusal. */
export const sameOutcome = (a: Expected, b: Expected): boolean => {
  if (typeof a === "string" || typeof b === "string") return a === b
  const sorted = (args: Record<string, unknown> = {}) =>
    JSON.stringify(Object.entries(args).sort(([x], [y]) => x.localeCompare(y)))
  return a.intent === b.intent && sorted(a.args) === sorted(b.args)
}

export type Score = {
  total: number
  /** Resolved as meant: the same call, or the same miss or question. */
  correct: number
  /**
   * A confident call other than the one meant: a different intent, payee
   * or amount, or a call where none was meant. A miss or a question is
   * never one.
   */
  wrongAction: number
  /** No call where one was meant ("I can't help with that yet"): tracked, not gating. */
  missed: number
  /** A question about the amount where a call was meant: tracked, not gating. */
  askedAmount: number
  correctRate: number
  wrongActionRate: number
  /** The entries resolved otherwise than meant, for the log. */
  failures: { entry: CorpusEntry; got: Expected }[]
}

/**
 * Count `outcomes` against what `entries` meant, one outcome per entry in
 * the same order: the launch gate's counting for any reader of a corpus
 * (the grammar here, the on-device model in a device run, ENG-690).
 */
export const tally = (
  entries: readonly CorpusEntry[],
  outcomes: readonly Expected[],
): Score => {
  if (outcomes.length !== entries.length) {
    throw new Error(`${outcomes.length} outcomes for ${entries.length} entries`)
  }
  let correct = 0
  let wrongAction = 0
  let missed = 0
  let askedAmount = 0
  const failures: Score["failures"] = []
  entries.forEach((entry, index) => {
    const got = outcomes[index]
    if (sameOutcome(got, entry.expected)) {
      correct += 1
      return
    }
    failures.push({ entry, got })
    if (typeof got !== "string") wrongAction += 1
    else if (got === "miss") missed += 1
    else askedAmount += 1
  })
  const total = entries.length
  return {
    total,
    correct,
    wrongAction,
    missed,
    askedAmount,
    correctRate: total === 0 ? 0 : correct / total,
    wrongActionRate: total === 0 ? 0 : wrongAction / total,
    failures,
  }
}

/** How the grammar did on `entries`. */
export const score = (entries: readonly CorpusEntry[]): Score =>
  tally(entries, entries.map(resolve))

/** A score as the PR reports it. */
export const describeScore = (label: string, s: Score): string =>
  [
    [
      `${label}: ${s.correct}/${s.total} correct (${(s.correctRate * 100).toFixed(1)}%)`,
      `${s.wrongAction} wrong action (${(s.wrongActionRate * 100).toFixed(2)}%)`,
      `${s.missed} missed`,
      `${s.askedAmount} asked about the amount`,
    ].join(", "),
    ...s.failures.map(({ entry, got }) => {
      const where = `${entry.dialect}/${entry.displayCurrency}`
      const said = JSON.stringify(entry.utterance)
      return `  ${where} ${said}: meant ${JSON.stringify(
        entry.expected,
      )}, got ${JSON.stringify(got)}`
    }),
  ].join("\n")
