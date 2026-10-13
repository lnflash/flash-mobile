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
  fromFormat1,
} from "../../app/utils/cashu-card-topup"

const SERVER = "flashcard-v2-topups"

const record = (id: string, over: Partial<TopUpRecord> = {}): TopUpRecord => ({
  version: 2,
  cardFormat: 4,
  id,
  cardPubkey: "02" + "ab".repeat(32),
  mintUrl: "https://mint.test",
  unit: "sat",
  amount: 8,
  keysetId: "00aabbccddeeff00",
  quote: {
    id: `quote-${id}`,
    request: "lnbc",
    expiry: null,
    requestedAt: 1,
    quotedAt: 1,
    lifeMs: null,
  },
  outputs: [],
  payment: {
    walletId: "w",
    idempotencyKey: `key-${id}`,
    dispatched: false,
    everDispatched: false,
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

  it("reads a format-1 store (saved before card protocol 2.0) and keeps every record, as a 0.x card's, never as nothing", async () => {
    // What the store held before ENG-675: format 1, version-1 records with no cardFormat.
    const {
      version: _version,
      cardFormat: _format,
      ...v1
    } = record("paid-0x", {
      state: "minted",
      proofs: [
        {
          keysetId: "00aabbccddeeff00",
          amount: 8,
          nonce: "ab".repeat(32),
          C: "02" + "cd".repeat(32),
        } as never,
      ],
    })
    await Keychain.setInternetCredentials(
      SERVER,
      "topups",
      JSON.stringify({ format: 1, records: [{ ...v1, version: 1 }] }),
    )
    const store = createTopUpStore()
    const [read] = await store.list()
    expect(read).toMatchObject({
      id: "paid-0x",
      version: 2,
      cardFormat: 0,
      state: "minted",
    })
    expect(read.proofs).toEqual(v1.proofs)
    // A write saves it in format 2, unchanged otherwise, beside the new record.
    await store.put(record("new"))
    const stored = JSON.parse(
      ((await Keychain.getInternetCredentials(SERVER)) as { password: string }).password,
    )
    expect(stored.format).toBe(2)
    expect(stored.records.map((r: TopUpRecord) => [r.id, r.cardFormat])).toEqual([
      ["paid-0x", 0],
      ["new", 4],
    ])
  })

  it("fromFormat1 marks a record saved before 2.0 as a 0.x card's (cardFormat 0)", () => {
    const { version: _version, cardFormat: _format, ...v1 } = record("a")
    expect(fromFormat1({ ...v1, version: 1 })).toEqual({
      ...v1,
      version: 2,
      cardFormat: 0,
    })
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

  it("removes a record only if it still passes the test when its turn comes", async () => {
    const store = createTopUpStore()
    await store.put(record("a"))
    await store.put(record("b"))

    // A payment goes out for "a" while a drop decided from an earlier read waits its turn.
    const [, removedA] = await Promise.all([
      store.update("a", (r) => ({
        ...r,
        payment: { ...r.payment, dispatched: true, everDispatched: true },
      })),
      store.removeIf("a", (r) => !r.payment.everDispatched),
    ])
    expect(removedA).toBe(false)
    await expect(store.removeIf("b", (r) => !r.payment.everDispatched)).resolves.toBe(
      true,
    )
    await expect(store.removeIf("missing", () => true)).resolves.toBe(false)
    expect((await store.list()).map((r) => r.id)).toEqual(["a"])
  })

  it("never reads a Keychain failure as nothing to remove", async () => {
    const store = createTopUpStore()
    await store.put(record("a"))
    getCredentials.mockRejectedValueOnce(new Error("User interaction is not allowed"))

    await expect(store.removeIf("a", () => true)).rejects.toThrow(
      "User interaction is not allowed",
    )
    expect((await store.list()).map((r) => r.id)).toEqual(["a"])
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
