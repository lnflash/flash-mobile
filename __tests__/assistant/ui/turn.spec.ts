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
import { btcPayment, fakeModelAdapter, graphqlTx, modelCall, USD_PRICE } from "../fakes"
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
    expect(needsNetwork({ intent: "searchMerchants", args: {} })).toBe(true)
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

  it("understands again in a named navigation request without changing the destination", async () => {
    const { runtime, runTool } = fakeRuntime()
    expect(await answerUtterance(runtime, "Show me my contacts again", env())).toEqual([
      { kind: "screen", destination: "contacts" },
    ])
    expect(runTool).not.toHaveBeenCalled()
  })

  it("routes merchant and payment searches through their existing read tools", async () => {
    const { runtime, runTool } = fakeRuntime()
    await answerUtterance(runtime, "Find merchants named Cafe", env())
    expect(runTool).toHaveBeenCalledWith(
      { intent: "searchMerchants", args: { query: "cafe" } },
      expect.anything(),
    )
    await answerUtterance(runtime, "Show my last payment to Alex", env())
    expect(runTool).toHaveBeenCalledWith(
      {
        intent: "getTransactions",
        args: { direction: "SEND", first: 10, query: "alex" },
      },
      expect.anything(),
    )
  })

  it("keeps profile and contact requests as explicit in-thread actions", async () => {
    const { runtime, runTool } = fakeRuntime()
    expect(await answerUtterance(runtime, "Add alice to my contacts", env())).toEqual([
      {
        kind: "contactAction",
        operation: "add",
        username: "alice",
        hostname: "flashapp.me",
      },
    ])
    expect(await answerUtterance(runtime, "Show me Alice's profile", env())).toEqual([
      {
        kind: "contactAction",
        operation: "profile",
        username: "alice",
        hostname: "flashapp.me",
      },
    ])
    expect(
      await answerUtterance(runtime, "Remove alice from my contacts", env()),
    ).toEqual([
      {
        kind: "contactAction",
        operation: "remove",
        username: "alice",
        hostname: "flashapp.me",
      },
    ])
    expect(runTool).not.toHaveBeenCalled()
    expect(
      await answerUtterance(
        runtime,
        "Remove alice from my contacts",
        env({ isOffline: true }),
      ),
    ).toEqual([{ kind: "reply", replyKey: "Assistant.actionsOffline" }])
  })

  it("routes spaced voice names to contact and profile lookup instead of unknown intent", async () => {
    const { runtime } = fakeRuntime()
    for (const [utterance, operation] of [
      ["Remove dread marks from my contacts", "remove"],
      ["Add dread marks to my contacts", "add"],
      ["Show me dread marks's profile", "profile"],
    ]) {
      expect(await answerUtterance(runtime, utterance, env())).toEqual([
        {
          kind: "contactAction",
          operation,
          username: "dread marks",
          hostname: "flashapp.me",
        },
      ])
    }
    expect(
      reissue(
        {
          intent: "getTransactions",
          args: { query: "dread marks", direction: "SEND", first: 10 },
        },
        "dread marks",
        "dreadmax",
      ),
    ).toEqual({
      intent: "getTransactions",
      args: { query: "dreadmax", direction: "SEND", first: 10 },
    })
  })

  it("opens the card top-up flow with the requested amount", async () => {
    const { runtime } = fakeRuntime()
    expect(await answerUtterance(runtime, "Add $20 to my card", env())).toEqual([
      { kind: "cardTopUp", amount: "20", currency: "USD", displayCurrency: "USD" },
    ])
  })

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

  it('never asks the model about a question about what something is: "what is lightning" (ENG-749)', async () => {
    // What the macOS model answered for it (ENG-690 proxy run).
    for (const utterance of ["what is lightning", "what's a sat", "whats an invoice"]) {
      const { runtime, modelAdapter, runTool, toolEvents } = withModel(
        modelCall({ intent: "getTransactions", args: { query: "lightning" } }),
      )

      const entries = await answerUtterance(runtime, utterance, env(ON))

      // Reviewed help stays local; other definitions retain the refusal.
      expect(entries).toEqual(
        utterance === "what is lightning"
          ? [{ kind: "help", topic: "lightning" }]
          : [{ kind: "reply", replyKey: "Assistant.unknownIntent" }],
      )
      expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
      expect(modelAdapter.decide).not.toHaveBeenCalled()
      expect(runTool).not.toHaveBeenCalled()
      expect(toolEvents()).toEqual(
        utterance === "what is lightning"
          ? []
          : [
              expect.objectContaining({
                outcome: "rejected",
                onDeviceModelAvailable: false,
              }),
            ],
      )
    }
    const how = withModel(modelCall({ intent: "getBalances", args: {} }))
    await expect(
      answerUtterance(how.runtime, "how does lightning work", env(ON)),
    ).resolves.toEqual([{ kind: "help", topic: "lightning" }])
    expect(how.modelAdapter.decide).not.toHaveBeenCalled()
  })

  it('answers a reference to the thread alone ("same ting again") with the miss reply, and never asks the model (ENG-749)', async () => {
    for (const utterance of ["same ting again", "again", "one more time"]) {
      const { runtime, modelAdapter, runTool, toolEvents, graphql } = withModel(
        modelCall({ intent: "getBalances", args: {} }),
      )
      graphql.wallets.mockResolvedValue(CASH_WALLETS)
      runtime.transcript.append([
        { kind: "user", text: "how loaded am i right now" },
        { kind: "reply", replyKey: "Assistant.toolFailed" },
        { kind: "user", text: utterance },
      ])

      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(modelAdapter.decide).not.toHaveBeenCalled()
      expect(runTool).not.toHaveBeenCalled()
      // No call from the model: today's miss event, without its flag.
      expect(toolEvents()).toEqual([
        {
          intent: "unknown",
          tier: "none",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: false,
        },
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

  it("runs a price read without the currency no word named, and its event says the currency was dropped (ENG-753)", async () => {
    // The dogfood answer: BTC for a price the ask quotes in no currency.
    const utterance = "how di bitcoin price a look"
    expect(matchGrammar(utterance, { displayCurrency: "USD", displaySymbol: "$" })).toBe(
      undefined,
    )
    const { runtime, runTool, graphql, toolEvents } = withModel(
      modelCall({ intent: "getPrice", args: { currency: "BTC" } }),
    )
    graphql.realtimePrice.mockResolvedValue(USD_PRICE)

    const entries = await answerUtterance(runtime, utterance, env(ON))

    const [routed, deps] = runTool.mock.calls[0]
    expect(routed).toEqual({ intent: "getPrice", args: {} })
    expect(deps.onDeviceModelReason).toBe("currencyDropped")
    // The display currency's price, as the grammar's read of a plain ask.
    expect(graphql.realtimePrice).toHaveBeenCalledWith("USD")
    expect(entries[0]).toMatchObject({ kind: "price" })
    // A passed call, not a refusal: answered, with the drop on its event.
    expect(toolEvents()).toEqual([
      {
        intent: "getPrice",
        tier: "read",
        outcome: "answered",
        latencyMs: 0,
        onDeviceModelAvailable: true,
        onDeviceModelReason: "currencyDropped",
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

  it("serves a model read from a saved projection offline without touching either rail", async () => {
    const { runtime, runTool, graphql, cachedGraphql, btcRail } = withModel(
      modelCall({ intent: "getBalances", args: {} }),
    )
    graphql.wallets.mockResolvedValue(CASH_WALLETS)
    await answerUtterance(runtime, "what's my balance", env())
    runTool.mockClear()
    graphql.wallets.mockClear()
    btcRail.getBalanceSats.mockClear()
    const entries = await answerUtterance(
      runtime,
      MISSED,
      env({ ...ON, isOffline: true }),
    )
    expect(runTool).not.toHaveBeenCalled()
    expect(graphql.wallets).not.toHaveBeenCalled()
    expect(cachedGraphql.wallets).not.toHaveBeenCalled()
    expect(btcRail.getBalanceSats).not.toHaveBeenCalled()
    expect(entries[0]).toMatchObject({
      kind: "balances",
      stale: true,
      asOf: expect.any(Number),
    })
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

  it("answers the miss reply for a call the checks refuse, and reports it with the flag and the reason", async () => {
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
        onDeviceModelReason: "precheck",
      },
    ])
    expect(ungrounded.toolEvents()).toEqual([
      {
        intent: "prepareSend",
        tier: "action",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: true,
        onDeviceModelReason: "ungrounded",
      },
    ])
  })

  it('prepares "withdraw $50" through the reviewed cash-out action, not the model', async () => {
    const { runtime, modelAdapter, runTool } = withModel(
      modelCall({ intent: "prepareSend", args: { payee: "your bank", amount: "50" } }),
    )
    await answerUtterance(runtime, "withdraw $50", env(ON))
    expect(modelAdapter.decide).not.toHaveBeenCalled()
    expect(runTool).toHaveBeenCalledWith(
      { intent: "prepareCashout", args: { amount: "50", currency: "USD" } },
      expect.anything(),
    )
  })

  it("asks the model on a plain miss, which a refused feature never is (ENG-753)", async () => {
    // "convert 20 dollars to btc" was the plain miss that reached the model
    // (ENG-749); since ENG-753 the grammar refuses a conversion before the
    // model is asked. A miss outside the refused features still reaches it.
    const { runtime, modelAdapter, runTool, toolEvents } = withModel(
      modelCall({
        intent: "prepareConversion",
        args: { from: "USD", to: "BTC", amount: "20" },
      }),
    )
    // "hook bob up with 5 dollars" is the plain miss the ENG-749 tests use.
    const entries = await answerUtterance(runtime, "hook bob up with 5 dollars", env(ON))
    expect(
      matchGrammar("hook bob up with 5 dollars", {
        displayCurrency: "USD",
        displaySymbol: "$",
      }),
    ).toBe(undefined)
    expect(modelAdapter.decide).toHaveBeenCalledTimes(1)
    expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
    expect(runTool).not.toHaveBeenCalled()
    expect(toolEvents()).toEqual([
      {
        intent: "prepareConversion",
        tier: "action",
        outcome: "rejected",
        latencyMs: 0,
        onDeviceModelAvailable: true,
        onDeviceModelReason: "precheck",
      },
    ])
  })

  it("refuses an unsafe conversion or a contacts ask before the model", async () => {
    // A conversion naming another person cannot become a payment to them.
    // The model also cannot invent a contacts history search.
    const answers: [string, { intent: string; args: Record<string, unknown> }][] = [
      [
        "swap 0.01 usd to bitcoin and send Bob",
        {
          intent: "prepareSend",
          args: {
            amount: "0.01",
            memo: "test",
            currency: "USD",
            payee: "user@example.com",
            sourceWallet: "USD",
          },
        },
      ],
      [
        "convert 20 dollars to btc for Alice",
        { intent: "prepareConversion", args: { from: "USD", to: "BTC", amount: "20" } },
      ],
      [
        "show my contacts",
        { intent: "getTransactions", args: { query: "John Doe", direction: "RECEIVE" } },
      ],
    ]
    for (const [utterance, call] of answers) {
      const { runtime, modelAdapter, runTool, toolEvents } = withModel(modelCall(call))

      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(modelAdapter.decide).not.toHaveBeenCalled()
      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(runTool).not.toHaveBeenCalled()
      // The grammar's refusal: no model answered, so no model's flag.
      expect(toolEvents()).toEqual([
        {
          intent: "unknown",
          tier: "none",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: false,
        },
      ])
    }
  })

  describe("the model tier's guards (ENG-751)", () => {
    const USD = { displayCurrency: "USD", displaySymbol: "$" }

    it("answers a group's ask the model made one send of with the miss reply, and reports the guard's reason with the model's flag", async () => {
      const utterance = "split 30 dollars between tanya and kemar"
      expect(matchGrammar(utterance, USD)).toBe(undefined)
      const { runtime, modelAdapter, runTool, toolEvents } = withModel(
        modelCall({
          intent: "prepareSend",
          args: { payee: "tanya", amount: "30", currency: "USD" },
        }),
      )

      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(modelAdapter.decide).toHaveBeenCalledTimes(1)
      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(runTool).not.toHaveBeenCalled()
      // The model answered with a call the model tier refused: its flag,
      // its intent, and the guard's reason, as for a refused call.
      expect(toolEvents()).toEqual([
        {
          intent: "prepareSend",
          tier: "action",
          outcome: "rejected",
          latencyMs: 0,
          onDeviceModelAvailable: true,
          onDeviceModelReason: "groupSend",
        },
      ])
    })

    it("answers a history read by date, or one searching for what no one asked, with the miss reply, and reports why", async () => {
      const cases: [string, Record<string, unknown>, string][] = [
        ["what did i receive yesterday", { direction: "RECEIVE" }, "timeFilter"],
        ["my biggest payment", { query: "biggest" }, "ungroundedFilter"],
        [
          "what did i send kemar",
          { query: "bob", direction: "SEND" },
          "ungroundedFilter",
        ],
      ]
      for (const [utterance, args, reason] of cases) {
        // A plain miss, so the shipped order asks the model.
        expect([utterance, matchGrammar(utterance, USD)]).toEqual([utterance, undefined])
        const { runtime, runTool, toolEvents } = withModel(
          modelCall({ intent: "getTransactions", args }),
        )

        const entries = await answerUtterance(runtime, utterance, env(ON))

        expect([utterance, entries]).toEqual([
          utterance,
          [{ kind: "reply", replyKey: "Assistant.unknownIntent" }],
        ])
        expect(runTool).not.toHaveBeenCalled()
        expect(toolEvents()).toEqual([
          {
            intent: "getTransactions",
            tier: "read",
            outcome: "rejected",
            latencyMs: 0,
            onDeviceModelAvailable: true,
            onDeviceModelReason: reason,
          },
        ])
      }
    })

    it("runs the model's history read without a direction no word of the ask gives, served by the model", async () => {
      const utterance = "what did i send kemar"
      expect(matchGrammar(utterance, USD)).toBe(undefined)
      const { runtime, runTool, graphql } = withModel(
        modelCall({
          intent: "getTransactions",
          args: { query: "kemar", direction: "RECEIVE" },
        }),
      )
      graphql.transactions.mockResolvedValue({
        rows: [],
        hasNextPage: false,
        endCursor: null,
      })

      await answerUtterance(runtime, utterance, env(ON))

      expect(runTool).toHaveBeenCalledTimes(1)
      const [routed, deps] = runTool.mock.calls[0]
      expect(routed).toEqual({ intent: "getTransactions", args: { query: "kemar" } })
      expect(deps.servedByOnDeviceModel).toBe(true)
    })

    it("knows people by the contacts the app's cache holds, and never asks the network for them", async () => {
      const utterance = "throw tanya 20 for kemar's taxi"
      const call = {
        intent: "prepareSend",
        args: { payee: "tanya", amount: "20", memo: "kemar's taxi" },
      }
      const contact = (username: string, alias: string) => ({
        __typename: "UserContact",
        id: username,
        username,
        alias,
        transactionsCount: 1,
      })
      const { runtime, runTool, graphql, cachedGraphql, toolEvents } = withModel(
        modelCall(call),
      )
      cachedGraphql.contacts.mockResolvedValue([
        contact("tanya_b", "Tanya"),
        contact("kemar99", "Kemar Brown"),
      ])

      const entries = await answerUtterance(runtime, utterance, env(ON))

      expect(entries).toEqual([{ kind: "reply", replyKey: "Assistant.unknownIntent" }])
      expect(runTool).not.toHaveBeenCalled()
      expect(cachedGraphql.contacts).toHaveBeenCalledTimes(1)
      expect(graphql.contacts).not.toHaveBeenCalled()
      expect(toolEvents()).toEqual([
        expect.objectContaining({
          intent: "prepareSend",
          onDeviceModelReason: "groupSend",
        }),
      ])
    })
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
