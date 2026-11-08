/**
 * ENG-616, ENG-675 — flashcardV2 slice: the device-local record of the Cashu
 * cards this phone has read, with each card's owner flag, whether it needs an
 * update, and its limits (card protocol 2.0).
 */
import reducer, {
  cardForgotten,
  cardLimitsSet,
  cardSeen,
  cardSetupSaved,
  cardUnitResolved,
  initialFlashcardV2State,
  keysetUnitsLearned,
  resetFlashcardV2,
  tidyOfferDismissed,
} from "@app/store/redux/slices/flashcardV2Slice"
import type { CardSetup } from "@app/utils/cashu-card-owner-store"
import {
  migrate,
  migrateFlashcardV2,
  migrateFlashcardV2Cards,
  migrations,
  PERSIST_VERSION,
} from "@app/store/redux/migrations"

const PUBKEY = "02" + "ab".repeat(32)

const seen = (overrides = {}) =>
  cardSeen({
    pubkey: PUBKEY,
    version: "2.0",
    pinState: "set",
    lastBalance: 1500,
    owned: true,
    needsUpdate: false,
    limits: { day: 0, allowance: 0, rollBudget: 7, rolls: 0 },
    at: 1_000,
    ...overrides,
  })

describe("flashcardV2 slice — known cards", () => {
  it("starts empty", () => {
    expect(reducer(undefined, { type: "@@init" })).toEqual(initialFlashcardV2State)
  })

  it("holds cards and nothing else: no ledger ships before a flow writes one", () => {
    expect(Object.keys(initialFlashcardV2State)).toEqual(["cards"])
  })

  it("remembers a card by pubkey with what the read said and when", () => {
    const state = reducer(undefined, seen())

    expect(state.cards[PUBKEY]).toEqual({
      pubkey: PUBKEY,
      version: "2.0",
      pinState: "set",
      lastBalance: 1500,
      owned: true,
      needsUpdate: false,
      limits: { day: 0, allowance: 0, rollBudget: 7, rolls: 0 },
      lastSeenAt: 1_000,
      unit: undefined,
    })
  })

  it("a later read with the same balance updates PIN state and keeps the unit a read cannot learn", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "usd" }))
    state = reducer(state, seen({ pinState: "blocked", at: 2_000 }))

    expect(state.cards[PUBKEY]).toMatchObject({
      lastBalance: 1500,
      pinState: "blocked",
      lastSeenAt: 2_000,
      unit: "usd",
    })
  })

  it("a read whose balance moved drops the unit until the mint names it again", () => {
    // The card held 1,500 sats; it was spent and reloaded in USD elsewhere.
    let state = reducer(undefined, seen())
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "sat" }))
    state = reducer(state, seen({ lastBalance: 500, at: 2_000 }))
    expect(state.cards[PUBKEY].lastBalance).toBe(500)
    expect(state.cards[PUBKEY].unit).toBeUndefined()

    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "usd" }))
    expect(state.cards[PUBKEY].unit).toBe("usd")
  })

  it("forgetting a card drops it and only it", () => {
    const other = "03" + "cd".repeat(32)
    let state = reducer(undefined, seen())
    state = reducer(state, seen({ pubkey: other }))
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))

    expect(state.cards[PUBKEY]).toBeUndefined()
    expect(state.cards[other]).toBeDefined()
  })

  it("a read attaches the card it read; forgetting it detaches it, and forgetting another card does not", () => {
    const OTHER = "03" + "cd".repeat(32)
    let state = reducer(undefined, seen({ pubkey: OTHER, at: 500 }))
    expect(state.attachedPubkey).toBe(OTHER)
    state = reducer(state, seen())
    expect(state.attachedPubkey).toBe(PUBKEY)

    state = reducer(state, cardForgotten({ pubkey: OTHER }))
    expect(state.attachedPubkey).toBe(PUBKEY)

    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))
    expect(state.attachedPubkey).toBeUndefined()
    expect(state.cards).toEqual({})
  })

  it("forgetting the attached card leaves an older card on record, unattached", () => {
    const OLD = "03" + "ae".repeat(32)
    let state = reducer(undefined, seen({ pubkey: OLD, at: 500 }))
    state = reducer(state, seen())
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))
    expect(Object.keys(state.cards)).toEqual([OLD])
    expect(state.attachedPubkey).toBeUndefined()
  })

  it("keeps the units the mint names, adding to what it named before", () => {
    const mint = "https://forge.flashapp.me"
    let state = reducer(undefined, keysetUnitsLearned({ mint, units: { aa: "sat" } }))
    state = reducer(state, keysetUnitsLearned({ mint, units: { bb: "usd" } }))
    expect(state.keysetUnitsByMint).toEqual({ [mint]: { aa: "sat", bb: "usd" } })
    expect(reducer(state, resetFlashcardV2()).keysetUnitsByMint).toBeUndefined()
  })

  // ENG-787: two mints can list the same keyset id.
  it("keeps each mint's units apart, under the mint's key", () => {
    let state = reducer(
      undefined,
      keysetUnitsLearned({ mint: "https://Forge.flashapp.me/", units: { aa: "sat" } }),
    )
    state = reducer(
      state,
      keysetUnitsLearned({
        mint: "https://mint.minibits.cash/Bitcoin",
        units: { aa: "usd" },
      }),
    )
    expect(state.keysetUnitsByMint).toEqual({
      "https://forge.flashapp.me": { aa: "sat" },
      "https://mint.minibits.cash/bitcoin": { aa: "usd" },
    })
    // The flat map of earlier builds is never written, and stays as it was.
    expect(state.keysetUnits).toBeUndefined()
  })

  it("reset drops everything", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, resetFlashcardV2())
    expect(state).toEqual(initialFlashcardV2State)
  })
})

