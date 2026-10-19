import {
  createNativeModelAdapter,
  ModelDecision,
} from "@app/assistant/engine/model-adapter"
import type { ToolCall } from "@app/assistant/engine/intent-router"
import {
  evalEntriesOf,
  evalSessionsOf,
  MODEL_EVAL_WARM_IDLE_MS,
  ModelEvalDeps,
  ModelEvalEntry,
  ModelEvalModelResult,
  ModelEvalOutcome,
  ModelEvalRow,
  ModelEvalRun,
  registerModelEvalHook,
  runModelEval,
  WARM_SESSIONS,
} from "@app/assistant/engine/model-eval-hook"
import type { ModelPrompt } from "@app/assistant/engine/model-prompt"
import { readGrammar } from "@app/assistant/grammar"
import { normalize } from "@app/assistant/grammar/normalize"
import { refersToThreadOnly, stripFrame } from "@app/assistant/grammar/words"
import { assistantRegistry } from "@app/assistant/registry"
import { splitMoneyAmount } from "@app/assistant/registry/actions/shared/split"
import { toUsdMoneyAmount } from "@app/types/amounts"
import {
  CorpusEntry,
  DISPLAY_SYMBOL,
  Expected,
  grammarExpected,
} from "../grammar/corpus/entries"
import { TUNING } from "../grammar/corpus/tuning"
import { score } from "../grammar/score"
import { fakeModelAdapter, unavailableModelAdapter } from "../fakes"
import {
  describeDeviceRun,
  deviceEntries,
  isWrongPreparedAction,
  meetsModelTierBar,
  MODEL_TIER_BAR,
  parseDeviceRun,
  percentile,
  pipelineOutcome,
  sameNumbersAs,
  scoreDeviceRun,
  WrongCalls,
} from "./eval-run"

// The on-device model's eval (ENG-690): the dev hook runs the grammar and
// the model tier over a corpus's utterances, and eval-run.ts counts what a
// device answered as the launch gate counts the grammar. CI never runs a
// real model: here a fake one answers over the tuning corpus. The held-out
// set is the device eval's alone (device-eval.ts).

type Answers = Map<string, ModelDecision>

/** The request a prompt asks about: its last line, after "Request: ". */
const requestOf = (prompt: ModelPrompt): string =>
  prompt.prompt.slice(prompt.prompt.lastIndexOf("Request: ") + "Request: ".length)

/** A model that answers by the utterance, and "none" to any it was not given an answer for. */
const scriptedModel = (answers: Answers) => {
  const byRequest = new Map(
    [...answers].map(([utterance, answer]) => [utterance.trim(), answer]),
  )
  return {
    isAvailable: jest.fn(async () => true),
    decide: jest.fn(
      async (prompt: ModelPrompt): Promise<ModelDecision> =>
        byRequest.get(requestOf(prompt)) ?? { kind: "miss" },
    ),
    prewarm: jest.fn(async () => undefined),
  }
}

/**
 * The hook's dependencies on a fake clock: each reading is 10 ms past the
 * last, and a warm run's wait moves the clock by its whole length, at once.
 */
const depsOf = (
  modelAdapter: ModelEvalDeps["modelAdapter"],
): ModelEvalDeps & { sleep: jest.Mock } => {
  let clock = 0
  return {
    registry: assistantRegistry,
    modelAdapter,
    now: () => {
      clock += 10
      return clock
    },
    sleep: jest.fn(async (ms: number) => {
      clock += ms
    }),
  }
}

const runOver = async (
  entries: readonly CorpusEntry[],
  modelAdapter: ModelEvalDeps["modelAdapter"],
) => {
  const run = await runModelEval(deviceEntries(entries), depsOf(modelAdapter))
  // What the device would answer: the run as JSON, read back.
  return scoreDeviceRun(entries, parseDeviceRun(JSON.stringify(run), entries))
}

const grammar = score(TUNING)

/** What the model tier records beside a model outcome it answered: a call, or the model's none. */
const answeredAs = (model: ModelEvalOutcome): ModelEvalModelResult =>
  typeof model === "string" ? { kind: "none", reason: "miss" } : { kind: "call" }

