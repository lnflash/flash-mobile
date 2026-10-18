import { NativeModules } from "react-native"

import {
  createNativeModelAdapter,
  decisionOf,
  MODEL_AVAILABILITY_TIMEOUT_MS,
  MODEL_BACKSTOP_GRACE_MS,
  MODEL_PREWARM_TIMEOUT_MS,
  MODEL_RESPONSE_TIMEOUT_MS,
} from "@app/assistant/engine/model-adapter"
import type { ModelPrompt, ModelWarmup } from "@app/assistant/engine/model-prompt"
import {
  AssistantModelBridge,
  nativeModelBridge,
} from "@app/assistant/engine/native-model-bridge"

// The on-device model as the model tier sees it (ENG-690,
// app/assistant/engine/model-adapter.ts): whatever the native side does, an
// answer is a call, a miss or unavailable, and nothing ever rejects.

const PROMPT: ModelPrompt = {
  instructions: "the tools and the rules",
  prompt: "Request: hi",
  tools: [{ intent: "getBalances", description: "Balances.", arguments: [] }],
}
const OPTIONS = { timeoutMs: MODEL_RESPONSE_TIMEOUT_MS }
const WARMUP: ModelWarmup = { instructions: "the tools and the rules" }

const bridge = (overrides: Partial<AssistantModelBridge> = {}) => {
  const native = {
    isAvailable: jest.fn(async () => true),
    complete: jest.fn(async (_prompt: string, _timeoutMs: number) => '{"intent":"none"}'),
    prewarm: jest.fn(async (_warmup: string): Promise<unknown> => null),
    ...overrides,
  }
  return { native, adapter: createNativeModelAdapter(() => native) }
}

/** A promise that never settles: a native side that hangs. */
const never = <T>() =>
  new Promise<T>(() => {
    // never settles
  })

afterEach(() => {
  jest.useRealTimers()
})

