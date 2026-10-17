import { act, renderHook } from "@testing-library/react-native"

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
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react")
  // Focus is the mount, blur the unmount.
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en"), locale: "en" }) }
})
jest.mock("@app/utils/toast", () => ({ toastShow: jest.fn() }))

import { cardOf } from "@app/assistant/cards/types"
import type { ToolResult } from "@app/assistant/registry/types"
import type { AssistantRuntime } from "@app/assistant/ui/assistant-runtime"
import type { TurnEnv } from "@app/assistant/ui/turn"
import { useThread } from "@app/assistant/ui/use-thread"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { toastShow } from "@app/utils/toast"
import { makeAction } from "../executor-harness"
import { btcPayment, graphqlTx, page } from "../fakes"
import { CASH_WALLETS, env, fakeRuntime } from "./thread-harness"

loadLocale("en")

// The Ask Flash thread's turns (app/assistant/ui/use-thread.ts, turn.ts):
// the grammar first, runTool only for a call, nothing that needs the network
// while offline, one turn at a time, and every prepared action held as
// typed text.

const render = (runtime: AssistantRuntime, turnEnv: TurnEnv = env()) =>
  renderHook(({ e }) => useThread(runtime, e), { initialProps: { e: turnEnv } })

type Hook = ReturnType<typeof render>

/** The thread's lines, without the ids the store gives them. */
const lines = (hook: Hook) =>
  hook.result.current.entries.map(({ id: _id, ...entry }) => entry)

const submit = async (hook: Hook, text: string) => {
  await act(() => hook.result.current.submit(text))
}

afterEach(() => jest.clearAllMocks())