describe("the eval over the tuning corpus, with a fake model", () => {
  it("scores a model that answers what each entry meant: no wrong action, and never below the grammar", async () => {
    const answers: Answers = new Map(
      TUNING.flatMap(({ utterance, expected }) =>
        typeof expected === "string"
          ? []
          : [[utterance, { kind: "call", raw: expected }]],
      ),
    )

    const scores = await runOver(TUNING, scriptedModel(answers))

    expect(scores.available).toBe(true)
    // Each ask warmed as the app leaves it, the run's default (ENG-749).
    expect(scores.sessions).toEqual(WARM_SESSIONS)
    expect(scores.model.all.total).toBe(TUNING.length)
    // A meant call is never a wrong one; grounding turns the ones the
    // model would have to rewrite (sats as bitcoin) into misses.
    expect(scores.model.all.wrongAction).toBe(0)
    expect(scores.model.all.correct).toBeGreaterThan(0)
    expect(scores.pipeline.all.wrongAction).toBe(grammar.wrongAction)
    expect(scores.pipeline.all.correct).toBeGreaterThanOrEqual(grammar.correct)
    // Both dialects are counted, and add up.
    expect(scores.model.en.total + scores.model.jm.total).toBe(TUNING.length)
    expect(scores.pipeline.en.total).toBeGreaterThan(0)
    expect(scores.pipeline.jm.total).toBeGreaterThan(0)
  })

  it("scores malformed model output as a miss, never a wrong action", async () => {
    const garbage = createNativeModelAdapter(() => ({
      isAvailable: async () => true,
      complete: async () => "Sure! I'd love to help with that.",
    }))

    const scores = await runOver(TUNING, garbage)

    const meantMisses = TUNING.filter(({ expected }) => expected === "miss").length
    expect(scores.model.all.wrongAction).toBe(0)
    expect(scores.model.all.correct).toBe(meantMisses)
    // The model added nothing, so the shipped order is the grammar alone.
    expect(scores.pipeline.all).toEqual(grammar)
  })

  it("scores a model call on an entry meant as a miss as a wrong action, alone and in the shipped order", async () => {
    // An entry no call was meant for, which the grammar misses too.
    // An entry no call was meant for, which the grammar misses without
    // refusing it, so the shipped order asks the model about it: not a
    // reference to the thread alone, which the model is never asked about
    // (ENG-749).
    const target = TUNING.find(
      (entry) =>
        entry.expected === "miss" &&
        readGrammar(entry.utterance, {
          displayCurrency: entry.displayCurrency,
          displaySymbol: DISPLAY_SYMBOL[entry.displayCurrency],
        }) === undefined &&
        !refersToThreadOnly(stripFrame(normalize(entry.utterance).tokens)),
    )
    if (!target) throw new Error("the tuning corpus has no entry the grammar only misses")
    const answers: Answers = new Map([
      [target.utterance, { kind: "call", raw: { intent: "getBalances", args: {} } }],
    ])

    const scores = await runOver(TUNING, scriptedModel(answers))

    expect(scores.model.all.wrongAction).toBe(1)
    expect(scores.pipeline.all.wrongAction).toBe(grammar.wrongAction + 1)
    expect(scores.pipeline.all.failures).toContainEqual({
      entry: target,
      got: { intent: "getBalances", args: {} },
    })
    // A read, where none was meant: a wrong read, not a wrong prepared
    // action (ENG-749).
    expect(scores.wrongCalls.model.all).toMatchObject({ preparedAction: 0, read: 1 })
  })

  it('counts a history read from bob as what "how much did bob send me" means, though the grammar misses it (ENG-749)', async () => {
    const entry = TUNING.find(({ utterance }) => utterance === "how much did bob send me")
    if (!entry) throw new Error("the tuning corpus has no bob entry")
    const read = {
      intent: "getTransactions",
      args: { direction: "RECEIVE", query: "bob" },
    }
    expect(entry.expected).toEqual(read)
    // The grammar's own specs hold it to the miss its rules make of it.
    expect(grammarExpected(entry)).toBe("miss")
    expect(score([entry])).toMatchObject({ correct: 0, missed: 1, wrongAction: 0 })

    // What the macOS model answered (ENG-690 proxy run): a wrong call
    // against the old label, the meant read now.
    const scores = await runOver(
      [entry],
      scriptedModel(new Map([[entry.utterance, { kind: "call", raw: read }]])),
    )

    expect(scores.model.all).toMatchObject({ correct: 1, wrongAction: 0 })
    expect(scores.pipeline.all).toMatchObject({ correct: 1, wrongAction: 0 })
  })

  it("scores no model at all as the grammar alone, and says the model was not there", async () => {
    const absent = createNativeModelAdapter(() => undefined)

    const scores = await runOver(TUNING, absent)

    expect(scores.available).toBe(false)
    expect(scores.pipeline.all).toEqual(grammar)
    expect(describeDeviceRun("tuning", scores, "tuning")).toContain(
      "NO, so every model row is a miss",
    )
  })
})

