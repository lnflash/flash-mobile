// The runtime's auth gate imports the biometric and key-store modules, as
// auth-gate.spec.ts mocks them; a text-initiated Confirm never prompts.
jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))

import { cardOf } from "@app/assistant/cards/types"
import type { ModelDecision } from "@app/assistant/engine/model-adapter"
import { THREAD_CLOSE, THREAD_OPEN } from "@app/assistant/engine/model-prompt"
import { matchGrammar } from "@app/assistant/grammar"
import type { TransactionsProjection } from "@app/assistant/registry/projections"
import type { ToolResult } from "@app/assistant/registry/types"
import type { AssistantRuntime } from "@app/assistant/ui/assistant-runtime"
import type { ListedTransaction } from "@app/assistant/ui/thread-store"
import {
  answerUtterance,
  entriesFor,
  needsNetwork,
  reissue,
} from "@app/assistant/ui/turn"
import { toWalletAmount } from "@app/types/amounts"
import { makeAction } from "../executor-harness"
import { btcPayment, fakeModelAdapter, graphqlTx, modelCall } from "../fakes"
import { CASH_WALLETS, env, fakeRuntime } from "./thread-harness"

// One turn's pieces (app/assistant/ui/turn.ts): which calls need the network,
// what each result puts in the thread, how a question's pick re-issues a
// call, and where the on-device model comes in (ENG-690): only after the
// grammar missed, only while the flags allow it, and never past runTool.

const SEND = { intent: "prepareSend", args: { payee: "alice", amount: "5" } }

describe("needsNetwork", () => {
  it("is true for what prepares and for the live price, and false for the reads", () => {
    expect(needsNetwork(SEND)).toBe(true)
    expect(needsNetwork({ intent: "prepareReceive", args: {} })).toBe(true)
    expect(needsNetwork({ intent: "prepareCashout", args: {} })).toBe(true)
    expect(needsNetwork({ intent: "getPrice", args: {} })).toBe(true)
    expect(needsNetwork({ intent: "getBalances", args: {} })).toBe(false)
    expect(needsNetwork({ intent: "getTransactions", args: {} })).toBe(false)
  })

  it("is true for anything it cannot name, which is never run offline", () => {
    expect(needsNetwork({ intent: "launchRocket", args: {} })).toBe(true)
  })
})

