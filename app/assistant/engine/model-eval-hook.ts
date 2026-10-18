import { readGrammar } from "../grammar"
import { assistantRegistry } from "../registry"
import type { Registry } from "../registry/define"
import type { ToolCall } from "./intent-router"
import { createNativeModelAdapter, ModelAdapter } from "./model-adapter"
import {
  ModelTierResult,
  ModelTierRuntime,
  prewarmOnDeviceModel,
  tryOnDeviceModel,
} from "./model-tier"
import { isPlainObject } from "./schema-validator"

// The on-device model's eval hook (ENG-690), for the manual device run the
// PR records: a development build only (__DEV__), never a release one. It
// puts globalThis.__flashModelEval on the JS side, and the device eval
// (__tests__/assistant/model/device-eval.ts) hands it a corpus's utterances
// from React Native DevTools. For each, it runs the grammar (and says
// whether a miss was a refusal), then the model tier on an empty thread (the
// model, the router's pre-check, the guards, grounding), and answers both
// outcomes, what the model tier made of the utterance and the model's time
// as JSON. The guards read the words alone here: the hook reads no cache,
// so no contact of the phone's account changes a run (ENG-751). Unless
// it is told otherwise, each ask that finds a model finds its session warmed
// as the app leaves every ask, and the run says which state its times
// measured (ModelEvalSessions, ENG-749).
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

/**
 * What the model tier made of an utterance (ModelTierResult), by kind and
 * reason: a call; a call it refused, and why; or none, and why: no answer
 * (no model, a failure, or the time ran out), the model's none, a
 * reference to the thread alone, which the model is never asked about, or
 * the model's call a guard made none (groupSend, timeFilter,
 * ungroundedFilter; ENG-751). The call itself is the row's `model`, which
 * is "miss" for all but a call; the intent of a refused call, or of one a
 * guard made none, is left out.
 */
export type ModelEvalModelResult =
  | { kind: "call" }
  | Pick<Extract<ModelTierResult, { kind: "rejected" }>, "kind" | "reason">
  | Pick<Extract<ModelTierResult, { kind: "none" }>, "kind" | "reason">

export type ModelEvalRow = {
  grammar: ModelEvalOutcome
  /**
   * The grammar's miss was a refusal, an ask v1 does not serve: the shipped
   * order never asks the model about it (ui/turn.ts).
   */
  refused: boolean
  /** The model tier's checked call, or miss: no model, no call, or one it refused. */
  model: ModelEvalOutcome
  /**
   * What the model tier made of the utterance (ENG-749), so a run shows
   * which of its asks the model answered: the run's `available` says only
   * how the run began.
   */
  modelResult: ModelEvalModelResult
  /** How long the model tier took, availability check included. */
  modelMs: number
}

/**
 * How long a warm run waits between warming the model's session and each
 * ask: about the time a person takes to type one, as the ENG-749 proxy run
 * waited.
 */
export const MODEL_EVAL_WARM_IDLE_MS = 2000

/**
 * How a run leaves the model's session before each ask (ENG-749). The run
 * records it, so its times say which state they measured.
 *
 * - warm, the default: the hook warms the session (prewarmOnDeviceModel),
 *   waits idleMs, then asks. That is the state the app leaves every ask in:
 *   Ask Flash warms a session when it opens, the model tier warms the next
 *   one as each ask is decided, and a person takes longer than that to type.
 * - cold: the asks back to back. Each meets a session whose warm-up the last
 *   ask began a moment before, so its time is close to that of a session
 *   made for it, and an ask that outruns the timeout is a miss the app's
 *   warmed asks might not have had.
 */
export type ModelEvalSessions = { mode: "warm"; idleMs: number } | { mode: "cold" }

/** Every ask warmed as the app leaves it: the hook's default. */
export const WARM_SESSIONS: ModelEvalSessions = {
  mode: "warm",
  idleMs: MODEL_EVAL_WARM_IDLE_MS,
}

export type ModelEvalRun = {
  /**
   * Whether the model could answer when the run began. Each row's
   * modelResult says whether it answered that entry.
   */
  available: boolean
  /** How each ask found the model's session: the state the times measured. */
  sessions: ModelEvalSessions
  rows: ModelEvalRow[]
}