describe("runModelEval", () => {
  it("runs the grammar and the model tier on every entry, and times the model", async () => {
    const entries = deviceEntries([
      {
        utterance: "my balance",
        dialect: "en",
        displayCurrency: "USD",
        expected: "miss",
      },
      {
        utterance: "send bob 5k",
        dialect: "en",
        displayCurrency: "JMD",
        expected: "miss",
      },
      {
        utterance: "tell me a joke",
        dialect: "en",
        displayCurrency: "USD",
        expected: "miss",
      },
      {
        utterance: "show my balance to him",
        dialect: "en",
        displayCurrency: "USD",
        expected: "miss",
      },
      {
        utterance: "send her $5",
        dialect: "en",
        displayCurrency: "USD",
        expected: "miss",
      },
    ])
    const model = scriptedModel(
      new Map<string, ModelDecision>([
        ["tell me a joke", { kind: "call", raw: { intent: "execute" } }],
        ["show my balance to him", { kind: "call", raw: { intent: "getBalances" } }],
        [
          "send her $5",
          {
            kind: "call",
            raw: { intent: "prepareSend", args: { payee: "her", amount: "5" } },
          },
        ],
      ]),
    )

    const run = await runModelEval(entries, depsOf(model))

    const miss = { grammar: "miss", refused: false }
    const none = { kind: "none", reason: "miss" }
    expect(run.rows).toEqual([
      {
        grammar: { intent: "getBalances", args: {} },
        refused: false,
        model: "miss",
        modelResult: none,
        modelMs: 10,
      },
      {
        grammar: "clarifyAmount",
        refused: false,
        model: "miss",
        modelResult: none,
        modelMs: 10,
      },
      // A call the router refuses is no call, and the row says it was refused.
      {
        ...miss,
        model: "miss",
        modelResult: { kind: "rejected", reason: "precheck" },
        modelMs: 10,
      },
      {
        ...miss,
        model: { intent: "getBalances", args: {} },
        modelResult: { kind: "call" },
        modelMs: 10,
      },
      // A pronoun for a payee: the grammar refuses it, and the model's call
      // for it counts only for the model alone.
      {
        grammar: "miss",
        refused: true,
        model: { intent: "prepareSend", args: { payee: "her", amount: "5" } },
        modelResult: { kind: "call" },
        modelMs: 10,
      },
    ])
    // The model was asked about every entry, the grammar's hits included.
    expect(model.decide).toHaveBeenCalledTimes(5)
    expect(run.rows.map(pipelineOutcome)).toEqual([
      { intent: "getBalances", args: {} },
      "clarifyAmount",
      "miss",
      { intent: "getBalances", args: {} },
      // The shipped order never asks the model about a refusal.
      "miss",
    ])
  })

  it("hands the device each utterance and its account, never what it means", () => {
    const [entry] = deviceEntries([TUNING[0]])

    expect(Object.keys(entry).sort()).toEqual([
      "displayCurrency",
      "displaySymbol",
      "utterance",
    ])
  })

  it("records what the model tier made of each entry, by kind and reason (ENG-749)", async () => {
    const usd = (utterance: string): ModelEvalEntry => ({
      utterance,
      displayCurrency: "USD",
      displaySymbol: "$",
    })
    const model = scriptedModel(
      new Map<string, ModelDecision>([
        [
          "pay the rent",
          {
            kind: "call",
            raw: { intent: "prepareSend", args: { payee: "landlord", amount: "500" } },
          },
        ],
        // The time ran out, or the model failed.
        ["how loaded am i right now", { kind: "unavailable" }],
      ]),
    )

    const run = await runModelEval(
      [usd("same ting again"), usd("pay the rent"), usd("how loaded am i right now")],
      depsOf(model),
    )

    expect(
      run.rows.map(({ model: outcome, modelResult }) => [outcome, modelResult]),
    ).toEqual([
      // A reference to the thread alone: the model was not asked.
      ["miss", { kind: "none", reason: "thread" }],
      // A payee and an amount the person never typed.
      ["miss", { kind: "rejected", reason: "ungrounded" }],
      ["miss", { kind: "none", reason: "unavailable" }],
    ])
    expect(model.decide).toHaveBeenCalledTimes(2)
  })

  it("records a call a guard made none as a miss, with the guard's reason beside it (ENG-751)", async () => {
    const entries: CorpusEntry[] = [
      "split 30 dollars between tanya and kemar",
      "what did i receive yesterday",
      "my biggest payment",
    ].map((utterance) => ({
      utterance,
      dialect: "en",
      displayCurrency: "USD",
      expected: "miss",
    }))
    const model = scriptedModel(
      new Map<string, ModelDecision>([
        [
          "split 30 dollars between tanya and kemar",
          {
            kind: "call",
            raw: {
              intent: "prepareSend",
              args: { payee: "tanya", amount: "30", currency: "USD" },
            },
          },
        ],
        [
          "what did i receive yesterday",
          {
            kind: "call",
            raw: { intent: "getTransactions", args: { direction: "RECEIVE" } },
          },
        ],
        [
          "my biggest payment",
          {
            kind: "call",
            raw: { intent: "getTransactions", args: { query: "biggest" } },
          },
        ],
      ]),
    )

    const run = await runModelEval(deviceEntries(entries), depsOf(model))

    // The outcome stays a miss; the reason is the row's extra.
    expect(
      run.rows.map(({ model: outcome, modelResult }) => [outcome, modelResult]),
    ).toEqual([
      ["miss", { kind: "none", reason: "groupSend" }],
      ["miss", { kind: "none", reason: "timeFilter" }],
      ["miss", { kind: "none", reason: "ungroundedFilter" }],
    ])
    // What a device answers reads back as it was written.
    expect(parseDeviceRun(JSON.stringify(run), entries).rows).toEqual(run.rows)
  })

  describe("each ask's session (ENG-749)", () => {
    /** Two asks the model is asked about: the run asks it about every entry but a reference to the thread. */
    const asks: ModelEvalEntry[] = [
      { utterance: "tell me a joke", displayCurrency: "USD", displaySymbol: "$" },
      {
        utterance: "how loaded am i right now",
        displayCurrency: "USD",
        displaySymbol: "$",
      },
    ]

    /** A model there for every ask, and its warm-ups, the asks and the hook's waits, in order. */
    const logged = () => {
      const log: string[] = []
      const model = scriptedModel(new Map())
      model.prewarm.mockImplementation(async () => {
        log.push("prewarm")
        return undefined
      })
      model.decide.mockImplementation(async (prompt: ModelPrompt) => {
        log.push(`ask ${requestOf(prompt)}`)
        return { kind: "miss" }
      })
      const deps = depsOf(model)
      const { sleep } = deps
      const waits = jest.fn(async (ms: number) => {
        log.push(`wait ${ms}`)
        await sleep(ms)
      })
      return { log, model, deps: { ...deps, sleep: waits } }
    }

    it("warms the session before each ask and waits as a person typing would, outside the ask's time, by default", async () => {
      const { log, model, deps } = logged()

      const run = await runModelEval(asks, deps)

      expect(MODEL_EVAL_WARM_IDLE_MS).toBe(2000)
      expect(run.sessions).toEqual({ mode: "warm", idleMs: MODEL_EVAL_WARM_IDLE_MS })
      expect(log.filter((line) => line !== "prewarm")).toEqual([
        "wait 2000",
        "ask tell me a joke",
        "wait 2000",
        "ask how loaded am i right now",
      ])
      // Each wait follows a warm-up the hook waited for; nothing but the
      // hook could have warmed the first ask's session.
      expect(log[0]).toBe("prewarm")
      expect(
        log.flatMap((line, index) => (line.startsWith("wait") ? [log[index - 1]] : [])),
      ).toEqual(["prewarm", "prewarm"])
      // The hook's warm-up before each ask, and the model tier's after it.
      expect(model.prewarm).toHaveBeenCalledTimes(2 * asks.length)
      // The wait is not the model's time.
      expect(run.rows.map(({ modelMs }) => modelMs)).toEqual([10, 10])
    })

    it("asks back to back when told cold: no warm-up of its own and no wait, and the run says so", async () => {
      const { log, model, deps } = logged()

      const run = await runModelEval(asks, deps, { mode: "cold" })

      expect(run.sessions).toEqual({ mode: "cold" })
      expect(deps.sleep).not.toHaveBeenCalled()
      expect(log[0]).toBe("ask tell me a joke")
      // Only the model tier's warm-up after each ask, which the next ask
      // meets a moment later.
      expect(model.prewarm).toHaveBeenCalledTimes(asks.length)
      expect(run.rows.map(({ modelMs }) => modelMs)).toEqual([10, 10])
    })

    it("warms nothing and waits for nothing when the run began with no model", async () => {
      const absent = unavailableModelAdapter()
      const deps = depsOf(absent)

      const run = await runModelEval(asks, deps)

      expect(run).toMatchObject({ available: false, sessions: WARM_SESSIONS })
      expect(deps.sleep).not.toHaveBeenCalled()
      expect(absent.prewarm).not.toHaveBeenCalled()
    })

    it("warms and waits for an ask only when the native check finds a model then, not on how the run began", async () => {
      const { log, model, deps } = logged()
      let there = true
      model.isAvailable.mockImplementation(async () => there)
      // The model goes as soon as the first ask is decided, as AICore may
      // take it back mid-run.
      model.decide.mockImplementation(async (prompt: ModelPrompt) => {
        log.push(`ask ${requestOf(prompt)}`)
        there = false
        return { kind: "miss" }
      })

      const run = await runModelEval(asks, deps)

      expect(run.available).toBe(true)
      // No warm-up and no idle for the second ask, which found no model.
      expect(log.filter((line) => line !== "prewarm")).toEqual([
        "wait 2000",
        "ask tell me a joke",
      ])
      expect(run.rows.map(({ modelResult }) => modelResult)).toEqual([
        { kind: "none", reason: "miss" },
        { kind: "none", reason: "unavailable" },
      ])
    })
  })
})