describe("the native module", () => {
  const modules = NativeModules as { AssistantModelBridge?: unknown }

  afterEach(() => {
    delete modules.AssistantModelBridge
  })

  it("is absent in a build without it: no model, and every decision unavailable", async () => {
    delete modules.AssistantModelBridge
    expect(nativeModelBridge()).toBeUndefined()

    const adapter = createNativeModelAdapter()
    await expect(adapter.isAvailable()).resolves.toBe(false)
    await expect(adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({
      kind: "unavailable",
    })
    // Nothing to warm (ENG-749).
    await expect(adapter.prewarm(WARMUP)).resolves.toBeUndefined()
  })

  it("is there without prewarm, as in a build made before it (ENG-749)", async () => {
    const native = {
      isAvailable: jest.fn(async () => true),
      complete: jest.fn(async () => '{"intent":"none"}'),
    }
    modules.AssistantModelBridge = native

    expect(nativeModelBridge()).toBe(native)
    await expect(createNativeModelAdapter().prewarm(WARMUP)).resolves.toBeUndefined()
  })

  it("is absent when it lacks either method", () => {
    modules.AssistantModelBridge = { isAvailable: jest.fn() }
    expect(nativeModelBridge()).toBeUndefined()
    modules.AssistantModelBridge = { complete: jest.fn() }
    expect(nativeModelBridge()).toBeUndefined()
  })

  it("is read from NativeModules on each call, as the widget bridge is", async () => {
    const native = {
      isAvailable: jest.fn(async () => true),
      complete: jest.fn(async () => '{"intent":"getBalances","argsJson":"{}"}'),
    }
    const adapter = createNativeModelAdapter()
    modules.AssistantModelBridge = native

    await expect(adapter.isAvailable()).resolves.toBe(true)
    await expect(adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({
      kind: "call",
      raw: { intent: "getBalances", args: {} },
    })
  })
})

describe("isAvailable", () => {
  it("is what the module says, when it says true or false", async () => {
    await expect(bridge().adapter.isAvailable()).resolves.toBe(true)
    const off = bridge({ isAvailable: jest.fn(async () => false) })
    await expect(off.adapter.isAvailable()).resolves.toBe(false)
  })

  it("is false when the module throws, rejects, or answers something else", async () => {
    const throws = bridge({
      isAvailable: jest.fn(() => {
        throw new Error("native crash")
      }),
    })
    const rejects = bridge({
      isAvailable: jest.fn(async () => Promise.reject(new Error())),
    })
    const odd = bridge({
      isAvailable: jest.fn(async () => "yes" as unknown as boolean),
    })

    await expect(throws.adapter.isAvailable()).resolves.toBe(false)
    await expect(rejects.adapter.isAvailable()).resolves.toBe(false)
    await expect(odd.adapter.isAvailable()).resolves.toBe(false)
  })

  it("is false when the module never answers", async () => {
    jest.useFakeTimers()
    const { adapter } = bridge({ isAvailable: jest.fn(() => never<boolean>()) })

    const available = adapter.isAvailable()
    jest.advanceTimersByTime(MODEL_AVAILABILITY_TIMEOUT_MS)

    await expect(available).resolves.toBe(false)
  })
})

describe("decide", () => {
  it("hands the module the prompt as JSON and the time it has", async () => {
    const { native, adapter } = bridge()

    await adapter.decide(PROMPT, { timeoutMs: 1234 })

    expect(native.complete).toHaveBeenCalledWith(JSON.stringify(PROMPT), 1234)
  })

  it("is unavailable when the module rejects or throws", async () => {
    const rejects = bridge({
      complete: jest.fn(async () => Promise.reject(new Error("timeout"))),
    })
    const throws = bridge({
      complete: jest.fn(() => {
        throw new Error("native crash")
      }),
    })

    await expect(rejects.adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({
      kind: "unavailable",
    })
    await expect(throws.adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({
      kind: "unavailable",
    })
  })

  it("stops waiting on a module that hangs past the timeout, and is unavailable", async () => {
    jest.useFakeTimers()
    const { adapter } = bridge({ complete: jest.fn(() => never<string>()) })
    const decision = adapter.decide(PROMPT, OPTIONS)

    // The native side has the whole timeout, and a grace past it to cancel.
    jest.advanceTimersByTime(MODEL_RESPONSE_TIMEOUT_MS)
    await expect(Promise.race([decision, Promise.resolve("waiting")])).resolves.toBe(
      "waiting",
    )
    jest.advanceTimersByTime(MODEL_BACKSTOP_GRACE_MS)

    await expect(decision).resolves.toEqual({ kind: "unavailable" })
  })

  // Plain loops rather than it.each: this repo's tsconfig types `it` without
  // .each (navigation-container-wrapper.spec.tsx).
  const NOT_A_CALL = [
    '{"intent":"none"}',
    '{"intent":"none","argsJson":"{}"}',
    "Sure! Here is your balance.",
    "",
    "null",
    "[]",
    '"getBalances"',
    '{"argsJson":"{}"}',
    '{"intent":7}',
    '{"intent":"getBalances","argsJson":"{}","confidence":0.9}',
    '{"intent":"getBalances","argsJson":{}}',
    '{"intent":"prepareSend","argsJson":"{payee: bob}"}',
  ]
  NOT_A_CALL.forEach((answer) =>
    it(`is a miss for "none", text that is not JSON, or any other shape: ${JSON.stringify(
      answer,
    )}`, async () => {
      const { adapter } = bridge({ complete: jest.fn(async () => answer) })

      await expect(adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({ kind: "miss" })
    }),
  )

  it("is a call with the arguments parsed and nothing more checked", async () => {
    const { adapter } = bridge({
      complete: jest.fn(
        async () =>
          '{"intent":"prepareSend","argsJson":"{\\"payee\\":\\"bob\\",\\"amount\\":\\"5\\"}"}',
      ),
    })

    await expect(adapter.decide(PROMPT, OPTIONS)).resolves.toEqual({
      kind: "call",
      raw: { intent: "prepareSend", args: { payee: "bob", amount: "5" } },
    })
  })

  it("leaves what the router refuses to the router: an unknown intent, arguments that are not an object", () => {
    expect(decisionOf('{"intent":"execute","argsJson":"{}"}')).toEqual({
      kind: "call",
      raw: { intent: "execute", args: {} },
    })
    expect(decisionOf('{"intent":"getBalances","argsJson":"[1,2]"}')).toEqual({
      kind: "call",
      raw: { intent: "getBalances", args: [1, 2] },
    })
  })

  it("is a call with no arguments when the module gives none", () => {
    expect(decisionOf('{"intent":"getBalances"}')).toEqual({
      kind: "call",
      raw: { intent: "getBalances" },
    })
    expect(decisionOf('{"intent":"getBalances","argsJson":"  "}')).toEqual({
      kind: "call",
      raw: { intent: "getBalances" },
    })
  })

  it("is a miss for an answer that is not text at all", () => {
    expect(decisionOf(undefined)).toEqual({ kind: "miss" })
    expect(decisionOf({ intent: "getBalances" })).toEqual({ kind: "miss" })
  })
})

describe("prewarm (ENG-749)", () => {
  it("hands the module the warm-up as JSON, once, and resolves with nothing", async () => {
    const { native, adapter } = bridge()

    await expect(adapter.prewarm(WARMUP)).resolves.toBeUndefined()

    expect(native.prewarm).toHaveBeenCalledTimes(1)
    expect(native.prewarm).toHaveBeenCalledWith(JSON.stringify(WARMUP))
    // It asks the model nothing.
    expect(native.complete).not.toHaveBeenCalled()
  })

  it("never rejects: a module that throws, rejects or is not a function is nothing", async () => {
    const throws = bridge({
      prewarm: jest.fn(() => {
        throw new Error("native crash")
      }),
    })
    const rejects = bridge({
      prewarm: jest.fn(async () => Promise.reject(new Error("no model"))),
    })
    const odd = bridge({ prewarm: "yes" as unknown as AssistantModelBridge["prewarm"] })

    await expect(throws.adapter.prewarm(WARMUP)).resolves.toBeUndefined()
    await expect(rejects.adapter.prewarm(WARMUP)).resolves.toBeUndefined()
    await expect(odd.adapter.prewarm(WARMUP)).resolves.toBeUndefined()
  })

  it("stops waiting on a module that never answers", async () => {
    jest.useFakeTimers()
    const { adapter } = bridge({ prewarm: jest.fn(() => never<unknown>()) })

    const warming = adapter.prewarm(WARMUP)
    jest.advanceTimersByTime(MODEL_PREWARM_TIMEOUT_MS)

    await expect(warming).resolves.toBeUndefined()
  })
})
