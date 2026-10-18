// The per-intent grammar specs over the tuning corpus (docs/ai-assistant-
// tool-registry.md §9): every entry resolves as the grammar should read it
// (as meant, or the miss an entry says the grammar makes of a read its rules
// do not cover), and a snapshot keeps the whole table honest over time, both
// dialects. Not a spec itself.
import { CorpusEntry, Expected, grammarExpected, intentOf } from "./corpus/entries"
import { TUNING } from "./corpus/tuning"
import { resolve } from "./score"

const label = ({ dialect, displayCurrency, utterance }: CorpusEntry) =>
  `${dialect}/${displayCurrency} ${JSON.stringify(utterance)}`

const show = (outcome: Expected): string =>
  typeof outcome === "string"
    ? outcome
    : `${outcome.intent} ${JSON.stringify(
        Object.fromEntries(
          Object.entries(outcome.args ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        ),
      )}`

/** The table a snapshot keeps: each entry, and what the grammar made of it. */
export const resolutionTable = (entries: readonly CorpusEntry[]): string =>
  entries.map((entry) => `${label(entry)} -> ${show(resolve(entry))}`).join("\n")

export const describeCorpus = (title: string, entries: readonly CorpusEntry[]): void => {
  describe(title, () => {
    it("holds entries in English and in Jamaican patois", () => {
      expect(entries.some(({ dialect }) => dialect === "en")).toBe(true)
      expect(entries.some(({ dialect }) => dialect === "jm")).toBe(true)
    })

    entries.forEach((entry) => {
      it(label(entry), () => {
        expect(resolve(entry)).toEqual(grammarExpected(entry))
      })
    })

    it("resolves the corpus as the snapshot records", () => {
      expect(resolutionTable(entries)).toMatchSnapshot()
    })
  })
}

/** The tuning entries the grammar should read as a call of `intent`. */
export const tuningFor = (intent: string): readonly CorpusEntry[] =>
  TUNING.filter((entry) => intentOf(grammarExpected(entry)) === intent)