describe("entriesFor", () => {
  it("puts a read's answer in the thread as its own answer, stale when it came from the cache", () => {
    const payload = { balances: [] }
    expect(
      entriesFor({ intent: "getBalances" }, { kind: "answer", payload }, { stale: true }),
    ).toEqual([{ kind: "balances", payload, stale: true }])
    expect(
      entriesFor(
        { intent: "getTransactions" },
        { kind: "answer", payload },
        { stale: false },
      ),
    ).toEqual([{ kind: "transactions", payload, stale: false }])
    expect(
      entriesFor({ intent: "getPrice" }, { kind: "answer", payload }, { stale: false }),
    ).toEqual([{ kind: "price", payload }])
  })

  it("keeps, with a history answer, each payment it lists as its rail handed it, and no other", () => {
    const shown = graphqlTx({ id: "tx-1", createdAt: 1_000, memo: "Rent" })
    const notShown = graphqlTx({ id: "tx-2", createdAt: 900 })
    const sats = btcPayment({ id: "pay-1", timestamp: 950, description: "Coffee" })
    const listed = new Map<string, ListedTransaction>([
      ["graphql:tx-1", { rail: "graphql", transaction: shown }],
      ["graphql:tx-2", { rail: "graphql", transaction: notShown }],
      ["btc:pay-1", { rail: "btc", payment: sats }],
    ])
    const row = (rail: "graphql" | "btc", id: string, timestamp: number) => ({
      rail,
      id,
      direction: "SEND" as const,
      status: "SUCCESS" as const,
      amount: toWalletAmount({ amount: 500, currency: "USD" }),
      fee: toWalletAmount({ amount: 0, currency: "USD" }),
      timestamp,
    })
    const payload: TransactionsProjection = {
      transactions: [row("graphql", "tx-1", 1_000), row("btc", "pay-1", 950)],
      window: {
        searchedCount: 3,
        oldestTimestamp: 900,
        rails: ["graphql", "btc"],
        replyKey: "Assistant.searchedWindow",
      },
      btc: { state: "ok" },
    }

    expect(
      entriesFor(
        { intent: "getTransactions" },
        { kind: "answer", payload },
        { stale: true, listed },
      ),
    ).toEqual([
      {
        kind: "transactions",
        payload,
        stale: true,
        listed: {
          "graphql:tx-1": { rail: "graphql", transaction: shown },
          "btc:pay-1": { rail: "btc", payment: sats },
        },
      },
    ])
  })

  it("shows an answer that is a card as the card, and any other as a failure", () => {
    const invoice = {
      type: "invoice",
      paymentRequest: "lnbc1",
      shareText: "lnbc1",
      receiveWallet: "USD",
      method: "lightning",
    }
    expect(
      entriesFor(
        { intent: "prepareReceive" },
        { kind: "answer", payload: invoice },
        { stale: false },
      ),
    ).toEqual([{ kind: "card", card: invoice }])
    expect(
      entriesFor(
        { intent: "prepareReceive" },
        { kind: "answer", payload: { not: "a card" } },
        { stale: false },
      ),
    ).toEqual([{ kind: "reply", replyKey: "Assistant.toolFailed" }])
  })

  it("keeps the call with a prepared action's card and with a question, for a pick or a Try again", () => {
    const action = makeAction()
    expect(
      entriesFor(SEND, { kind: "prepared", preparedAction: action }, { stale: false }),
    ).toEqual([{ kind: "card", card: cardOf(action), call: SEND }])
    const card = {
      type: "clarification" as const,
      prompt: "Assistant.pickContact" as const,
      options: [],
    }
    expect(entriesFor(SEND, { kind: "clarification", card }, { stale: false })).toEqual([
      { kind: "card", card, call: SEND },
    ])
  })

  it("keeps where the call came from with the call, for the calls its card issues (ENG-690)", () => {
    const action = makeAction()
    const byModel = { stale: false, servedByOnDeviceModel: true }
    expect(
      entriesFor(SEND, { kind: "prepared", preparedAction: action }, byModel),
    ).toEqual([
      { kind: "card", card: cardOf(action), call: SEND, servedByOnDeviceModel: true },
    ])
    const card = {
      type: "clarification" as const,
      prompt: "Assistant.pickContact" as const,
      options: [],
    }
    expect(entriesFor(SEND, { kind: "clarification", card }, byModel)).toEqual([
      { kind: "card", card, call: SEND, servedByOnDeviceModel: true },
    ])
    // A card that holds no call issues none, so it holds no origin either.
    const refused = {
      type: "prepareRefused" as const,
      reason: "insufficientBalance" as const,
    }
    expect(
      entriesFor(
        SEND,
        { kind: "error", userMessage: "Assistant.insufficientBalance", card: refused },
        byModel,
      ),
    ).toEqual([{ kind: "card", card: refused }])
  })

  it("says an error once: its reply, or the refusal card that says it", () => {
    expect(
      entriesFor(
        SEND,
        { kind: "error", userMessage: "Assistant.toolFailed" },
        { stale: false },
      ),
    ).toEqual([{ kind: "reply", replyKey: "Assistant.toolFailed" }])
    const card = {
      type: "prepareRefused" as const,
      reason: "insufficientBalance" as const,
    }
    expect(
      entriesFor(
        SEND,
        { kind: "error", userMessage: "Assistant.insufficientBalance", card },
        { stale: false },
      ),
    ).toEqual([{ kind: "card", card }])
  })

  it("shows a payee that names no one as its refusal card, never as a reply (ENG-730)", () => {
    const card = { type: "prepareRefused" as const, reason: "payeeNotFound" as const }

    expect(
      entriesFor(
        SEND,
        { kind: "error", userMessage: "Assistant.payeeNotFound", card },
        { stale: false },
      ),
    ).toEqual([{ kind: "card", card }])
  })

  it("keeps the call with a question about a Flash user who is not a contact, for the pick (ENG-730)", () => {
    const call = { intent: "prepareSend", args: { payee: "dreadmax", amount: "0.05" } }
    const card = {
      type: "clarification" as const,
      prompt: "Assistant.pickFlashUser" as const,
      options: [{ id: "contact:dreadmax", label: "dreadmax", sublabel: "dreadmax" }],
      about: "dreadmax",
    }

    expect(entriesFor(call, { kind: "clarification", card }, { stale: false })).toEqual([
      { kind: "card", card, call },
    ])
  })
})