describe("flashcardV2 slice — unit from the mint", () => {
  it("records the unit the mint named for every proof on the card", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "sat" }))
    expect(state.cards[PUBKEY].unit).toBe("sat")
  })

  it("clears it when the card no longer holds a single unit", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "sat" }))
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: undefined }))
    expect(state.cards[PUBKEY].unit).toBeUndefined()
  })

  it("never invents a card: a unit for a card not on record is dropped", () => {
    // A lookup that lands after the card was forgotten, or after a signed-out
    // read that was never recorded.
    const state = reducer(undefined, cardUnitResolved({ pubkey: PUBKEY, unit: "sat" }))
    expect(state.cards).toEqual({})
  })
})

describe("flashcardV2 slice — limits (ENG-675)", () => {
  it("keeps the payment limit this phone set across reads, which never see it", () => {
    let state = reducer(undefined, seen())
    state = reducer(
      state,
      cardLimitsSet({
        pubkey: PUBKEY,
        limits: { day: 5000, payment: 1000, allowance: 250, rollBudget: 12 },
      }),
    )
    expect(state.cards[PUBKEY].limits).toEqual({
      day: 5000,
      payment: 1000,
      allowance: 250,
      rollBudget: 12,
      rolls: 0,
    })
    state = reducer(
      state,
      seen({ limits: { day: 5000, allowance: 250, rollBudget: 12, rolls: 1 } }),
    )
    expect(state.cards[PUBKEY].limits).toEqual({
      day: 5000,
      allowance: 250,
      payment: 1000,
      rollBudget: 12,
      rolls: 1,
    })
  })

  it("takes the card's own payment limit from a read under the owner's grant, over the one this phone set", () => {
    // Another phone with the same key changed it to 0; the card said so here.
    let state = reducer(undefined, seen())
    state = reducer(
      state,
      cardLimitsSet({
        pubkey: PUBKEY,
        limits: { day: 5000, payment: 1000, allowance: 250, rollBudget: 7 },
      }),
    )
    state = reducer(state, seen({ limits: { day: 5000, payment: 0, allowance: 250 } }))
    expect(state.cards[PUBKEY].limits.payment).toBe(0)
  })

  it("drops it once the card reads with no owner: it changed hands", () => {
    let state = reducer(undefined, seen())
    state = reducer(
      state,
      cardLimitsSet({
        pubkey: PUBKEY,
        limits: { day: 0, payment: 1000, allowance: 0, rollBudget: 7 },
      }),
    )
    state = reducer(state, seen({ owned: false, limits: { day: 0, allowance: 0 } }))
    expect(state.cards[PUBKEY].limits.payment).toBeUndefined()
  })

  it("never invents a card for limits set on one not on record", () => {
    const state = reducer(
      undefined,
      cardLimitsSet({
        pubkey: PUBKEY,
        limits: { day: 1, payment: 1, allowance: 1, rollBudget: 7 },
      }),
    )
    expect(state.cards).toEqual({})
  })
})