describe("useThread", () => {
  it("opens the thread when the screen takes focus, and leaves it when it loses it", () => {
    const { runtime } = fakeRuntime()
    const open = jest.spyOn(runtime.executor, "openThread")
    const leave = jest.spyOn(runtime.executor, "leaveThread")

    const hook = render(runtime)
    expect(open).toHaveBeenCalledWith("thread-ask-flash")
    expect(leave).not.toHaveBeenCalled()

    hook.unmount()
    expect(leave).toHaveBeenCalledWith("thread-ask-flash")
  })

  it("answers a miss with the templated reply, and never calls runTool", async () => {
    const { runtime, runTool, toolEvents } = fakeRuntime()
    const hook = render(runtime)

    await submit(hook, "what's the meaning of life")

    expect(runTool).not.toHaveBeenCalled()
    expect(lines(hook)).toEqual([
      { kind: "user", text: "what's the meaning of life" },
      { kind: "reply", replyKey: "Assistant.unknownIntent" },
    ])
    // Counted as the router counts a call it cannot read.
    expect(toolEvents()).toEqual([
      expect.objectContaining({ intent: "unknown", tier: "none", outcome: "rejected" }),
    ])
  })

  it("answers an amount it cannot read with the amount reply, and never calls runTool", async () => {
    const { runtime, runTool } = fakeRuntime()
    const hook = render(runtime, env({ displayCurrency: "JMD", displaySymbol: "J$" }))

    await submit(hook, "send bob 5k")
    await submit(hook, "send $500 to bob")

    expect(runTool).not.toHaveBeenCalled()
    // Its example names the account's own currency code, which this
    // account reads: "500 JMD" here, never a code it would ask about again.
    expect(lines(hook).filter(({ kind }) => kind === "reply")).toEqual([
      { kind: "reply", replyKey: "Assistant.amountUnclear", params: { currency: "JMD" } },
      { kind: "reply", replyKey: "Assistant.amountUnclear", params: { currency: "JMD" } },
    ])
  })

  it("refuses a send, a request and the price offline, and runs nothing", async () => {
    const { runtime, runTool, graphql, cachedGraphql } = fakeRuntime()
    const hook = render(runtime, env({ isOffline: true }))

    await submit(hook, "send $5 to bob")
    await submit(hook, "make an invoice for $10")
    await submit(hook, "bitcoin price")

    expect(runTool).not.toHaveBeenCalled()
    expect(graphql.realtimePrice).not.toHaveBeenCalled()
    expect(cachedGraphql.realtimePrice).not.toHaveBeenCalled()
    expect(lines(hook).filter(({ kind }) => kind === "reply")).toEqual([
      { kind: "reply", replyKey: "Assistant.actionsOffline" },
      { kind: "reply", replyKey: "Assistant.actionsOffline" },
      { kind: "reply", replyKey: "Assistant.actionsOffline" },
    ])
  })

  it("reads balances from the cache offline, with no way to prepare, and labels them stale", async () => {
    const { runtime, runTool, graphql, cachedGraphql } = fakeRuntime()
    cachedGraphql.wallets.mockResolvedValue(CASH_WALLETS)
    const hook = render(runtime, env({ isOffline: true }))

    await submit(hook, "what's my balance")

    const [call, deps] = runTool.mock.calls[0]
    expect(call).toEqual({ intent: "getBalances", args: {} })
    expect(deps.graphql).toBe(runtime.cachedGraphql)
    expect(deps.actionDeps).toBeUndefined()
    expect(cachedGraphql.wallets).toHaveBeenCalledTimes(1)
    expect(graphql.wallets).not.toHaveBeenCalled()
    expect(lines(hook)[1]).toEqual({
      kind: "balances",
      stale: true,
      payload: {
        balances: [
          expect.objectContaining({ wallet: "USD", state: "ok" }),
          expect.objectContaining({ wallet: "BTC", state: "disabled" }),
        ],
      },
    })
  })

  it("reads from the network online, and nothing it shows is stale", async () => {
    const { runtime, runTool, graphql, cachedGraphql } = fakeRuntime()
    graphql.wallets.mockResolvedValue(CASH_WALLETS)
    const hook = render(runtime)

    await submit(hook, "what's my balance")

    expect(runTool.mock.calls[0][1].graphql).toBe(runtime.graphql)
    expect(runTool.mock.calls[0][1].actionDeps).toEqual(
      expect.objectContaining({ threadId: "thread-ask-flash" }),
    )
    expect(cachedGraphql.wallets).not.toHaveBeenCalled()
    expect(lines(hook)[1]).toEqual(
      expect.objectContaining({ kind: "balances", stale: false }),
    )
  })

  it("runs one turn at a time: what the user asks while one runs is ignored", async () => {
    const { runtime } = fakeRuntime()
    let finish: (result: ToolResult<unknown>) => void = () => undefined
    const runTool = jest.fn(
      () =>
        new Promise<ToolResult<unknown>>((resolve) => {
          finish = resolve
        }),
    )
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime)

    let first: Promise<void> = Promise.resolve()
    await act(async () => {
      first = hook.result.current.submit("what's my balance")
      hook.result.current.submit("bitcoin price")
    })
    expect(hook.result.current.busy).toBe(true)
    await act(() => hook.result.current.submit("show my transactions"))

    expect(runTool).toHaveBeenCalledTimes(1)
    expect(lines(hook)).toEqual([{ kind: "user", text: "what's my balance" }])

    await act(async () => {
      finish({ kind: "error", userMessage: "Assistant.toolFailed" })
      await first
    })
    expect(hook.result.current.busy).toBe(false)
  })

  it("holds every prepared action as typed text, and notes every result for the metrics", async () => {
    const { runtime } = fakeRuntime()
    const action = makeAction({ threadId: runtime.threadId })
    const results: ToolResult<unknown>[] = [
      { kind: "prepared", preparedAction: action },
      { kind: "error", userMessage: "Assistant.toolFailed" },
    ]
    runtime.runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    const add = jest.spyOn(runtime.executor, "addPrepared")
    const note = jest.spyOn(runtime.executor, "noteToolResult")
    const hook = render(runtime)

    await submit(hook, "send $5 to alice")
    await submit(hook, "what's my balance")

    expect(add.mock.calls).toEqual([[action, "text"]])
    expect(note.mock.calls).toEqual([
      ["thread-ask-flash", { kind: "prepared", preparedAction: action }],
      ["thread-ask-flash", { kind: "error", userMessage: "Assistant.toolFailed" }],
    ])
    expect(lines(hook)).toEqual([
      { kind: "user", text: "send $5 to alice" },
      {
        kind: "card",
        card: cardOf(action),
        call: {
          intent: "prepareSend",
          args: { payee: "alice", amount: "5", currency: "USD" },
        },
      },
      { kind: "user", text: "what's my balance" },
      { kind: "reply", replyKey: "Assistant.toolFailed" },
    ])
    await expect(runtime.executor.canConfirm(action.id)).resolves.toMatchObject({
      enabled: true,
      state: "armed",
    })
  })

  it("re-issues a question's call with the words it was about replaced by the pick", async () => {
    const { runtime } = fakeRuntime()
    const picked = makeAction({ threadId: runtime.threadId })
    const question: ToolResult<unknown> = {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [
          { id: "contact:alice_w", label: "Alice", sublabel: "alice_w" },
          { id: "contact:alicesmith", label: "Alice Smith", sublabel: "alicesmith" },
        ],
        about: "alice",
      },
    }
    const results = [question, { kind: "prepared", preparedAction: picked }]
    const runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")
    const asked = hook.result.current.entries[1]

    await act(() => hook.result.current.pick(asked.id, "contact:alicesmith"))

    expect((runTool.mock.calls as unknown[][])[1][0]).toEqual({
      intent: "prepareSend",
      args: { payee: "contact:alicesmith", amount: "5", currency: "USD" },
    })
    // The card for the pick takes the question's place.
    expect(lines(hook)).toEqual([
      { kind: "user", text: "send $5 to alice" },
      {
        kind: "card",
        card: cardOf(picked),
        call: {
          intent: "prepareSend",
          args: { payee: "contact:alicesmith", amount: "5", currency: "USD" },
        },
      },
    ])
  })

  it("re-issues a pick with the payee replaced, never a memo of the same words", async () => {
    // "send 5 to bob for bob": the memo is "bob" too.
    const { runtime } = fakeRuntime()
    const question: ToolResult<unknown> = {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "contact:bob_jones", label: "Bob Jones", sublabel: "bob_jones" }],
        about: "bob",
      },
    }
    const results = [question, { kind: "prepared", preparedAction: makeAction() }]
    const runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime)
    await submit(hook, "send 5 to bob for bob")
    expect((runTool.mock.calls as unknown[][])[0][0]).toEqual({
      intent: "prepareSend",
      args: { payee: "bob", amount: "5", memo: "bob" },
    })

    await act(() =>
      hook.result.current.pick(hook.result.current.entries[1].id, "contact:bob_jones"),
    )

    expect((runTool.mock.calls as unknown[][])[1][0]).toEqual({
      intent: "prepareSend",
      args: { payee: "contact:bob_jones", amount: "5", memo: "bob" },
    })
  })

  it("refuses a question's pick offline with the offline reply, and runs nothing", async () => {
    const { runtime } = fakeRuntime()
    const question: ToolResult<unknown> = {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "contact:alice_w", label: "Alice", sublabel: "alice_w" }],
        about: "alice",
      },
    }
    const runTool = jest.fn(async () => question)
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")
    const asked = hook.result.current.entries[1]

    // The connection drops before the pick.
    hook.rerender({ e: env({ isOffline: true }) })
    await act(() => hook.result.current.pick(asked.id, "contact:alice_w"))

    expect(runTool).toHaveBeenCalledTimes(1)
    // The question stays where it was, and the thread says why nothing ran.
    expect(lines(hook)).toEqual([
      { kind: "user", text: "send $5 to alice" },
      expect.objectContaining({ kind: "card", card: question.card }),
      { kind: "reply", replyKey: "Assistant.actionsOffline" },
    ])
    expect(hook.result.current.busy).toBe(false)
  })

  it("refuses a card's Try again or Refresh offline with the offline reply, and runs nothing", async () => {
    const { runtime } = fakeRuntime()
    const first = makeAction({ threadId: runtime.threadId })
    const runTool = jest.fn(
      async (): Promise<ToolResult<unknown>> => ({
        kind: "prepared",
        preparedAction: first,
      }),
    )
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const dismiss = jest.spyOn(runtime.executor, "dismiss")
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")

    hook.rerender({ e: env({ isOffline: true }) })
    await act(async () => {
      await hook.result.current.cardActions.reprepare?.(first.id)
    })

    expect(runTool).toHaveBeenCalledTimes(1)
    // The card and its action are kept: nothing was prepared in their place.
    expect(dismiss).not.toHaveBeenCalled()
    expect(lines(hook)).toEqual([
      { kind: "user", text: "send $5 to alice" },
      expect.objectContaining({ kind: "card", card: cardOf(first) }),
      { kind: "reply", replyKey: "Assistant.actionsOffline" },
    ])
  })

  it("keeps the payments a history answer lists as their rails gave them, for the app's row", async () => {
    // The projection drops the memo and the payee of an ask that searched
    // neither; the thread keeps the rows themselves for TxItem.
    const { runtime, graphql, btcRail } = fakeRuntime()
    const rent = graphqlTx({ id: "tx-rent", createdAt: 1_759_999_000, memo: "Rent" })
    const coffee = btcPayment({ id: "pay-coffee", timestamp: 1_759_998_000 })
    graphql.transactions.mockResolvedValue(page([rent]))
    btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 2_100 })
    btcRail.listPayments.mockResolvedValue([coffee])
    const hook = render(runtime)

    await submit(hook, "show my transactions")

    const answer = lines(hook)[1]
    expect(answer).toEqual(
      expect.objectContaining({
        kind: "transactions",
        stale: false,
        listed: {
          "graphql:tx-rent": { rail: "graphql", transaction: rent },
          "btc:pay-coffee": { rail: "btc", payment: coffee },
        },
      }),
    )
    // What runTool answered is still only the projection.
    expect(
      answer.kind === "transactions" && answer.payload.transactions[0],
    ).not.toHaveProperty("memo")
  })

  it("prepares a card's Try again or Refresh in the card's place, letting the old action go", async () => {
    const { runtime } = fakeRuntime()
    const first = makeAction({ threadId: runtime.threadId })
    const second = makeAction({ threadId: runtime.threadId })
    const results: ToolResult<unknown>[] = [
      { kind: "prepared", preparedAction: first },
      { kind: "prepared", preparedAction: second },
    ]
    runtime.runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    const dismiss = jest.spyOn(runtime.executor, "dismiss")
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")

    await act(async () => {
      await hook.result.current.cardActions.reprepare?.(first.id)
    })

    expect(dismiss).toHaveBeenCalledWith(first.id)
    expect(lines(hook).map((line) => line.kind)).toEqual(["user", "card"])
    expect(lines(hook)[1]).toEqual(expect.objectContaining({ card: cardOf(second) }))
  })

  it("puts a refreshed card in the old one's place, and says why", async () => {
    const { runtime } = fakeRuntime()
    const old = makeAction({ threadId: runtime.threadId })
    const fresh = makeAction({ threadId: runtime.threadId })
    runtime.runTool = jest.fn(
      async (): Promise<ToolResult<unknown>> => ({
        kind: "prepared",
        preparedAction: old,
      }),
    )
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")

    act(() =>
      hook.result.current.cardActions.onResult?.({
        kind: "refreshed",
        actionId: fresh.id,
        replacedActionId: old.id,
        preparedAction: fresh,
        replyKey: "Assistant.refreshed",
      }),
    )

    expect(lines(hook)).toEqual([
      { kind: "user", text: "send $5 to alice" },
      expect.objectContaining({ kind: "card", card: cardOf(fresh) }),
      { kind: "reply", replyKey: "Assistant.refreshed" },
    ])
  })

  it("puts what a Confirm reports of each leg on the card, which keeps its id", async () => {
    const { runtime } = fakeRuntime()
    const group = makeAction({ threadId: runtime.threadId })
    runtime.runTool = jest.fn(
      async (): Promise<ToolResult<unknown>> => ({
        kind: "prepared",
        preparedAction: group,
      }),
    )
    const hook = render(runtime)
    await submit(hook, "send $5 to alice")
    const before = hook.result.current.entries[1]
    const summary = { type: "groupSendSummary", legs: [{ status: "failed" }] }

    act(() =>
      hook.result.current.cardActions.onResult?.({
        kind: "executed",
        actionId: group.id,
        outcome: {
          status: "failed",
          replyKey: "Assistant.groupSendPartial",
          next: "confirmAgain",
          summary,
        },
      }),
    )

    const after = hook.result.current.entries[1]
    expect(after.id).toBe(before.id)
    expect(after).toEqual(
      expect.objectContaining({
        card: { ...summary, expiresAt: group.expiresAt, preparedActionId: group.id },
      }),
    )
  })

  it("hands a card's Confirm to the executor with the card's id, and the history check's one option", async () => {
    const { runtime } = fakeRuntime()
    const confirm = jest.spyOn(runtime.executor, "executePreparedAction")
    const hook = render(runtime)

    await act(async () => {
      await hook.result.current.cardActions.executePreparedAction("card-1")
      await hook.result.current.cardActions.executePreparedAction("card-1", {
        historyChecked: true,
      })
    })

    expect(confirm.mock.calls).toEqual([["card-1"], ["card-1", { historyChecked: true }]])
  })

  it("shows a toast, not a reply, when the thread's own glue fails", async () => {
    const { runtime } = fakeRuntime()
    runtime.runTool = jest.fn(async () => {
      throw new Error("glue")
    })
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const hook = render(runtime)

    await submit(hook, "what's my balance")

    expect(toastShow).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(lines(hook)).toEqual([{ kind: "user", text: "what's my balance" }])
    expect(hook.result.current.busy).toBe(false)
    warn.mockRestore()
  })

  it("ignores an empty submit", async () => {
    const { runtime, runTool } = fakeRuntime()
    const hook = render(runtime)

    await submit(hook, "   ")

    expect(runTool).not.toHaveBeenCalled()
    expect(lines(hook)).toEqual([])
  })
})
