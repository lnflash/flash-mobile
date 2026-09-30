/**
 * ENG-616: where unfinished top-ups live. A paid top-up that is not on the card
 * yet is money only its saved record can deliver, so the store must never read
 * a failure as "nothing saved" and never let two writers overwrite each other.
 */
import * as Keychain from "react-native-keychain"

import {
  TopUpRecord,
  TopUpStoreError,
  createTopUpStore,
} from "../../app/utils/cashu-card-topup"

const SERVER = "flashcard-v2-topups"

const record = (id: string, over: Partial<TopUpRecord> = {}): TopUpRecord => ({
  version: 1,
  id,
  cardPubkey: "02" + "ab".repeat(32),
  mintUrl: "https://mint.test",
  unit: "sat",
  amount: 8,
  keysetId: "00aabbccddeeff00",
  quote: { id: `quote-${id}`, request: "lnbc", expiry: null },
  outputs: [],
  payment: {
    walletId: "w",
    idempotencyKey: `key-${id}`,
    dispatched: false,
    wentKeyless: false,
  },
  loadStarted: false,
  state: "quoted",
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

const getCredentials = Keychain.getInternetCredentials as jest.Mock

beforeEach(async () => {
  await Keychain.resetInternetCredentials({ server: SERVER })
  jest.clearAllMocks()
})

describe("createTopUpStore", () => {
  it("saves, reads back, updates and removes records", async () => {
    const store = createTopUpStore(() => 42)
    await store.put(record("a"))
    await store.put(record("b"))

    const updated = await store.update("a", (r) => ({ ...r, state: "paid" }))
    expect(updated).toMatchObject({ id: "a", state: "paid", updatedAt: 42 })
    expect((await store.get("a"))?.state).toBe("paid")

    await store.remove("a")
    expect((await store.list()).map((r) => r.id)).toEqual(["b"])
  })

  it("refuses to save a second record under an id already saved", async () => {
    const store = createTopUpStore()
    await store.put(record("a"))
    await expect(store.put(record("a", { amount: 16 }))).rejects.toBeInstanceOf(
      TopUpStoreError,
    )
    expect((await store.get("a"))?.amount).toBe(8)
  })

  it("never reads a Keychain failure as an empty list, so a later write cannot erase what is saved", async () => {
    const store = createTopUpStore()
    await store.put(record("paid", { state: "minted" }))
    getCredentials.mockRejectedValueOnce(new Error("User interaction is not allowed"))

    await expect(store.put(record("new"))).rejects.toThrow(
      "User interaction is not allowed",
    )
    expect((await store.list()).map((r) => r.id)).toEqual(["paid"])
  })

  it("never reads an unreadable or unknown saved value as an empty list", async () => {
    const store = createTopUpStore()
    await Keychain.setInternetCredentials(SERVER, "topups", "{not json")
    await expect(store.list()).rejects.toBeInstanceOf(TopUpStoreError)
    await expect(store.put(record("a"))).rejects.toBeInstanceOf(TopUpStoreError)

    await Keychain.setInternetCredentials(
      SERVER,
      "topups",
      JSON.stringify({ format: 9, records: [] }),
    )
    await expect(store.list()).rejects.toThrow(/unknown format/)
  })

  it("runs concurrent writes one after another, so neither overwrites the other", async () => {
    const store = createTopUpStore()
    await store.put(record("a"))
    await store.put(record("b"))

    await Promise.all([
      store.update("a", (r) => ({ ...r, state: "paid" })),
      store.update("b", (r) => ({ ...r, state: "minted" })),
      store.put(record("c")),
    ])

    const byId = Object.fromEntries((await store.list()).map((r) => [r.id, r.state]))
    expect(byId).toEqual({ a: "paid", b: "minted", c: "quoted" })
  })

  it("keeps a failed write from blocking the ones queued after it", async () => {
    const store = createTopUpStore()
    await expect(store.update("missing", (r) => r)).rejects.toBeInstanceOf(
      TopUpStoreError,
    )
    await expect(store.put(record("a"))).resolves.toBeTruthy()
  })

  it("keeps every unfinished top-up and only the 20 most recent loaded ones", async () => {
    const store = createTopUpStore()
    for (let i = 0; i < 23; i += 1) {
      await store.put(record(`loaded-${i}`, { state: "loaded", updatedAt: i }))
    }
    await store.put(record("unfinished", { state: "minted", updatedAt: 0 }))

    const ids = (await store.list()).map((r) => r.id)
    expect(ids).toContain("unfinished")
    expect(ids.filter((id) => id.startsWith("loaded-"))).toHaveLength(20)
    expect(ids).not.toContain("loaded-0")
    expect(ids).toContain("loaded-22")
  })
})