describe("the dev hook", () => {
  type Dev = { __DEV__: boolean }
  const setDev = (value: boolean) => {
    ;(globalThis as unknown as Dev).__DEV__ = value
  }

  afterEach(() => setDev(true))

  it("is on the host in a development build, and answers a run as JSON", async () => {
    const host: { __flashModelEval?: (entries: unknown) => Promise<string> } = {}
    registerModelEvalHook(depsOf(scriptedModel(new Map())), host)

    const answer = await host.__flashModelEval?.([
      { utterance: "my balance", displayCurrency: "USD", displaySymbol: "$" },
    ])

    expect(JSON.parse(answer ?? "")).toEqual({
      available: true,
      sessions: { mode: "warm", idleMs: MODEL_EVAL_WARM_IDLE_MS },
      rows: [
        {
          grammar: { intent: "getBalances", args: {} },
          refused: false,
          model: "miss",
          modelResult: { kind: "none", reason: "miss" },
          modelMs: 10,
        },
      ],
    })
    await expect(host.__flashModelEval?.([{ utterance: 5 }])).rejects.toThrow(
      "__flashModelEval takes",
    )
  })

  it("is never there in a release build", () => {
    setDev(false)
    const host: { __flashModelEval?: unknown } = {}

    registerModelEvalHook(depsOf(scriptedModel(new Map())), host)

    expect(host.__flashModelEval).toBeUndefined()
  })

  it('takes { sessions: "cold" } after the entries, and refuses options it cannot read (ENG-749)', async () => {
    const host: {
      __flashModelEval?: (entries: unknown, options?: unknown) => Promise<string>
    } = {}
    const deps = depsOf(scriptedModel(new Map()))
    registerModelEvalHook(deps, host)
    const entries = [{ utterance: "my balance", displayCurrency: "USD" }]

    const cold = JSON.parse(
      (await host.__flashModelEval?.(entries, { sessions: "cold" })) ?? "",
    )

    expect(cold.sessions).toEqual({ mode: "cold" })
    expect(deps.sleep).not.toHaveBeenCalled()
    await expect(host.__flashModelEval?.(entries, { sessions: "hot" })).rejects.toThrow(
      '{ sessions: "warm" | "cold" }',
    )
    await expect(host.__flashModelEval?.(entries, "cold")).rejects.toThrow(
      "__flashModelEval takes",
    )
  })

  it("reads the hook's options as warm sessions unless they say cold (ENG-749)", () => {
    expect(evalSessionsOf(undefined)).toEqual(WARM_SESSIONS)
    expect(evalSessionsOf({})).toEqual(WARM_SESSIONS)
    expect(evalSessionsOf({ sessions: "warm" })).toEqual(WARM_SESSIONS)
    expect(evalSessionsOf({ sessions: "cold" })).toEqual({ mode: "cold" })
    expect(evalSessionsOf({ sessions: "hot" })).toBeUndefined()
    expect(evalSessionsOf({ sessions: "cold", idleMs: 5 })).toBeUndefined()
    expect(evalSessionsOf("cold")).toBeUndefined()
    expect(evalSessionsOf(null)).toBeUndefined()
  })

  it("takes only a list of utterances with a display currency", () => {
    expect(evalEntriesOf([{ utterance: "hi", displayCurrency: "USD" }])).toEqual([
      { utterance: "hi", displayCurrency: "USD" },
    ])
    expect(evalEntriesOf({ utterance: "hi" })).toBeUndefined()
    expect(evalEntriesOf([{ utterance: "hi" }])).toBeUndefined()
    expect(
      evalEntriesOf([{ utterance: "hi", displayCurrency: "USD", displaySymbol: 1 }]),
    ).toBeUndefined()
  })
})

describe("counting a device's answer", () => {
  it("counts an amount written another way as the same amount", () => {
    expect(
      sameNumbersAs({
        intent: "prepareSend",
        args: { payee: "bob", amount: "10.00", currency: "USD" },
      }),
    ).toEqual({
      intent: "prepareSend",
      args: { payee: "bob", amount: "10", currency: "USD" },
    })
    expect(sameNumbersAs({ intent: "getPrice", args: { currency: "JMD" } })).toEqual({
      intent: "getPrice",
      args: { currency: "JMD" },
    })
    expect(sameNumbersAs("miss")).toBe("miss")

    const entry: CorpusEntry = {
      utterance: "send bob $10",
      dialect: "en",
      displayCurrency: "USD",
      expected: {
        intent: "prepareSend",
        args: { payee: "bob", amount: "10", currency: "USD" },
      },
    }
    const scores = scoreDeviceRun([entry], {
      available: true,
      rows: [
        {
          grammar: "miss",
          refused: false,
          model: {
            intent: "prepareSend",
            args: { payee: "bob", amount: "10.00", currency: "USD" },
          },
          modelMs: 1,
        },
      ],
    })
    expect(scores.model.all.correct).toBe(1)
    expect(scores.pipeline.all.correct).toBe(1)
  })
})

