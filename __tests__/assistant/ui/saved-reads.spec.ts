import { ApolloClient, InMemoryCache } from "@apollo/client"
import { createSavedReads } from "@app/assistant/ui/saved-reads"
import { toUsdMoneyAmount } from "@app/types/amounts"
import type { NewEntry } from "@app/assistant/ui/thread-store"

const makeClient = () =>
  new ApolloClient({ cache: new InMemoryCache(), connectToDevTools: false })
const call = { intent: "getBalances", args: {} }
const balance: NewEntry = { kind: "balances", stale: false, payload: { balances: [] } }

it("restores a timestamped read after cache persistence, scoped to account and instance", () => {
  const client = makeClient()
  createSavedReads(client, "session-and-server-a").write(call, [balance], 1234)
  const restored = new ApolloClient({
    cache: new InMemoryCache().restore(client.cache.extract()),
    connectToDevTools: false,
  })
  expect(createSavedReads(restored, "session-and-server-a").read(call)).toEqual({
    fetchedAt: 1234,
    entries: [{ ...balance, stale: true }],
  })
  expect(createSavedReads(restored, "session-and-server-b").read(call)).toBeUndefined()
  expect(createSavedReads(restored).read(call)).toBeUndefined()
})
it("does not restore data after cache reset", async () => {
  const client = makeClient()
  const saved = createSavedReads(client, "session")
  saved.write(call, [balance], 1234)
  await client.cache.reset()
  expect(saved.read(call)).toBeUndefined()
})
it("does not persist transcripts, actions, prices, searches, memos, or counterparties", () => {
  const client = makeClient()
  const saved = createSavedReads(client, "session")
  saved.write({ intent: "prepareSend" }, [{ kind: "user", text: "secret" }], 1234)
  saved.write({ intent: "getPrice" }, [{ kind: "user", text: "secret" }], 1234)
  saved.write({ intent: "getTransactions", args: { query: "private" } }, [balance], 1234)
  expect(JSON.stringify(client.cache.extract())).not.toMatch(/secret|private/)
})
it("derives a narrower saved history view without persisting sender names or memos", () => {
  const client = makeClient()
  const saved = createSavedReads(client, "session")
  const history: NewEntry = {
    kind: "transactions",
    stale: false,
    payload: {
      btc: { state: "ok" },
      window: {
        searchedCount: 1,
        oldestTimestamp: 1000,
        rails: ["graphql", "btc"],
        replyKey: "Assistant.searchedWindow",
      },
      transactions: [
        {
          rail: "graphql",
          id: "received",
          direction: "RECEIVE",
          status: "SUCCESS",
          amount: toUsdMoneyAmount(100),
          fee: toUsdMoneyAmount(0),
          timestamp: 1000,
          memo: "private-memo",
          counterparty: "private-sender",
        },
      ],
    },
  }
  saved.write({ intent: "getTransactions", args: {} }, [history], 1234)
  const subset = saved.read({
    intent: "getTransactions",
    args: { direction: "RECEIVE", first: 1 },
  })
  expect(subset).toMatchObject({
    fetchedAt: 1234,
    entries: [
      {
        kind: "transactions",
        stale: true,
        payload: { transactions: [{ id: "received" }] },
      },
    ],
  })
  expect(JSON.stringify(client.cache.extract())).not.toMatch(
    /private-memo|private-sender/,
  )
  expect(
    saved.read({ intent: "getTransactions", args: { direction: "SEND", first: 1 } }),
  ).toBeUndefined()
})
