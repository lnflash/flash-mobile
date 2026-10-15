/**
 * ENG-616: where unfinished top-ups live. A paid top-up that is not on the card
 * yet is money only its saved record can deliver, so the store must never read
 * a failure as "nothing saved" and never let two writers overwrite each other.
 */
import * as Keychain from "react-native-keychain"

import {
  TidyRecord,
  TopUpRecord,
  TopUpStoreError,
  createTopUpStore,
  fromFormat1,
} from "../../app/utils/cashu-card-topup"

const SERVER = "flashcard-v2-topups"
const ARCHIVE = "flashcard-v2-tidy-archive"

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
  await Keychain.resetInternetCredentials({ server: ARCHIVE })
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

  describe("card tidies (ENG-702)", () => {
    const tidy = (id: string, over: Partial<TidyRecord> = {}): TidyRecord => ({
      kind: "tidy",
      version: 1,
      id,
      cardPubkey: "02" + "ab".repeat(32),
      mintUrl: "https://mint.test",
      keysetId: "00aabbccddeeff00",
      fee: 0,
      inputs: [
        { slot: 3, nonce: "ab".repeat(32), C: "02" + "cd".repeat(32), amount: 16 },
      ],
      outputs: [
        { amount: 8 },
        { amount: 4 },
        { amount: 2 },
        { amount: 1 },
        { amount: 1 },
      ],
      loadStarted: false,
      state: "planned",
      createdAt: 1,
      updatedAt: 1,
      ...over,
    })
    const stored = async () =>
      JSON.parse(
        ((await Keychain.getInternetCredentials(SERVER)) as { password: string })
          .password,
      )

    it("round-trips a tidy beside the top-ups, each read only as its own kind", async () => {
      const store = createTopUpStore(() => 7)
      await store.put(record("top-up"))
      await store.tidies.put(tidy("tidy"))

      expect(await store.tidies.get("tidy")).toEqual(tidy("tidy"))
      expect((await store.list()).map((r) => r.id)).toEqual(["top-up"])
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["tidy"])
      expect(await store.get("tidy")).toBeUndefined()

      const signed = await store.tidies.update("tidy", (r) => ({
        ...r,
        signature: "11".repeat(64),
        state: "signed",
      }))
      expect(signed).toMatchObject({ state: "signed", updatedAt: 7 })
      expect((await store.tidies.get("tidy"))?.signature).toBe("11".repeat(64))
    })

    it("keeps the tidies through every top-up write, and the top-ups through every tidy write", async () => {
      const store = createTopUpStore()
      await store.tidies.put(tidy("tidy"))
      await store.put(record("a"))
      await store.update("a", (r) => ({ ...r, state: "paid" }))
      await store.remove("a")
      await store.put(record("b"))
      await store.removeIf("b", () => true)
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["tidy"])

      await store.put(record("c"))
      await store.tidies.update("tidy", (r) => ({ ...r, state: "signed" }))
      expect((await store.list()).map((r) => r.id)).toEqual(["c"])
    })

    it("refuses a second record under an id already saved, of either kind", async () => {
      const store = createTopUpStore()
      await store.put(record("x"))
      await expect(store.tidies.put(tidy("x"))).rejects.toBeInstanceOf(TopUpStoreError)
      await expect(store.tidies.update("missing", (r) => r)).rejects.toBeInstanceOf(
        TopUpStoreError,
      )
    })

    it("drops a tidy once nothing is owed on it: loaded, or abandoned", async () => {
      const store = createTopUpStore()
      await store.tidies.put(tidy("done"))
      await store.tidies.put(tidy("dropped"))
      await store.tidies.put(tidy("kept"))
      await store.tidies.update("done", (r) => ({ ...r, state: "loaded" }))
      await store.tidies.update("dropped", (r) => ({ ...r, state: "abandoned" }))
      await store.tidies.update("kept", (r) => ({ ...r, state: "needs-card" }))
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["kept"])
    })

    it("still reads a format-2 store, and writes format 3 only while a tidy is saved", async () => {
      await Keychain.setInternetCredentials(
        SERVER,
        "topups",
        JSON.stringify({ format: 2, records: [record("old")] }),
      )
      const store = createTopUpStore()
      expect((await store.list()).map((r) => r.id)).toEqual(["old"])
      expect(await store.tidies.list()).toEqual([])

      await store.tidies.put(tidy("tidy"))
      expect((await stored()).format).toBe(3)

      await store.tidies.update("tidy", (r) => ({ ...r, state: "loaded" }))
      expect(await stored()).toEqual({ format: 2, records: [record("old")] })
    })

    it("leaves a build from before tidies unable to read a store holding one: it refuses, never reads a tidy as a top-up or writes over it", async () => {
      const store = createTopUpStore()
      await store.put(record("top-up"))
      await store.tidies.put(
        tidy("owed", { state: "signed", signature: "11".repeat(64) }),
      )
      const saved = await stored()
      // A format-2 build reads `format` first and throws on any it does not know.
      expect(saved.format).toBe(3)
      expect(saved.format).not.toBe(2)
      expect(saved.records.find((r: { id: string }) => r.id === "owed")).toMatchObject({
        kind: "tidy",
        state: "signed",
      })

      // And this build does the same to a newer one: refused, and nothing written.
      await Keychain.setInternetCredentials(
        SERVER,
        "topups",
        JSON.stringify({ format: 4, records: [] }),
      )
      const setCredentials = Keychain.setInternetCredentials as jest.Mock
      setCredentials.mockClear()
      await expect(store.tidies.list()).rejects.toThrow(/unknown format/)
      await expect(store.tidies.put(tidy("new"))).rejects.toThrow(/unknown format/)
      await expect(store.put(record("new"))).rejects.toThrow(/unknown format/)
      expect(setCredentials).not.toHaveBeenCalled()
    })

    it("archives a dismissed `needs-card` tidy, signature and all, and goes back to format 2", async () => {
      const store = createTopUpStore(() => 9)
      await store.put(record("top-up"))
      await store.tidies.put(
        tidy("stuck", { state: "needs-card", signature: "22".repeat(64) }),
      )
      expect((await stored()).format).toBe(3)

      await expect(store.tidies.archive("stuck")).resolves.toBe(true)

      expect(await store.tidies.list()).toEqual([])
      expect(await stored()).toEqual({ format: 2, records: [record("top-up")] })
      expect(await store.tidies.archived()).toEqual([
        tidy("stuck", { state: "needs-card", signature: "22".repeat(64), updatedAt: 9 }),
      ])
      // Gone from the list already: nothing more to move.
      await expect(store.tidies.archive("stuck")).resolves.toBe(false)
    })

    it("refuses to archive a tidy still owed: only its record can finish it", async () => {
      const store = createTopUpStore()
      await store.tidies.put(
        tidy("owed", { state: "signed", signature: "11".repeat(64) }),
      )
      await expect(store.tidies.archive("owed")).rejects.toBeInstanceOf(TopUpStoreError)
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["owed"])
      expect(await store.tidies.archived()).toEqual([])
    })

    it("copies to the archive before it leaves the list: a cut in between leaves it in both, and a second dismiss finishes", async () => {
      const store = createTopUpStore()
      await store.tidies.put(tidy("stuck", { state: "needs-card" }))
      const setCredentials = Keychain.setInternetCredentials as jest.Mock
      // The archive write lands; the list write after it fails.
      setCredentials.mockImplementationOnce(
        setCredentials.getMockImplementation() as (...args: unknown[]) => unknown,
      )
      setCredentials.mockRejectedValueOnce(new Error("Keychain write failed"))

      await expect(store.tidies.archive("stuck")).rejects.toThrow("Keychain write failed")
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["stuck"])
      expect((await store.tidies.archived()).map((r) => r.id)).toEqual(["stuck"])

      await expect(store.tidies.archive("stuck")).resolves.toBe(true)
      expect(await store.tidies.list()).toEqual([])
      expect((await store.tidies.archived()).map((r) => r.id)).toEqual(["stuck"])
    })

    it("never reads an unreadable archive as empty", async () => {
      const store = createTopUpStore()
      await Keychain.setInternetCredentials(ARCHIVE, "tidies", "not json")
      await expect(store.tidies.archived()).rejects.toBeInstanceOf(TopUpStoreError)
      await store.tidies.put(tidy("stuck", { state: "needs-card" }))
      await expect(store.tidies.archive("stuck")).rejects.toBeInstanceOf(TopUpStoreError)
      expect((await store.tidies.list()).map((r) => r.id)).toEqual(["stuck"])
    })
  })
})