describe("reissue", () => {
  it("re-issues the call with the words the question was about replaced by the pick", () => {
    expect(
      reissue(
        { intent: "prepareSend", args: { payee: "alice", amount: "5" } },
        "alice",
        "contact:alice_w",
      ),
    ).toEqual({ intent: "prepareSend", args: { payee: "contact:alice_w", amount: "5" } })
  })

  it("re-issues a Flash user's pick as a contact's, the amount, currency and memo untouched (ENG-730)", () => {
    expect(
      reissue(
        {
          intent: "prepareSend",
          args: { payee: "dreadmax", amount: "0.05", currency: "USD", memo: "lunch" },
        },
        "dreadmax",
        "contact:dreadmax",
      ),
    ).toEqual({
      intent: "prepareSend",
      args: { payee: "contact:dreadmax", amount: "0.05", currency: "USD", memo: "lunch" },
    })
  })

  it("re-issues nothing when no argument is what the question was about", () => {
    expect(reissue(SEND, "bob", "contact:bob")).toBeUndefined()
    expect(reissue(SEND, undefined, "contact:bob")).toBeUndefined()
    expect(reissue({ intent: "prepareSend" }, "alice", "contact:alice_w")).toBeUndefined()
  })

  it("replaces the payee alone, never a memo with the same words", () => {
    // "send 5 to bob for bob": the pick must not ride the payment as its memo.
    expect(
      reissue(
        { intent: "prepareSend", args: { payee: "bob", amount: "5", memo: "bob" } },
        "bob",
        "contact:bob_jones",
      ),
    ).toEqual({
      intent: "prepareSend",
      args: { payee: "contact:bob_jones", amount: "5", memo: "bob" },
    })
  })

  it("replaces one payee of a group send, the one the question was about", () => {
    expect(
      reissue(
        {
          intent: "prepareGroupSend",
          args: { payees: ["alice", "bob", "bob"], total: "9", memo: "bob" },
        },
        "bob",
        "contact:bob_jones",
      ),
    ).toEqual({
      intent: "prepareGroupSend",
      args: { payees: ["alice", "contact:bob_jones", "bob"], total: "9", memo: "bob" },
    })
  })

  it("replaces only the first argument with the words when no payee holds them", () => {
    expect(
      reissue(
        { intent: "somethingElse", args: { first: "kim", second: "kim" } },
        "kim",
        "contact:kim_1",
      ),
    ).toEqual({
      intent: "somethingElse",
      args: { first: "contact:kim_1", second: "kim" },
    })
  })
})

