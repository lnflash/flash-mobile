import { readGrammar } from "../grammar"
import { assistantRegistry } from "../registry"
import type { Registry } from "../registry/define"
import type { ToolCall } from "./intent-router"
import { createNativeModelAdapter, ModelAdapter } from "./model-adapter"
import { ModelTierRuntime, tryOnDeviceModel } from "./model-tier"
import { isPlainObject } from "./schema-validator"

// The on-device model's eval hook (ENG-690), for the manual device run the
// PR records: a development build only (__DEV__), never a release one. It
// puts globalThis.__flashModelEval on the JS side, and the device eval
// (__tests__/assistant/model/device-eval.ts) hands it a corpus's utterances
// from React Native DevTools. For each, it runs the grammar (and says
// whether a miss was a refusal), then the model tier on an empty thread (the
// model, the router's pre-check, grounding), and answers both outcomes and
// the model's time as JSON.
//
// The corpus never enters the app: the hook gets each utterance and its
// account's display currency, never what it means, and nothing here imports
// a corpus (held-out-isolation.spec.ts).

/** One utterance as the device eval hands it over. */
export type ModelEvalEntry = {
  utterance: string
  displayCurrency: string
  displaySymbol?: string
}

/** What a tier made of an utterance, in the corpus's terms (corpus/entries.ts, Expected). */
export type ModelEvalOutcome = ToolCall | "miss" | "clarifyAmount"

export type ModelEvalRow = {
  grammar: ModelEvalOutcome
  /**
   * The grammar's miss was a refusal, an ask v1 does not serve: the shipped
   * order never asks the model about it (ui/turn.ts).
   */
  refused: boolean
  /** The model tier's checked call, or miss: no model, no call, or one it refused. */
  model: ModelEvalOutcome
  /** How long the model tier took, availability check included. */
  modelMs: number
}

export type ModelEvalRun = {
  /** Whether the model could answer when the run began; false makes every model row a miss. */
  available: boolean
  rows: ModelEvalRow[]
}

export type ModelEvalDeps = {
  registry: Registry
  modelAdapter: ModelAdapter
  /** Epoch milliseconds. */
  now: () => number
}

/** Every utterance is read on its own, as the first of a thread. */
const EMPTY_THREAD: ModelTierRuntime["transcript"] = {
  get: () => ({ entries: [], busy: false }),
}

/** The grammar's reading of an utterance, as the corpus states outcomes, and whether a miss was a refusal. */
const grammarOutcome = (
  entry: ModelEvalEntry,
): { grammar: ModelEvalOutcome; refused: boolean } => {
  const verdict = readGrammar(entry.utterance, {
    displayCurrency: entry.displayCurrency,
    displaySymbol: entry.displaySymbol,
  })
  if (verdict === undefined) return { grammar: "miss", refused: false }
  if (verdict.kind === "refused") return { grammar: "miss", refused: true }
  return {
    grammar: verdict.kind === "clarifyAmount" ? "clarifyAmount" : verdict.call,
    refused: false,
  }
}

/**
 * Both tiers over every entry, one after the other: the model takes one
 * request at a time. The model runs on every entry, so a run scores the
 * model alone as well as the shipped order (the grammar, then the model on
 * what it missed).
 */
export const runModelEval = async (
  entries: readonly ModelEvalEntry[],
  deps: ModelEvalDeps,
): Promise<ModelEvalRun> => {
  const available = await deps.modelAdapter.isAvailable()
  const rows: ModelEvalRow[] = []
  for (const entry of entries) {
    const startedAt = deps.now()
    const result = await tryOnDeviceModel(
      {
        registry: deps.registry,
        modelAdapter: deps.modelAdapter,
        transcript: EMPTY_THREAD,
      },
      entry.utterance,
      { displayCurrency: entry.displayCurrency, displaySymbol: entry.displaySymbol },
    )
    rows.push({
      ...grammarOutcome(entry),
      model: result.kind === "call" ? result.call : "miss",
      modelMs: deps.now() - startedAt,
    })
  }
  return { available, rows }
}

/** The entries the hook was handed, if they are a list of utterances with a display currency. */
export const evalEntriesOf = (value: unknown): ModelEvalEntry[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const valid = value.every(
    (entry) =>
      isPlainObject(entry) &&
      typeof entry.utterance === "string" &&
      typeof entry.displayCurrency === "string" &&
      (entry.displaySymbol === undefined || typeof entry.displaySymbol === "string"),
  )
  return valid ? (value as ModelEvalEntry[]) : undefined
}

const isDev = (): boolean => typeof __DEV__ !== "undefined" && __DEV__ === true

type EvalHost = { __flashModelEval?: (entries: unknown) => Promise<string> }

/**
 * Put __flashModelEval on `host` (globalThis), in a development build only.
 * It answers a ModelEvalRun as JSON, or rejects when it was not handed a
 * list of entries.
 */
export const registerModelEvalHook = (
  deps: ModelEvalDeps = {
    registry: assistantRegistry,
    modelAdapter: createNativeModelAdapter(),
    now: Date.now,
  },
  host: object = globalThis,
): void => {
  if (!isDev()) return
  ;(host as EvalHost).__flashModelEval = async (value) => {
    const entries = evalEntriesOf(value)
    if (!entries) {
      throw new Error(
        "__flashModelEval takes [{ utterance, displayCurrency, displaySymbol? }]",
      )
    }
    return JSON.stringify(await runModelEval(entries, deps))
  }
}
