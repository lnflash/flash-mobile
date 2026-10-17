import { cardOf } from "@app/assistant/cards/types"
import type { TransactionsProjection } from "@app/assistant/registry/projections"
import type { ListedTransaction } from "@app/assistant/ui/thread-store"
import { entriesFor, needsNetwork, reissue } from "@app/assistant/ui/turn"
import { toWalletAmount } from "@app/types/amounts"
import { makeAction } from "../executor-harness"
import { btcPayment, graphqlTx } from "../fakes"

// One turn's pieces (app/assistant/ui/turn.ts): which calls need the network,
// what each result puts in the thread, and how a question's pick re-issues a
// call.

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
