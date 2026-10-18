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
import { makeAction } from "../executor-harness"
import { fakeModelAdapter, modelCall } from "../fakes"
import { env, fakeRuntime } from "./thread-harness"

loadLocale("en")

// The thread's calls issued again from a card (app/assistant/ui/use-thread.ts)
// and the on-device model (ENG-690): a card's line keeps whether the model
// emitted its call, so a pick, a Try again or a Refresh of that card reports
// the model's flag in its event (analytics.ts, onDeviceModelAvailable), and a
// card the grammar prepared never does. Beside use-thread.spec.tsx, which
// covers the thread's turns.

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

describe("useThread and the on-device model (ENG-690)", () => {
  it("says the model served a pick, a Try again or a Refresh of a card it prepared", async () => {
    // ENG-690: a card's line keeps where its call came from, so a call it
    // issues again reports the model's flag, as the first run did.
    const call = {
      intent: "prepareSend",
      args: { payee: "alice", amount: "5", currency: "USD" },
    }
    const { runtime } = fakeRuntime({ modelAdapter: fakeModelAdapter(modelCall(call)) })
    const question: ToolResult<unknown> = {
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "contact:alice_w", label: "Alice", sublabel: "alice_w" }],
        about: "alice",
      },
    }
    const picked = makeAction({ threadId: runtime.threadId })
    const again = makeAction({ threadId: runtime.threadId })
    const fresh = makeAction({ threadId: runtime.threadId })
    const results: ToolResult<unknown>[] = [
      question,
      { kind: "prepared", preparedAction: picked },
      { kind: "prepared", preparedAction: again },
      { kind: "prepared", preparedAction: makeAction({ threadId: runtime.threadId }) },
    ]
    const runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime, env({ onDeviceModel: true }))

    // Words the grammar has no rule for: the model's call asks which Alice.
    await submit(hook, "hook alice up with 5 dollars")
    await act(() =>
      hook.result.current.pick(hook.result.current.entries[1].id, "contact:alice_w"),
    )
    expect(lines(hook)[1]).toEqual(
      expect.objectContaining({ card: cardOf(picked), servedByOnDeviceModel: true }),
    )
    // A Try again, then a Refresh of the card a Confirm refreshed.
    await act(async () => {
      await hook.result.current.cardActions.reprepare?.(picked.id)
    })
    act(() =>
      hook.result.current.cardActions.onResult?.({
        kind: "refreshed",
        actionId: fresh.id,
        replacedActionId: again.id,
        preparedAction: fresh,
        replyKey: "Assistant.refreshed",
      }),
    )
    expect(lines(hook)[1]).toEqual(
      expect.objectContaining({ card: cardOf(fresh), servedByOnDeviceModel: true }),
    )
    await act(async () => {
      await hook.result.current.cardActions.reprepare?.(fresh.id)
    })

    const calls = runTool.mock.calls as unknown as [unknown, Record<string, unknown>][]
    expect(calls.map(([, deps]) => deps.servedByOnDeviceModel)).toEqual([
      true,
      true,
      true,
      true,
    ])
    expect(calls[1][0]).toEqual({
      intent: "prepareSend",
      args: { payee: "contact:alice_w", amount: "5", currency: "USD" },
    })
  })

  it("never says the model served a Try again of a card the grammar prepared", async () => {
    const { runtime } = fakeRuntime({
      modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
    })
    const first = makeAction({ threadId: runtime.threadId })
    const results: ToolResult<unknown>[] = [
      { kind: "prepared", preparedAction: first },
      { kind: "prepared", preparedAction: makeAction({ threadId: runtime.threadId }) },
    ]
    const runTool = jest.fn(async () => results.shift() as ToolResult<unknown>)
    runtime.runTool = runTool as unknown as AssistantRuntime["runTool"]
    const hook = render(runtime, env({ onDeviceModel: true }))

    await submit(hook, "send $5 to alice")
    await act(async () => {
      await hook.result.current.cardActions.reprepare?.(first.id)
    })

    const calls = runTool.mock.calls as unknown as [unknown, Record<string, unknown>][]
    expect(calls).toHaveLength(2)
    calls.forEach(([, deps]) => expect(deps.servedByOnDeviceModel).toBeUndefined())
    expect(lines(hook)[1]).not.toHaveProperty("servedByOnDeviceModel")
  })
})