describe("answerUtterance and the on-device model (ENG-690)", () => {
  /** Words the grammar has no rule for, so the model is asked. */
  const MISSED = "could you kindly move five bucks over to bob"
  const ON = { onDeviceModel: true }

  /** A runtime whose model is there and decides `decision`. */
  const withModel = (decision: ModelDecision) =>
    fakeRuntime({ modelAdapter: fakeModelAdapter(decision) })

  it("is asked only about what the grammar misses", () => {
    // The specs below rely on the grammar missing these words.
    expect(matchGrammar(MISSED, { displayCurrency: "USD", displaySymbol: "$" })).toBe(
      undefined,
    )
    expect(
      matchGrammar("hook bob up with 5 dollars", {
        displayCurrency: "USD",
        displaySymbol: "$",
      }),
    ).toBe(undefined)
  })

  it("never waits on the model for a grammar hit", async () => {
    const { runtime, modelAdapter, runTool, graphql, toolEvents } = withModel(
      modelCall({ intent: "getPrice", args: {} }),
    )
    graphql.wallets.mockResolvedValue(CASH_WALLETS)

    await answerUtterance(runtime, "what's my balance", env(ON))

    expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    expect(runTool).toHaveBeenCalledTimes(1)
    expect(runTool.mock.calls[0][0]).toEqual({ intent: "getBalances", args: {} })
    expect(runTool.mock.calls[0][1].servedByOnDeviceModel).toBeUndefined()
    expect(toolEvents()).toEqual([
      expect.objectContaining({ intent: "getBalances", onDeviceModelAvailable: false }),
    ])
  })

  it("never waits on the model for an amount the grammar asks about", async () => {
    const { runtime, modelAdapter, runTool } = withModel(
      modelCall({ intent: "prepareSend", args: { payee: "bob", amount: "5000" } }),
    )

    const entries = await answerUtterance(runtime, "send bob 5k", env(ON))

    expect(entries).toEqual([
      { kind: "reply", replyKey: "Assistant.amountUnclear", params: { currency: "USD" } },
    ])
    expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    expect(runTool).not.toHaveBeenCalled()
  })

  it("never asks the model about what the grammar refused: the v1 boundary holds", async () => {
    // A pronoun, a follow-up, a time, two payees: the model would read
    // each as a send (the macOS proxy run did), and none may be one.
    const refused = [
      "send her $5",
      "send bob another $5",
      "send bob $5 next week",
      "send $10 to bob and $5 to alice",
    ]
    for (const utterance of refused) {
      const { runtime, modelAdapter, runTool, toolEvents } = withModel(
        modelCall({ intent: "prepareSend", args: { payee: "bob", amount: "5" } }),
      )
      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
      expect(modelAdapter.decide).not.toHaveBeenCalled()
      expect(runTool).not.toHaveBeenCalled()
      expect(toolEvents()).toEqual([
        expect.objectContaining({ outcome: "rejected", onDeviceModelAvailable: false }),
      ])
    }
  })

  it("runs the model's checked call through runTool, served by the model, held as text", async () => {
    const call = {
      intent: "prepareSend",
      args: { payee: "bob", amount: "5", currency: "USD" },
    }
    const { runtime, runTool, modelAdapter } = withModel(modelCall(call))
    const action = makeAction({ threadId: runtime.threadId })
    const prepared: ToolResult<unknown> = { kind: "prepared", preparedAction: action }
    runTool.mockResolvedValue(prepared)
    const add = jest.spyOn(runtime.executor, "addPrepared")

    const entries = await answerUtterance(runtime, "hook bob up with 5 dollars", env(ON))

    expect(modelAdapter.decide).toHaveBeenCalledTimes(1)
    expect(runTool).toHaveBeenCalledTimes(1)
    const [routed, deps] = runTool.mock.calls[0]
    // The raw call, as the model sent it: the router parses it in runTool.
    expect(routed).toEqual(call)
    expect(deps.servedByOnDeviceModel).toBe(true)
    // Prepared as text: the person confirms it with a tap.
    expect(add.mock.calls).toEqual([[action, "text"]])
    // The card keeps where its call came from, for a Try again or a Refresh.
    expect(entries).toEqual([
      { kind: "card", card: cardOf(action), call, servedByOnDeviceModel: true },
    ])
  })

  it("reports one event for the model's call, runTool's own, with the model's flag", async () => {
    const { runtime, graphql, toolEvents } = withModel(
      modelCall({ intent: "getBalances", args: {} }),
    )
    graphql.wallets.mockResolvedValue(CASH_WALLETS)

    const entries = await answerUtterance(runtime, MISSED, env(ON))

    expect(entries[0]).toMatchObject({ kind: "balances", stale: false })
    expect(toolEvents()).toEqual([
      {
        intent: "getBalances",
        tier: "read",
        outcome: "answered",
        latencyMs: 0,
        onDeviceModelAvailable: true,
      },
    ])
  })

  it("answers the model's prepare offline with the offline reply, and runs nothing", async () => {
    const { runtime, runTool } = withModel(
      modelCall({ intent: "prepareSend", args: { payee: "bob", amount: "5" } }),
    )

    const entries = await answerUtterance(
      runtime,
      "hook bob up with 5 dollars",
      env({ ...ON, isOffline: true }),
    )

    expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.actionsOffline" }])
    expect(runTool).not.toHaveBeenCalled()
  })

  it("reads the model's read call from the cache offline, served by the model", async () => {
    const { runtime, runTool, cachedGraphql } = withModel(
      modelCall({ intent: "getBalances", args: {} }),
    )
    cachedGraphql.wallets.mockResolvedValue(CASH_WALLETS)

    const entries = await answerUtterance(
      runtime,
      MISSED,
      env({ ...ON, isOffline: true }),
    )

    const [, deps] = runTool.mock.calls[0]
    expect(deps.graphql).toBe(runtime.cachedGraphql)
    expect(deps.actionDeps).toBeUndefined()
    expect(deps.servedByOnDeviceModel).toBe(true)
    expect(entries[0]).toMatchObject({ kind: "balances", stale: true })
  })

  // Plain loops rather than it.each: this repo's tsconfig types `it` without
  // .each (navigation-container-wrapper.spec.tsx).
  const NO_CALL: [string, ModelDecision | "not there"][] = [
    ["is not there", "not there"],
    ["runs out of time", { kind: "unavailable" }],
    ["names no call", { kind: "miss" }],
  ]
  NO_CALL.forEach(([name, decision]) =>
    it(`answers the miss reply and reports one event without the flag when the model ${name}`, async () => {
      const modelAdapter = fakeModelAdapter(
        decision === "not there" ? { kind: "unavailable" } : decision,
      )
      if (decision === "not there") modelAdapter.isAvailable.mockResolvedValue(false)
      const { runtime, runTool, toolEvents } = fakeRuntime({ modelAdapter })

      const entries = await answerUtterance(runtime, MISSED, env(ON))

      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(runTool).not.toHaveBeenCalled()
      expect(toolEvents()).toEqual([
        {
          intent: "unknown",
          tier: "none",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: false,
        },
      ])
    }),
  )

  it("answers the miss reply for a call the checks refuse, and reports it with the flag", async () => {
    const outOfSet = withModel(modelCall({ intent: "execute", args: {} }))
    const ungrounded = withModel(
      modelCall({ intent: "prepareSend", args: { payee: "eve", amount: "500" } }),
    )

    const refused = await answerUtterance(outOfSet.runtime, MISSED, env(ON))
    const notTyped = await answerUtterance(ungrounded.runtime, MISSED, env(ON))

    expect(refused).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
    expect(notTyped).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
    expect(outOfSet.runTool).not.toHaveBeenCalled()
    expect(ungrounded.runTool).not.toHaveBeenCalled()
    expect(outOfSet.toolEvents()).toEqual([
      {
        intent: "unknown",
        tier: "none",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: true,
      },
    ])
    expect(ungrounded.toolEvents()).toEqual([
      {
        intent: "prepareSend",
        tier: "action",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: true,
      },
    ])
  })

  it('answers "convert 20 dollars to btc" and "withdraw $50" as misses, whatever the model calls them (ENG-749)', async () => {
    // What the macOS model answered for them (ENG-690 proxy run): intents
    // outside the model tier's five, which the pre-check refuses.
    const answers: [string, { intent: string; args: Record<string, unknown> }][] = [
      [
        "convert 20 dollars to btc",
        { intent: "prepareConversion", args: { from: "USD", to: "BTC", amount: "20" } },
      ],
      ["withdraw $50", { intent: "prepareCashout", args: { amount: "50" } }],
    ]
    for (const [utterance, call] of answers) {
      // A plain miss, so the shipped order asks the model.
      expect(
        matchGrammar(utterance, { displayCurrency: "USD", displaySymbol: "$" }),
      ).toBe(undefined)
      const { runtime, modelAdapter, runTool, toolEvents } = withModel(modelCall(call))

      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(modelAdapter.decide).toHaveBeenCalledTimes(1)
      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(runTool).not.toHaveBeenCalled()
      // Refused by the checks: the model's rejection rate, its intent named.
      expect(toolEvents()).toEqual([
        {
          intent: call.intent,
          tier: "action",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: true,
        },
      ])
    }
  })

  it("is never asked while the flags keep it off", async () => {
    const { runtime, modelAdapter, runTool, toolEvents } = withModel(
      modelCall({ intent: "getBalances", args: {} }),
    )

    const off = await answerUtterance(runtime, MISSED, env({ onDeviceModel: false }))
    const absent = await answerUtterance(runtime, MISSED, env())

    expect(off).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
    expect(absent).toEqual(off)
    expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    expect(runTool).not.toHaveBeenCalled()
    expect(
      toolEvents().map(({ onDeviceModelAvailable }) => onDeviceModelAvailable),
    ).toEqual([false, false])
  })

  it("asks the model with the thread before this turn quoted, and the request outside it", async () => {
    const { runtime, modelAdapter } = withModel({ kind: "miss" })
    runtime.transcript.append([
      { kind: "user", text: "what's my balance" },
      { kind: "reply", replyKey: "Assistant.toolFailed" },
      // The request's own line: use-thread appends it before the turn runs.
      { kind: "user", text: MISSED },
    ])

    await answerUtterance(runtime as AssistantRuntime, MISSED, env(ON))

    const [{ prompt }] = modelAdapter.decide.mock.calls[0]
    const data = prompt.slice(prompt.indexOf(THREAD_OPEN), prompt.indexOf(THREAD_CLOSE))
    expect(data).toContain("what's my balance")
    expect(data).toContain("Assistant.toolFailed")
    expect(data).not.toContain(MISSED)
    expect(prompt.endsWith(`Request: ${MISSED}`)).toBe(true)
  })
})
