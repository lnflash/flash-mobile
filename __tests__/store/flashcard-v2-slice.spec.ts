/**
 * ENG-616 — flashcardV2 slice: the device-local record of the Cashu cards this
 * phone has read.
 */
import reducer, {
  cardForgotten,
  cardSeen,
  cardUnitResolved,
  initialFlashcardV2State,
  resetFlashcardV2,
} from "@app/store/redux/slices/flashcardV2Slice"
import {
  migrateFlashcardV2,
  migrations,
  PERSIST_VERSION,
} from "@app/store/redux/migrations"

const PUBKEY = "02" + "ab".repeat(32)

const seen = (overrides = {}) =>
  cardSeen({
    pubkey: PUBKEY,
    version: "0.2",
    pinState: "set",
    lastBalance: 1500,
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
      version: "0.2",
      pinState: "set",
      lastBalance: 1500,
      lastSeenAt: 1_000,
      unit: undefined,
    })
  })

  it("a later read updates balance and PIN state but keeps the unit a read cannot learn", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardUnitResolved({ pubkey: PUBKEY, unit: "usd" }))
    state = reducer(state, seen({ lastBalance: 900, pinState: "blocked", at: 2_000 }))

    expect(state.cards[PUBKEY]).toMatchObject({
      lastBalance: 900,
      pinState: "blocked",
      lastSeenAt: 2_000,
      unit: "usd",
    })
  })

  it("forgetting a card drops it and only it", () => {
    const other = "03" + "cd".repeat(32)
    let state = reducer(undefined, seen())
    state = reducer(state, seen({ pubkey: other }))
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))

    expect(state.cards[PUBKEY]).toBeUndefined()
    expect(state.cards[other]).toBeDefined()
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

describe("redux-persist migration to version 2", () => {
  it("is registered at the current persist version", () => {
    expect(PERSIST_VERSION).toBe(2)
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