describe("redux-persist migration to version 3 (ENG-675)", () => {
  it("is registered at the current persist version, after version 2's", () => {
    expect(PERSIST_VERSION).toBe(3)
    expect(migrations[3]).toBe(migrateFlashcardV2Cards)
    expect(migrations[2]).toBe(migrateFlashcardV2)
  })

  it("gives every card recorded before 2.0 an owner flag, limits off, and marks a 0.x card as needing an update", () => {
    const zeroX = {
      pubkey: PUBKEY,
      version: "0.6",
      pinState: "set",
      lastBalance: 21,
      lastSeenAt: 5,
      unit: "sat",
    }
    const migrated = migrateFlashcardV2Cards({
      flashcardV2: { cards: { [PUBKEY]: zeroX }, attachedPubkey: PUBKEY },
      other: { kept: true },
    })
    expect(migrated.flashcardV2.cards[PUBKEY]).toEqual({
      ...zeroX,
      owned: false,
      needsUpdate: true,
      limits: { day: 0, allowance: 0 },
    })
    expect(migrated.flashcardV2.attachedPubkey).toBe(PUBKEY)
    expect(migrated.other).toEqual({ kept: true })
  })

  it("does not mark a 2.0 card; a card whose version it cannot read reads as needing an update", () => {
    const migrated = migrateFlashcardV2Cards({
      flashcardV2: {
        cards: {
          a: { pubkey: "a", version: "2.0" },
          b: { pubkey: "b", version: undefined },
        },
      },
    })
    expect(migrated.flashcardV2.cards.a.needsUpdate).toBe(false)
    expect(migrated.flashcardV2.cards.b.needsUpdate).toBe(true)
  })

  it("leaves a store with no cards as it is, and keeps fields already there", () => {
    expect(migrateFlashcardV2Cards({ accountUpgrade: {} })).toEqual({
      accountUpgrade: {},
    })
    const done = {
      flashcardV2: {
        cards: {
          a: {
            pubkey: "a",
            version: "2.0",
            owned: true,
            needsUpdate: false,
            limits: { day: 9, allowance: 0 },
          },
        },
      },
    }
    expect(migrateFlashcardV2Cards(done).flashcardV2.cards.a).toEqual(
      done.flashcardV2.cards.a,
    )
  })
})

describe("redux-persist migration to version 2", () => {
  it("is registered at version 2", () => {
    expect(migrations[2]).toBe(migrateFlashcardV2)
  })

  it("gives a phone persisted before the slice existed an empty card list", () => {
    const migrated = migrateFlashcardV2({ accountUpgrade: { accountType: "ONE" } })
    expect(migrated.flashcardV2).toEqual(initialFlashcardV2State)
    expect(migrated.accountUpgrade).toEqual({ accountType: "ONE" })
  })

  it("keeps a slice that is already there", () => {
    const existing = { cards: { [PUBKEY]: { pubkey: PUBKEY } } }
    expect(migrateFlashcardV2({ flashcardV2: existing }).flashcardV2).toBe(existing)
  })
})

describe("flashcardV2 slice — tidy offer (ENG-702)", () => {
  const OTHER = "03" + "cd".repeat(32)

  it("remembers Not now per card, as the fingerprint of the pieces it was said to", () => {
    let state = reducer(
      initialFlashcardV2State,
      tidyOfferDismissed({ pubkey: PUBKEY, fingerprint: "f1" }),
    )
    state = reducer(state, tidyOfferDismissed({ pubkey: OTHER, fingerprint: "g1" }))
    expect(state.tidyDismissed).toEqual({ [PUBKEY]: "f1", [OTHER]: "g1" })
    // Said again to other pieces: the newer fingerprint stands.
    state = reducer(state, tidyOfferDismissed({ pubkey: PUBKEY, fingerprint: "f2" }))
    expect(state.tidyDismissed?.[PUBKEY]).toBe("f2")
  })

  it("forgets it with the card, and on reset", () => {
    let state = reducer(initialFlashcardV2State, seen())
    state = reducer(state, tidyOfferDismissed({ pubkey: PUBKEY, fingerprint: "f1" }))
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))
    expect(state.tidyDismissed).toEqual({})
    state = reducer(state, tidyOfferDismissed({ pubkey: PUBKEY, fingerprint: "f1" }))
    expect(reducer(state, resetFlashcardV2()).tidyDismissed).toBeUndefined()
  })
})