describe("wrong calls by consequence, the model tier's bar (ENG-749)", () => {
  const en = (
    utterance: string,
    expected: Expected,
    displayCurrency: "USD" | "JMD" = "USD",
  ): CorpusEntry => ({ utterance, dialect: "en", displayCurrency, expected })

  /** A row the grammar missed without refusing, so the shipped order takes the model's. */
  const row = (model: ModelEvalOutcome): ModelEvalRow => ({
    grammar: "miss",
    refused: false,
    model,
    modelResult: answeredAs(model),
    modelMs: 1,
  })

  it("counts a run with one wrong prepared action and one wrong read as one of each, and says so", () => {
    const entries = [
      en("top up", "miss"),
      en("payments to kemar", {
        intent: "getTransactions",
        args: { direction: "SEND", query: "kemar" },
      }),
      en("how loaded am i right now", { intent: "getBalances", args: {} }),
    ]

    const scores = scoreDeviceRun(entries, {
      available: true,
      sessions: WARM_SESSIONS,
      rows: [
        // A prepare where none was meant.
        row({ intent: "prepareReceive", args: {} }),
        // A read, but not the one meant.
        row({ intent: "getBalances", args: {} }),
        // The read meant.
        row({ intent: "getBalances", args: {} }),
      ],
    })

    const oneOfEach: WrongCalls = {
      preparedAction: 1,
      read: 1,
      preparedActionRate: 1 / 3,
      readRate: 1 / 3,
    }
    // The launch gate's count, split in two that add up to it.
    expect(scores.pipeline.all.wrongAction).toBe(2)
    expect(scores.wrongCalls.pipeline.all).toEqual(oneOfEach)
    expect(scores.wrongCalls.model.all).toEqual(oneOfEach)
    expect(scores.wrongCalls.pipeline.en).toEqual(oneOfEach)
    expect(scores.wrongCalls.pipeline.jm).toEqual({
      preparedAction: 0,
      read: 0,
      preparedActionRate: 0,
      readRate: 0,
    })
    const report = describeDeviceRun("fake", scores, "held-out")
    expect(report).toContain(
      "fake, grammar then model: 1/3 correct (33.3%), 2 wrong action (66.67%), 0 missed, " +
        "0 asked about the amount; 1 wrong prepared action (33.33%), 1 wrong read (33.33%)",
    )
    expect(report).toContain(
      "fake, model alone, English: 1/3 correct (33.3%), 2 wrong action (66.67%), 0 missed, " +
        "0 asked about the amount; 1 wrong prepared action (33.33%), 1 wrong read (33.33%)",
    )
    expect(report).toContain(
      "fake: the model tier's bar (held-out set, real device, grammar then model): " +
        "1 wrong prepared action (allowed 0), 33.33% wrong reads (allowed at most 0.50%): NOT met",
    )
    expect(report).toContain(
      '  wrong prepared action: en/USD "top up": meant "miss", got {"intent":"prepareReceive","args":{}}',
    )
  })

  it("calls a prepare wrong by its payee, amount, currency and wallet, read as the tool reads them", () => {
    const send = (args: Record<string, unknown>): ToolCall => ({
      intent: "prepareSend",
      args,
    })
    const meant = send({ payee: "kemar", amount: "9", currency: "USD", memo: "the taxi" })
    const entry = en("send kemar $9 for the taxi", meant)
    const cases: [string, ToolCall, boolean][] = [
      ["another amount", send({ ...meant.args, amount: "90" }), true],
      ["another payee", send({ ...meant.args, payee: "eve" }), true],
      ["another currency", send({ ...meant.args, currency: "BTC" }), true],
      [
        "a wallet the label does not name",
        send({ ...meant.args, sourceWallet: "BTC" }),
        true,
      ],
      [
        "another action",
        { intent: "prepareReceive", args: { amount: "9", currency: "USD" } },
        true,
      ],
      ["another memo", send({ ...meant.args, memo: "taxi" }), false],
      ["the payee in another case", send({ ...meant.args, payee: " Kemar " }), false],
      ["the amount written another way", send({ ...meant.args, amount: "9.00" }), false],
    ]
    cases.forEach(([name, got, prepared]) =>
      expect([name, isWrongPreparedAction(got, entry)]).toEqual([name, prepared]),
    )

    // No currency is the account's display currency.
    const bare = en("send tanya 20", send({ payee: "tanya", amount: "20" }))
    const inUsd = send({ payee: "tanya", amount: "20", currency: "USD" })
    expect(isWrongPreparedAction(inUsd, bare)).toBe(false)
    expect(isWrongPreparedAction(inUsd, { ...bare, displayCurrency: "JMD" })).toBe(true)
    // A group's payees in their order: an indivisible total's leftover cent
    // goes to the first payee (spec §5, prepareGroupSend), so the same names
    // in another order pay another person another amount.
    expect(
      splitMoneyAmount(toUsdMoneyAmount(1000), 3).map(({ amount }) => amount),
    ).toEqual([334, 333, 333])
    const group = en("split 10 between bob, alice and eve", {
      intent: "prepareGroupSend",
      args: { payees: ["bob", "alice", "eve"], total: "10" },
    })
    const groupSend = (payees: string[], total = "10"): ToolCall => ({
      intent: "prepareGroupSend",
      args: { payees, total },
    })
    expect(
      isWrongPreparedAction(groupSend(["Bob", " alice ", "EVE"], "10.00"), group),
    ).toBe(false)
    expect(isWrongPreparedAction(groupSend(["alice", "bob", "eve"]), group)).toBe(true)
    expect(isWrongPreparedAction(groupSend(["bob", "alice", "kemar"]), group)).toBe(true)
    // A cash-out's bank account is an id, compared as written, case and all.
    const cashout = en("cash out 50 to my bank", {
      intent: "prepareCashout",
      args: { amount: "50", bankAccountId: "AcctB7" },
    })
    const toBank = (bankAccountId: string): ToolCall => ({
      intent: "prepareCashout",
      args: { amount: "50.00", bankAccountId },
    })
    expect(isWrongPreparedAction(toBank("AcctB7"), cashout)).toBe(false)
    expect(isWrongPreparedAction(toBank("acctb7"), cashout)).toBe(true)
    // A prepare where a read, a question or a miss was meant.
    expect(
      isWrongPreparedAction(inUsd, en("history", { intent: "getTransactions" })),
    ).toBe(true)
    expect(isWrongPreparedAction(inUsd, en("send tanya 5k", "clarifyAmount"))).toBe(true)
    // A read is never a prepared action, whatever was meant; anything the
    // scorer cannot show to be a read is one.
    expect(isWrongPreparedAction({ intent: "getBalances", args: {} }, entry)).toBe(false)
    expect(
      isWrongPreparedAction({ intent: "launchRocket", args: {} }, en("hi", "miss")),
    ).toBe(true)
  })

  it("holds the bar: no wrong prepared action, and at most 0.5% wrong reads", () => {
    const wrong = (preparedAction: number, read: number, total: number): WrongCalls => ({
      preparedAction,
      read,
      preparedActionRate: preparedAction / total,
      readRate: read / total,
    })

    expect(MODEL_TIER_BAR).toEqual({
      maxWrongPreparedActions: 0,
      maxWrongReadRate: 0.005,
    })
    expect(meetsModelTierBar(wrong(0, 0, 200))).toBe(true)
    expect(meetsModelTierBar(wrong(0, 1, 200))).toBe(true)
    expect(meetsModelTierBar(wrong(0, 2, 200))).toBe(false)
    expect(meetsModelTierBar(wrong(1, 0, 200))).toBe(false)

    const scores = scoreDeviceRun([en("hi", "miss")], {
      available: true,
      sessions: WARM_SESSIONS,
      rows: [row("miss")],
    })
    expect(describeDeviceRun("fake", scores, "held-out")).toContain(
      "0 wrong prepared actions (allowed 0), 0.00% wrong reads (allowed at most 0.50%): met",
    )
  })
})

