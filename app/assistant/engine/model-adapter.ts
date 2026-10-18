import type { ModelPrompt, ModelWarmup } from "./model-prompt"
import { AssistantModelBridge, nativeModelBridge } from "./native-model-bridge"
import { isPlainObject } from "./schema-validator"

// The on-device model as the model tier sees it (ENG-690): whether it can
// answer, and what it answered. Whatever the native side does (no module,
// no model on this device, a throw, a hang, text that is not a call) comes
// back as one of three decisions, and nothing here ever rejects: a failed
// model is a turn answered as it is without one. Ask Flash also warms the
// model's session when it opens (ENG-749), which sends nothing and settles
// whatever the native side does.

/**
 * How long the model has for one utterance (architect decision 3): 2.5 s,
 * no retry. The native side cancels its work at this mark; device p50 and
 * p95 go in the PR, and the number is tuned from them.
 */
export const MODEL_RESPONSE_TIMEOUT_MS = 2500

/**
 * How long past its own timeout a native answer may run before the adapter
 * stops waiting (the backstop): the native side normally gives up first,
 * and cancels the work as it does.
 */
export const MODEL_BACKSTOP_GRACE_MS = 250

/** An availability check is a local system call; a slower one counts as no model. */
export const MODEL_AVAILABILITY_TIMEOUT_MS = 1000

/**
 * The native side starts a warm-up and answers at once; past this, the
 * adapter stops waiting for that answer (the warm-up itself goes on).
 */
export const MODEL_PREWARM_TIMEOUT_MS = 1000

/**
 * - call: what the model emitted, unchecked: `raw` goes through the router
 *   like any other emitter's call, then the grounding check (model-tier.ts).
 * - miss: the model answered and named no call ("none"), or answered
 *   something that is not one.
 * - unavailable: no answer: no model, a failure, or the time ran out.
 */
export type ModelDecision =
  | { kind: "call"; raw: unknown }
  | { kind: "miss" }
  | { kind: "unavailable" }

export type ModelAdapter = {
  /** Whether the model can answer now. Resolves false on any failure. */
  isAvailable: () => Promise<boolean>
  /** At most one call for the prompt. Never rejects. */
  decide: (prompt: ModelPrompt, options: { timeoutMs: number }) => Promise<ModelDecision>
  /**
   * Start the model's session for the instructions every request carries,
   * and send nothing (ENG-749). Never rejects; does nothing without a
   * module, or with one built before it.
   */
  prewarm: (warmup: ModelWarmup) => Promise<void>
}

const MISS: ModelDecision = { kind: "miss" }
const UNAVAILABLE: ModelDecision = { kind: "unavailable" }

type Settled<T> = { ok: true; value: T } | { ok: false }

/**
 * What `work` resolved, or not ok when it threw, rejected or took longer
 * than `ms`. Never rejects.
 */
const settleWithin = <T>(work: () => Promise<T>, ms: number): Promise<Settled<T>> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false }), ms)
    const settle = (result: Settled<T>) => {
      clearTimeout(timer)
      resolve(result)
    }
    try {
      Promise.resolve(work()).then(
        (value) => settle({ ok: true, value }),
        () => settle({ ok: false }),
      )
    } catch {
      settle({ ok: false })
    }
  })

/**
 * The bridge's answer as a decision. The bridge answers
 * {"intent": "...", "argsJson": "..."} and nothing else: anything else,
 * "none", or arguments that are not JSON is a miss. The arguments are parsed
 * and nothing more: whether they are an object the intent's schema takes is
 * the router's to say.
 */
export const decisionOf = (answer: unknown): ModelDecision => {
  if (typeof answer !== "string") return MISS
  let parsed: unknown
  try {
    parsed = JSON.parse(answer)
  } catch {
    return MISS
  }
  if (!isPlainObject(parsed) || typeof parsed.intent !== "string") return MISS
  const isBridgeKey = (key: string) => key === "intent" || key === "argsJson"
  if (!Object.keys(parsed).every(isBridgeKey)) return MISS
  const { intent, argsJson } = parsed
  if (intent === "none") return MISS
  if (
    argsJson === undefined ||
    (typeof argsJson === "string" && argsJson.trim() === "")
  ) {
    return { kind: "call", raw: { intent } }
  }
  if (typeof argsJson !== "string") return MISS
  try {
    return { kind: "call", raw: { intent, args: JSON.parse(argsJson) } }
  } catch {
    return MISS
  }
}

/**
 * The adapter over the native module. Without a module every check is false,
 * every decision unavailable and every warm-up nothing. `bridge` is read on
 * each call; a spec hands in its own.
 */
export const createNativeModelAdapter = (
  bridge: () => AssistantModelBridge | undefined = nativeModelBridge,
): ModelAdapter => ({
  isAvailable: async () => {
    const native = bridge()
    if (!native) return false
    const answer = await settleWithin(
      () => native.isAvailable(),
      MODEL_AVAILABILITY_TIMEOUT_MS,
    )
    return answer.ok && answer.value === true
  },
  decide: async (prompt, { timeoutMs }) => {
    const native = bridge()
    if (!native) return UNAVAILABLE
    const answer = await settleWithin(
      () => native.complete(JSON.stringify(prompt), timeoutMs),
      timeoutMs + MODEL_BACKSTOP_GRACE_MS,
    )
    return answer.ok ? decisionOf(answer.value) : UNAVAILABLE
  },
  prewarm: async (warmup) => {
    const native = bridge()
    const prewarm = native?.prewarm
    if (typeof prewarm !== "function") return
    await settleWithin(
      () => prewarm.call(native, JSON.stringify(warmup)),
      MODEL_PREWARM_TIMEOUT_MS,
    )
  },
})
