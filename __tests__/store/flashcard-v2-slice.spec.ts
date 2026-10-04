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