describe("the bar's verdict, for a held-out run in which the model answered (ENG-749)", () => {
  const en = (utterance: string, expected: Expected): CorpusEntry => ({
    utterance,
    dialect: "en",
    displayCurrency: "USD",
    expected,
  })
  const row = (model: ModelEvalOutcome): ModelEvalRow => ({
    grammar: "miss",
    refused: false,
    model,
    modelResult: answeredAs(model),
    modelMs: 1,
  })
  /** A run of this ticket's hook that began with a model: it records its sessions and each row's result. */
  const runOf = (rows: ModelEvalRow[]): ModelEvalRun => ({
    available: true,
    sessions: WARM_SESSIONS,
    rows,
  })
  const clean = scoreDeviceRun([en("hi", "miss")], runOf([row("miss")]))
  const failing = scoreDeviceRun(
    [en("top up", "miss")],
    runOf([row({ intent: "prepareReceive", args: {} })]),
  )

  /**
   * A balance read the grammar reads and a joke it misses without refusing,
   * both as meant, so the grammar alone meets the bar; the shipped order
   * asks the model about the joke alone.
   */
  const corpus = [
    en("my balance", { intent: "getBalances", args: {} }),
    en("tell me a joke", "miss"),
  ]
  /** The held-out report of a run of `corpus`, as the device eval scores one. */
  const heldOutReport = async (modelAdapter: ModelEvalDeps["modelAdapter"]) =>
    describeDeviceRun("held-out", await runOver(corpus, modelAdapter), "held-out")
  const reportOf = (run: object): string =>
    describeDeviceRun(
      "held-out",
      scoreDeviceRun(corpus, parseDeviceRun(JSON.stringify(run), corpus)),
      "held-out",
    )
  const noModel =
    "held-out: bar not judged: the shipped order asked the model 1 time and it never answered " +
    "(no model, a failure or the time ran out each time), so this run measured the grammar alone"

  it("judges the held-out set", () => {
    expect(describeDeviceRun("held-out", clean, "held-out")).toMatch(
      /^held-out: the model tier's bar \(held-out set, real device, grammar then model\): .*: met$/m,
    )
    expect(describeDeviceRun("held-out", failing, "held-out")).toMatch(/: NOT met$/m)
  })

  it("judges a held-out run whose model answered the shipped order's ask, and prints what the model tier made of each entry", async () => {
    const report = await heldOutReport(fakeModelAdapter({ kind: "miss" }))

    expect(report).toMatch(
      /^held-out: the model tier's bar \(held-out set, real device, grammar then model\): .*: met$/m,
    )
    expect(report).toContain(
      "held-out: model tier results, every entry (2): 0 calls, 0 refused calls, 2 answered none, " +
        "0 unanswered (no model, a failure or the time ran out), 0 not asked (a reference to the thread alone)",
    )
    expect(report).toContain(
      "held-out: model tier results, entries the shipped order asks the model about (1): 0 calls, " +
        "0 refused calls, 1 answered none, 0 unanswered (no model, a failure or the time ran out), " +
        "0 not asked (a reference to the thread alone)",
    )
  })

  it("never judges a held-out run that began with no model: it measured the grammar alone", async () => {
    const report = await heldOutReport(unavailableModelAdapter())

    expect(report).toContain(
      "held-out: bar not judged: no model when the run began, so this run measured the grammar alone",
    )
    expect(report).not.toMatch(/\bmet$/m)

    // A model that came during the run, as a download forced by hand may
    // finish: its answers count for the scores, and the rows before them
    // measured the grammar alone, so the bar is still not judged.
    const late = scoreDeviceRun(corpus, {
      ...runOf([
        { ...row("miss"), modelResult: { kind: "none", reason: "unavailable" } },
        row("miss"),
      ]),
      available: false,
    })
    const lateReport = describeDeviceRun("held-out", late, "held-out")
    expect(lateReport).toContain(
      "held-out: model available when the run began: NO, though it answered later (1 of 2 entries)",
    )
    expect(lateReport).toContain(
      "held-out: bar not judged: no model when the run began, so this run measured the grammar alone",
    )
  })

  it("never judges a held-out run from a hook older than ENG-749's: it records no sessions, or no model tier results", async () => {
    const judged = await runModelEval(
      deviceEntries(corpus),
      depsOf(fakeModelAdapter({ kind: "miss" })),
    )
    // Each row as a hook from before the per-row results answered it.
    const rows = judged.rows.map(({ grammar: byGrammar, refused, model, modelMs }) => ({
      grammar: byGrammar,
      refused,
      model,
      modelMs,
    }))

    expect(reportOf(judged)).toMatch(/: met$/m)
    // As main's hook answers: no sessions, and no result on any row.
    const mainHook = reportOf({ available: true, rows })
    expect(mainHook).toContain(
      "held-out: bar not judged: no sessions recorded: a hook from before ENG-749 ran it, " +
        "and the held-out run waits for ENG-749's prompt and session changes",
    )
    expect(mainHook).toContain(
      "held-out: model tier results not recorded (a hook from before ENG-749's per-row results)",
    )
    expect(mainHook).not.toMatch(/\bmet$/m)
    const noResults = reportOf({ available: true, sessions: judged.sessions, rows })
    expect(noResults).toContain(
      "held-out: bar not judged: no model tier results recorded: a hook from before ENG-749's " +
        "per-row results ran it, so the run cannot show the model answered",
    )
    expect(noResults).not.toMatch(/\bmet$/m)
  })

  it("never judges a held-out run in which the model never answered an ask the shipped order made", async () => {
    // Every ask timed out, as every one did on SuperMax with a session made
    // per call (the ENG-749 plan's device facts).
    const timedOut = await heldOutReport(fakeModelAdapter({ kind: "unavailable" }))
    expect(timedOut).toContain(noModel)
    expect(timedOut).not.toMatch(/\bmet$/m)

    // A model there when the run began, gone before the shipped order's
    // ask: the run's `available` says how it began, no more.
    const leaving = fakeModelAdapter({ kind: "miss" })
    let there = true
    leaving.isAvailable.mockImplementation(async () => there)
    leaving.decide.mockImplementation(async (): Promise<ModelDecision> => {
      there = false
      return { kind: "miss" }
    })
    const gone = await runOver(corpus, leaving)
    expect(gone.available).toBe(true)
    expect(describeDeviceRun("held-out", gone, "held-out")).toContain(noModel)
  })

  it("judges a held-out run in which the model answered some of the shipped order's asks, and counts the rest unanswered", () => {
    const unanswered: ModelEvalRow = {
      ...row("miss"),
      modelResult: { kind: "none", reason: "unavailable" },
    }
    const report = describeDeviceRun(
      "held-out",
      scoreDeviceRun(
        [en("hi", "miss"), en("tell me a joke", "miss")],
        runOf([row("miss"), unanswered]),
      ),
      "held-out",
    )

    expect(report).toMatch(/: met$/m)
    expect(report).toContain(
      "held-out: model tier results, entries the shipped order asks the model about (2): 0 calls, " +
        "0 refused calls, 1 answered none, 1 unanswered (no model, a failure or the time ran out), " +
        "0 not asked (a reference to the thread alone)",
    )
  })

  it("never judges any other set, whatever its numbers, and still lists its wrong prepared actions", () => {
    ;[clean, failing].forEach((scores) => {
      const report = describeDeviceRun("tuning", scores, "tuning")
      expect(report).toContain(
        "tuning: bar not judged: not the held-out set (the model tier's bar reads the held-out set, " +
          "real device, grammar then model)",
      )
      expect(report).not.toMatch(/\bmet$/m)
    })
    expect(describeDeviceRun("tuning", failing, "tuning")).toContain(
      '  wrong prepared action: en/USD "top up": meant "miss", got {"intent":"prepareReceive","args":{}}',
    )
  })
})

