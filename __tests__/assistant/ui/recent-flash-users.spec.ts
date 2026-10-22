import { ApolloClient, InMemoryCache, gql } from "@apollo/client"
import { createRecentFlashUsers } from "@app/assistant/ui/recent-flash-users"
import { lookupFlashUsername } from "@app/assistant/registry/read/lookup-flash-username"
import { voiceContext } from "@app/assistant/ui/voice-context"

const WALLET = gql`
  query CachedUsername($username: Username!) {
    accountDefaultWallet(username: $username) {
      id
      walletCurrency
    }
  }
`

it("imports prior successful lookups even when the person is outside current contacts and recent history", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  client.writeQuery({
    query: WALLET,
    variables: { username: "dreadmax" },
    data: {
      accountDefaultWallet: {
        __typename: "UsdWallet",
        id: "prior-looked-up-wallet",
        walletCurrency: "USD",
      },
    },
  })
  client.writeQuery({
    query: WALLET,
    variables: { username: "dreadlocks" },
    data: { accountDefaultWallet: null },
  })
  const directory = createRecentFlashUsers(client, "existing-session")
  expect(directory.get()).toEqual(["dreadmax"])
  expect(
    await lookupFlashUsername("dreadlocks", directory.get(), async () => null),
  ).toEqual({ kind: "suggestions", matches: [] })
  const restored = new ApolloClient({
    cache: new InMemoryCache().restore(client.cache.extract()),
    connectToDevTools: false,
  })
  expect(createRecentFlashUsers(restored, "existing-session").get()).toEqual(["dreadmax"])
  // Old public query results are still in the cache, but a new account cannot import them again.
  expect(createRecentFlashUsers(restored, "another-session").get()).toEqual([])
})

it("records an empty legacy import so a different session cannot seed from old public queries", () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  expect(createRecentFlashUsers(client, "session-a").get()).toEqual([])
  client.writeQuery({
    query: WALLET,
    variables: { username: "alice" },
    data: {
      accountDefaultWallet: {
        __typename: "UsdWallet",
        id: "old-public-wallet",
        walletCurrency: "USD",
      },
    },
  })
  expect(createRecentFlashUsers(client, "session-b").get()).toEqual([])
})

it("upgrades an existing index that missed earlier successful username lookups", () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  client.writeQuery({
    query: gql`
      query ExistingRecentUsers {
        assistantRecentUsers @client
      }
    `,
    data: {
      assistantRecentUsers: JSON.stringify({ scope: "same-session", names: ["alice"] }),
    },
  })
  client.writeQuery({
    query: WALLET,
    variables: { username: "dreadmax" },
    data: {
      accountDefaultWallet: {
        __typename: "UsdWallet",
        id: "prior-wallet",
        walletCurrency: "USD",
      },
    },
  })
  const index = createRecentFlashUsers(client, "same-session")
  expect(index.get()).toEqual(["alice", "dreadmax"])
  client.writeQuery({
    query: WALLET,
    variables: { username: "bob" },
    data: {
      accountDefaultWallet: {
        __typename: "UsdWallet",
        id: "other-wallet",
        walletCurrency: "USD",
      },
    },
  })
  expect(createRecentFlashUsers(client, "same-session").get()).toEqual([
    "alice",
    "dreadmax",
  ])
})

it("retains removed contacts as search hints after restart and still verifies every suggestion", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const directory = createRecentFlashUsers(client, "account-host-a")
  directory.remember(["dreadmax"])
  directory.remember([]) // No current contacts after removal.
  const restored = createRecentFlashUsers(client, "account-host-a")
  const verify = jest.fn(async (name: string) =>
    name === "dreadmax" ? "verified-key" : null,
  )
  for (const heard of ["dread marks", "dreadlocks", "drug max", "dread max"]) {
    expect(await lookupFlashUsername(heard, restored.get(), verify)).toEqual({
      kind: "suggestions",
      matches: [{ username: "dreadmax", value: "verified-key" }],
    })
  }
  expect(verify).toHaveBeenCalledWith("dreadmax")
  expect(
    await lookupFlashUsername("dread marks", restored.get(), async () => null),
  ).toEqual({ kind: "suggestions", matches: [] })
  expect(voiceContext(restored.get())).toContain("Add dreadmax as a contact")
  expect(voiceContext(restored.get())).toContain("What's my balance")
})

it("bounds the directory, rejects invalid hints and isolates accounts and logout", async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    connectToDevTools: false,
  })
  const directory = createRecentFlashUsers(client, "account-a")
  directory.remember(["DreadMax", "dreadmax", "not a username", "person@elsewhere.com"])
  expect(directory.get()).toEqual(["dreadmax"])
  const before = directory.get()
  directory.remember(["DreadMax"])
  expect(directory.get()).toBe(before)
  directory.remember(Array.from({ length: 120 }, (_, i) => `user_${i}`))
  expect(directory.get()).toHaveLength(100)
  expect(createRecentFlashUsers(client, "account-b").get()).toEqual([])
  expect(createRecentFlashUsers(client, "account-a").get()).toEqual([])
  directory.remember(["alice"])
  await client.cache.reset()
  expect(createRecentFlashUsers(client, "account-a").get()).toEqual([])
})
