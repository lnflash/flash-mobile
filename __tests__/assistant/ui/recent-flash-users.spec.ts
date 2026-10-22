import { ApolloClient, InMemoryCache } from "@apollo/client"
import { createRecentFlashUsers } from "@app/assistant/ui/recent-flash-users"
import { lookupFlashUsername } from "@app/assistant/registry/read/lookup-flash-username"
import { voiceContext } from "@app/assistant/ui/voice-context"

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