describe("how a run's asks found the model's session (ENG-749)", () => {
  const entries = TUNING.slice(0, 1)
  const rows = [{ grammar: "miss", refused: false, model: "miss", modelMs: 1 }]
  const reportOf = (run: object): string =>
    describeDeviceRun(
      "tuning",
      scoreDeviceRun(entries, parseDeviceRun(JSON.stringify(run), entries)),
      "tuning",
    )

  it("prints the state the run says its times measured", () => {
    expect(
      reportOf({ available: true, sessions: { mode: "warm", idleMs: 2000 }, rows }),
    ).toContain(
      "tuning: sessions warm: each ask warmed, then 2000 ms idle, as the app leaves every ask",
    )
    expect(reportOf({ available: true, sessions: { mode: "cold" }, rows })).toContain(
      "tuning: sessions cold: asks back to back, near-cold times, not the state the app leaves an ask in",
    )
    // A hook from before the warm mode said nothing: its asks ran back to back.
    expect(reportOf({ available: true, rows })).toContain(
      "tuning: sessions not recorded (a hook from before the warm mode): asks back to back, near-cold times",
    )
  })

  it("refuses sessions it cannot read", () => {
    const parse = (sessions: unknown) => () =>
      parseDeviceRun(JSON.stringify({ available: true, sessions, rows }), entries)

    expect(parse({ mode: "hot" })).toThrow("sessions are")
    expect(parse({ mode: "warm" })).toThrow("sessions are")
    expect(parse("warm")).toThrow("sessions are")
  })
})

describe("reading a device's answer", () => {
  const entries = TUNING.slice(0, 2)
  const row = { grammar: "miss", refused: false, model: "miss", modelMs: 1 }

  it("refuses a model tier result it cannot read, or one at odds with the row's model (ENG-749)", () => {
    const parse = (rows: object[]) => () =>
      parseDeviceRun(JSON.stringify({ available: true, rows }), entries)
    const none = { ...row, modelResult: { kind: "none", reason: "miss" } }
    const call = { intent: "getBalances", args: {} }

    expect(parse([none, none])).not.toThrow()
    // The guards' reasons (ENG-751) are a none's, never a refused call's.
    ;["groupSend", "timeFilter", "ungroundedFilter"].forEach((reason) => {
      const guarded = { ...row, modelResult: { kind: "none", reason } }
      expect(parse([guarded, none])).not.toThrow()
      expect(
        parse([{ ...guarded, modelResult: { kind: "rejected", reason } }, none]),
      ).toThrow("Row 0's modelResult is not")
    })
    expect(
      parse([{ ...row, modelResult: { kind: "none", reason: "timeout" } }, none]),
    ).toThrow("Row 0's modelResult is not")
    expect(parse([none, { ...row, modelResult: { kind: "maybe" } }])).toThrow(
      "Row 1's modelResult is not",
    )
    expect(
      parse([
        { ...row, model: call, modelResult: { kind: "call", reason: "miss" } },
        none,
      ]),
    ).toThrow("Row 0's modelResult is not")
    // A miss the row says was a call, and a call it says was none.
    expect(parse([{ ...row, modelResult: { kind: "call" } }, none])).toThrow(
      "Row 0's model and modelResult disagree",
    )
    expect(parse([none, { ...none, model: call }])).toThrow(
      "Row 1's model and modelResult disagree",
    )
    // One hook wrote every row: all of them record a result, or none does.
    expect(parse([none, row])).toThrow("1 of 2 rows record a modelResult")
  })

  it("refuses an answer that is not a run of one row per entry", () => {
    expect(() => parseDeviceRun("{}", entries)).toThrow("{ available, rows }")
    expect(() =>
      parseDeviceRun(JSON.stringify({ available: true, rows: [row] }), entries),
    ).toThrow("1 rows for 2 entries")
    expect(() =>
      parseDeviceRun(
        JSON.stringify({ available: true, rows: [row, { ...row, model: 7 }] }),
        entries,
      ),
    ).toThrow("Row 1")
  })

  it("reports the model's time by nearest rank", () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([30, 10, 20], 50)).toBe(20)
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        95,
      ),
    ).toBe(95)
    expect(percentile([5], 95)).toBe(5)
  })
})