export type ModelEvalDeps = {
  registry: Registry
  modelAdapter: ModelAdapter
  /** Epoch milliseconds. */
  now: () => number
  /** Resolves after `ms` milliseconds: a warm run's wait before each ask. */
  sleep: (ms: number) => Promise<void>
}

/** Every utterance is read on its own, as the first of a thread. */
const EMPTY_THREAD: ModelTierRuntime["transcript"] = {
  get: () => ({ entries: [], busy: false }),
}

/** The model tier's result as a row records it: its kind and reason. */
const modelResultOf = (result: ModelTierResult): ModelEvalModelResult => {
  if (result.kind === "call") return { kind: "call" }
  if (result.kind === "rejected") return { kind: "rejected", reason: result.reason }
  return { kind: "none", reason: result.reason }
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
 * what it missed), and each row records what the model tier made of its
 * entry. With warm sessions, each ask that finds a model first waits for its
 * warm-up to start and for the idle, outside its time. The native check
 * decides it per ask, as the app's warm-up does, not how the run began: an
 * ask that finds no model has nothing to warm, and waits for nothing.
 */
export const runModelEval = async (
  entries: readonly ModelEvalEntry[],
  deps: ModelEvalDeps,
  sessions: ModelEvalSessions = WARM_SESSIONS,
): Promise<ModelEvalRun> => {
  const runtime: ModelTierRuntime = {
    registry: deps.registry,
    modelAdapter: deps.modelAdapter,
    transcript: EMPTY_THREAD,
  }
  const available = await deps.modelAdapter.isAvailable()
  const rows: ModelEvalRow[] = []
  for (const entry of entries) {
    if (sessions.mode === "warm" && (await deps.modelAdapter.isAvailable())) {
      // As Ask Flash and the last ask leave the session, then a person typing.
      await prewarmOnDeviceModel(runtime)
      await deps.sleep(sessions.idleMs)
    }
    const startedAt = deps.now()
    const result = await tryOnDeviceModel(runtime, entry.utterance, {
      displayCurrency: entry.displayCurrency,
      displaySymbol: entry.displaySymbol,
    })
    rows.push({
      ...grammarOutcome(entry),
      model: result.kind === "call" ? result.call : "miss",
      modelResult: modelResultOf(result),
      modelMs: deps.now() - startedAt,
    })
  }
  return { available, sessions, rows }
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

/**
 * The sessions the hook's options ask for: warm with none, or with
 * { sessions: "warm" }; cold with { sessions: "cold" }; undefined for
 * anything else.
 */
export const evalSessionsOf = (options: unknown): ModelEvalSessions | undefined => {
  if (options === undefined) return WARM_SESSIONS
  if (!isPlainObject(options) || Object.keys(options).some((key) => key !== "sessions")) {
    return undefined
  }
  if (options.sessions === undefined || options.sessions === "warm") return WARM_SESSIONS
  return options.sessions === "cold" ? { mode: "cold" } : undefined
}

const isDev = (): boolean => typeof __DEV__ !== "undefined" && __DEV__ === true

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

type EvalHost = {
  __flashModelEval?: (entries: unknown, options?: unknown) => Promise<string>
}

/**
 * Put __flashModelEval on `host` (globalThis), in a development build only.
 * It takes the entries and, optionally, { sessions: "warm" | "cold" } (warm
 * when left out), answers a ModelEvalRun as JSON, and rejects when it was
 * not handed a list of entries, or options it can read.
 */
export const registerModelEvalHook = (
  deps: ModelEvalDeps = {
    registry: assistantRegistry,
    modelAdapter: createNativeModelAdapter(),
    now: Date.now,
    sleep,
  },
  host: object = globalThis,
): void => {
  if (!isDev()) return
  ;(host as EvalHost).__flashModelEval = async (value, options) => {
    const entries = evalEntriesOf(value)
    const sessions = evalSessionsOf(options)
    if (!entries || !sessions) {
      throw new Error(
        "__flashModelEval takes [{ utterance, displayCurrency, displaySymbol? }] " +
          'and, optionally, { sessions: "warm" | "cold" }',
      )
    }
    return JSON.stringify(await runModelEval(entries, deps, sessions))
  }
}
