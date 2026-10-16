import { act, renderHook } from "@testing-library/react-native"
import type { ApolloClient } from "@apollo/client"

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
  return {
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en"), locale: "en" }) }
})

import { WalletOverviewScreenDocument } from "@app/graphql/generated"
import { getAssistantRuntime } from "@app/assistant/ui/assistant-runtime"
import { useThread } from "@app/assistant/ui/use-thread"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import { makeAction } from "../executor-harness"
import { env } from "./thread-harness"

loadLocale("en")

// The thread's runtime (app/assistant/ui/assistant-runtime.ts): one per
// Apollo client, so a logout or an account switch, which rebuilds the
// client, starts afresh, while leaving the screen and coming back does not.

/** A client whose reads answer `data`, as Apollo's would. */
const fakeClient = (data: unknown = {}) => {
  const query = jest.fn(async (_options: { query: unknown; fetchPolicy?: string }) => ({
    data,
  }))
  const mutate = jest.fn()
  return { query, mutate, client: { query, mutate } as unknown as ApolloClient<unknown> }
}

describe("getAssistantRuntime", () => {
  it("gives the same client the same runtime", () => {
    const { client } = fakeClient()

    expect(getAssistantRuntime(client)).toBe(getAssistantRuntime(client))
  })

  it("gives a new client a new runtime: its own executor, and an empty thread", async () => {
    const { client: before } = fakeClient()
    const { client: after } = fakeClient()
    const old = getAssistantRuntime(before)
    const action = makeAction({ threadId: old.threadId })
    old.executor.addPrepared(action, "text")
    old.transcript.append([{ kind: "user", text: "what's my balance" }])

    const fresh = getAssistantRuntime(after)

    expect(fresh).not.toBe(old)
    expect(fresh.threadId).not.toBe(old.threadId)
    expect(fresh.executor).not.toBe(old.executor)
    expect(fresh.transcript.get()).toEqual({ entries: [], busy: false })
    // What the old session prepared is nothing the new one can confirm.
    await expect(fresh.executor.canConfirm(action.id)).resolves.toMatchObject({
      enabled: false,
      state: "gone",
    })
    await expect(old.executor.canConfirm(action.id)).resolves.toMatchObject({
      enabled: true,
    })
  })

  it("keeps the thread when the screen remounts", async () => {
    const { client } = fakeClient()
    const first = renderHook(() => useThread(getAssistantRuntime(client), env()))
    await act(() => first.result.current.submit("what is lightning"))
    first.unmount()

    const second = renderHook(() => useThread(getAssistantRuntime(client), env()))

    expect(second.result.current.entries.map(({ kind }) => kind)).toEqual([
      "user",
      "reply",
    ])
  })

  it("reads the network through one rail and the cache alone through the other", async () => {
    const { client, query } = fakeClient({
      me: { defaultAccount: { wallets: [] } },
    })
    const runtime = getAssistantRuntime(client)

    await runtime.graphql.wallets()
    await runtime.cachedGraphql.wallets()

    expect(
      query.mock.calls.map(([options]) => [options.query, options.fetchPolicy]),
    ).toEqual([
      [WalletOverviewScreenDocument, "network-only"],
      [WalletOverviewScreenDocument, "cache-only"],
    ])
  })
})