describe("the guards over the tuning corpus (ENG-751)", () => {
  const send = (payee: string, amount: string, currency?: string): ModelDecision => ({
    kind: "call",
    raw: {
      intent: "prepareSend",
      args: { payee, amount, ...(currency ? { currency } : {}) },
    },
  })
  const read = (args: Record<string, unknown>): ModelDecision => ({
    kind: "call",
    raw: { intent: "getTransactions", args },
  })

  /**
   * The ENG-751 entries meant as misses, each answered as the 2026-10-18
   * held-out run's model answered its kind: a group's ask as one send to
   * the first person named, and a dated read with its time phrase as the
   * search or a direction the words do not give; and a read searching for
   * the ask's own words. Every answer grounds, so before the guards each
   * was a wrong call.
   */
  const ANSWERS: [string, ModelDecision, string][] = [
    ["split 30 dollars between tanya and kemar", send("tanya", "30", "USD"), "groupSend"],
    ["tanya and kemar each get $10", send("tanya", "10", "USD"), "groupSend"],
    ["share 3000 between mom and dad", send("mom", "3000"), "groupSend"],
    ["everybody on the team gets $5", send("everybody", "5", "USD"), "groupSend"],
    ["go halves with jason on the $30 dinner", send("jason", "30", "USD"), "groupSend"],
    ["bob gets 10 and alice gets 5", send("bob", "10", "USD"), "groupSend"],
    ["split di 2000 between mi an tanya", send("tanya", "2000"), "groupSend"],
    ["tanya an kemar fi get 500 each", send("tanya", "500"), "groupSend"],
    ["mi an jason fi share 1000", send("jason", "1000"), "groupSend"],
    ["gi di yute dem 300 each", send("yute", "300"), "groupSend"],
    [
      "what did i receive yesterday",
      read({ query: "yesterday", direction: "RECEIVE" }),
      "timeFilter",
    ],
    [
      "show my payments from last week",
      read({ query: "last week", direction: "RECEIVE" }),
      "timeFilter",
    ],
    [
      "how much have i spent so far this year",
      read({ query: "this year", direction: "RECEIVE" }),
      "timeFilter",
    ],
    ["transactions since monday", read({ query: "monday" }), "timeFilter"],
    [
      "payments i got in september",
      read({ query: "september", direction: "RECEIVE" }),
      "timeFilter",
    ],
    ["payments with tanya this week", read({ query: "tanya" }), "timeFilter"],
    ["my biggest payment", read({ query: "biggest" }), "ungroundedFilter"],
    ["wah mi sen dis week", read({ query: "dis week", direction: "SEND" }), "timeFilter"],
    ["wah mi get yesterday", read({ direction: "RECEIVE" }), "timeFilter"],
    [
      "how much mi spen las month",
      read({ query: "las month", direction: "RECEIVE" }),
      "timeFilter",
    ],
    [
      "wah di biggest payment mi get",
      read({ query: "biggest payment", direction: "RECEIVE" }),
      "ungroundedFilter",
    ],
  ]

  const entriesOf = (utterances: readonly string[]): CorpusEntry[] =>
    utterances.map((utterance) => {
      const entry = TUNING.find((candidate) => candidate.utterance === utterance)
      if (!entry) throw new Error(`the tuning corpus has no entry ${utterance}`)
      return entry
    })

  it("holds each of them as a miss, in the corpus and to the grammar", () => {
    const entries = entriesOf(ANSWERS.map(([utterance]) => utterance))

    expect(entries.map(({ expected }) => expected)).toEqual(ANSWERS.map(() => "miss"))
    expect(score(entries)).toMatchObject({ correct: entries.length, wrongAction: 0 })
    expect(new Set(entries.map(({ dialect }) => dialect))).toEqual(new Set(["en", "jm"]))
  })

  it("makes each of those answers none, with its guard's reason: no wrong call, alone or in the shipped order", async () => {
    const entries = entriesOf(ANSWERS.map(([utterance]) => utterance))
    const model = scriptedModel(
      new Map(ANSWERS.map(([utterance, answer]) => [utterance, answer])),
    )

    const run = await runModelEval(deviceEntries(entries), depsOf(model))
    const scores = scoreDeviceRun(entries, parseDeviceRun(JSON.stringify(run), entries))

    expect(run.rows.map(({ modelResult }) => modelResult)).toEqual(
      ANSWERS.map(([, , reason]) => ({ kind: "none", reason })),
    )
    const none: WrongCalls = {
      preparedAction: 0,
      read: 0,
      preparedActionRate: 0,
      readRate: 0,
    }
    expect(scores.wrongCalls.model.all).toEqual(none)
    expect(scores.wrongCalls.pipeline.all).toEqual(none)
    expect(scores.model.all.correct).toBe(entries.length)
    // The device eval counts them, by reason (ENG-751 decision 3).
    expect(scores.modelResults?.model).toMatchObject({
      total: entries.length,
      none: 0,
      groupSend: 10,
      timeFilter: 9,
      ungroundedFilter: 2,
    })
    const report = describeDeviceRun("tuning", scores, "tuning")
    expect(report).toContain(
      "tuning: model tier results, every entry (21): 0 calls, 0 refused calls, 0 answered none, " +
        "0 unanswered (no model, a failure or the time ran out), " +
        "0 not asked (a reference to the thread alone), " +
        "21 made none by a guard (10 groupSend, 9 timeFilter, 2 ungroundedFilter)",
    )
  })

  it("keeps the near-misses answered in the shipped order: a memo's second person, a read by a contact's name", async () => {
    const nearMisses = entriesOf([
      "send tanya $12 for kemar's lunch",
      "sen 1000 to mi bredda for tanya lunch money",
      "what did i send kemar",
      "wah mi sen tanya",
    ])
    // The model answers each as meant: the guards pass every one.
    const model = scriptedModel(
      new Map(
        nearMisses.flatMap(({ utterance, expected }) =>
          typeof expected === "string"
            ? []
            : [[utterance, { kind: "call", raw: expected }]],
        ),
      ),
    )

    const scores = await runOver(nearMisses, model)

    expect(scores.model.all).toMatchObject({ correct: 4, wrongAction: 0 })
    expect(scores.pipeline.all).toMatchObject({ correct: 4, wrongAction: 0 })
    // The two sends are the grammar's; the two reads are misses to it, and
    // the model's in the shipped order.
    expect(nearMisses.map(grammarExpected).map((expected) => typeof expected)).toEqual([
      "object",
      "object",
      "string",
      "string",
    ])
  })

  it("counts a guard's none as an answer, so a held-out run whose only answers are guards' is judged", () => {
    const miss = (utterance: string): CorpusEntry => ({
      utterance,
      dialect: "en",
      displayCurrency: "USD",
      expected: "miss",
    })
    const row = (modelResult: ModelEvalModelResult): ModelEvalRow => ({
      grammar: "miss",
      refused: false,
      model: "miss",
      modelResult,
      modelMs: 1,
    })
    const run = (first: ModelEvalModelResult): ModelEvalRun => ({
      available: true,
      sessions: WARM_SESSIONS,
      rows: [row(first), row({ kind: "none", reason: "unavailable" })],
    })
    const entries = [miss("split 30 between tanya and kemar"), miss("tell me a joke")]
    const reportOf = (first: ModelEvalModelResult) =>
      describeDeviceRun("held-out", scoreDeviceRun(entries, run(first)), "held-out")

    // The model answered the first ask, and a guard made its call none.
    expect(reportOf({ kind: "none", reason: "groupSend" })).toMatch(
      /^held-out: the model tier's bar \(held-out set, real device, grammar then model\): .*: met$/m,
    )
    // Had it answered neither, the run measured the grammar alone.
    expect(reportOf({ kind: "none", reason: "unavailable" })).toContain(
      "held-out: bar not judged: the shipped order asked the model 2 times and it never answered",
    )
  })
})