describe("flashcardV2 slice — setup records (ENG-826)", () => {
  const OTHER = "03" + "cd".repeat(32)
  const setup = (overrides: Partial<CardSetup> = {}, pubkey = PUBKEY): CardSetup => ({
    v: 1,
    intent: {
      cardPubkey: pubkey,
      mint: "https://mint.test",
      unit: 0,
      refundKey: null,
      design: null,
      pinChosen: true,
    },
    progress: { pinSent: true, recordSent: false, ownerSent: false },
    status: "started",
    updatedAt: 1_000,
    ...overrides,
  })

  it("starts absent: no initial value, so no persist migration", () => {
    expect(reducer(undefined, { type: "@@init" }).setups).toBeUndefined()
    expect(PERSIST_VERSION).toBe(3)
  })

  it("cardSetupSaved replaces the card's record and leaves another card's", () => {
    let state = reducer(undefined, cardSetupSaved(setup()))
    state = reducer(state, cardSetupSaved(setup({}, OTHER)))
    const next = setup({
      progress: { pinSent: true, recordSent: true, ownerSent: true },
      status: "set-up",
      heldByCard: { mint: "https://mint.test", unit: 0, refundKey: null, design: null },
      setUpAt: 2_000,
      updatedAt: 2_000,
    })
    state = reducer(state, cardSetupSaved(next))
    expect(state.setups?.[PUBKEY]).toEqual(next)
    expect(state.setups?.[OTHER]).toEqual(setup({}, OTHER))
  })

  it("Remove card keeps the setup record; logout drops every one (decision 3)", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardSetupSaved(setup()))
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))
    expect(state.cards[PUBKEY]).toBeUndefined()
    expect(state.setups?.[PUBKEY]).toEqual(setup())
    expect(reducer(state, resetFlashcardV2()).setups).toBeUndefined()
  })

  it("a store saved before setups (`{ cards }`) rehydrates with none", async () => {
    const saved = {
      accountUpgrade: {},
      flashcardV2: { cards: {} },
      _persist: { version: 3, rehydrated: false },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migrated: any = await migrate(saved as any, PERSIST_VERSION)
    expect(migrated.flashcardV2).toEqual({ cards: {} })
    expect(migrated.flashcardV2.setups).toBeUndefined()
  })
})

describe("flushPersisted (ENG-826)", () => {
  /** The AsyncStorage jest mock, as the module the store imports. */
  const asyncStorage = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@react-native-async-storage/async-storage")
    return (mod.default ??
      mod) as typeof import("@react-native-async-storage/async-storage").default
  }
  /** A fresh store module and its own AsyncStorage (empty), the store rehydrated. */
  const freshStore = async () => {
    let store!: typeof import("@app/store/redux")
    let storage!: typeof import("@react-native-async-storage/async-storage").default
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      store = require("@app/store/redux")
      storage = asyncStorage()
    })
    // Before rehydration nothing is written: it says so.
    await expect(store.flushPersisted()).rejects.toMatchObject({
      reason: "not-rehydrated",
    })
    await new Promise<void>((resolve) => {
      const check = (): unknown =>
        store.persistor.getState().bootstrapped ? resolve() : setTimeout(check, 1)
      check()
    })
    return { store, storage }
  }
  const record: CardSetup = {
    v: 1,
    intent: {
      cardPubkey: PUBKEY,
      mint: "https://mint.test",
      unit: 0,
      refundKey: null,
      design: null,
      pinChosen: false,
    },
    progress: { pinSent: false, recordSent: true, ownerSent: false },
    status: "started",
    updatedAt: 1,
  }
  /** What AsyncStorage holds for the persisted slice. */
  const onDisk = async (
    storage: typeof import("@react-native-async-storage/async-storage").default,
  ) => {
    const root = await storage.getItem("persist:root")
    return root ? JSON.parse(JSON.parse(root).flashcardV2) : undefined
  }

  it("resolves once AsyncStorage holds the record", async () => {
    const { store, storage } = await freshStore()
    store.store.dispatch(cardSetupSaved(record))
    await store.flushPersisted()
    expect((await onDisk(storage))?.setups?.[PUBKEY]).toEqual(record)
  })

  it("rejects when the write fails, though a bare persistor.flush() resolves", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const { store, storage } = await freshStore()
    const setItem = storage.setItem as jest.Mock
    setItem.mockImplementationOnce(async () => {
      throw new Error("disk full")
    })
    store.store.dispatch(cardSetupSaved(record))
    await expect(store.flushPersisted()).rejects.toMatchObject({
      name: "PersistWriteError",
      reason: "write-failed",
    })
    expect((await onDisk(storage))?.setups).toBeUndefined()

    // redux-persist alone swallows the failure: why flushPersisted exists.
    setItem.mockImplementationOnce(async () => {
      throw new Error("disk full")
    })
    store.store.dispatch(cardSetupSaved({ ...record, updatedAt: 2 }))
    await expect(store.persistor.flush()).resolves.toBeDefined()

    // The next write that lands clears it.
    store.store.dispatch(cardSetupSaved({ ...record, updatedAt: 3 }))
    await store.flushPersisted()
    expect((await onDisk(storage))?.setups?.[PUBKEY].updatedAt).toBe(3)
    error.mockRestore()
  })
})
