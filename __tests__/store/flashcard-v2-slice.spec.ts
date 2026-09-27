/**
 * ENG-616 — flashcardV2 slice: the device-local record of tapped Cashu cards
 * and the ledger the money flows write into.
 */
import reducer, {
  cardForgotten,
  cardLabelled,
  cardSeen,
  eventRecorded,
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

  it("a later read updates balance and PIN state but keeps the unit and label a read cannot learn", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, cardLabelled({ pubkey: PUBKEY, label: "Wallet card" }))
    state = reducer(state, seen({ unit: "usd" }))
    state = reducer(state, seen({ lastBalance: 900, pinState: "blocked", at: 2_000 }))

    expect(state.cards[PUBKEY]).toMatchObject({
      lastBalance: 900,
      pinState: "blocked",
      lastSeenAt: 2_000,
      unit: "usd",
      label: "Wallet card",
    })
  })

  it("labelling an unknown card is a no-op rather than inventing one", () => {
    const state = reducer(undefined, cardLabelled({ pubkey: "02ff", label: "x" }))
    expect(state.cards).toEqual({})
  })

  it("forgetting a card keeps its ledger entries", () => {
    let state = reducer(undefined, seen())
    state = reducer(
      state,
      eventRecorded({
        kind: "topup",
        id: "t1",
        pubkey: PUBKEY,
        at: 1_500,
        amount: 500,
        unit: "usd",
        quoteId: "q1",
        status: "loaded",
      }),
    )
    state = reducer(state, cardForgotten({ pubkey: PUBKEY }))

    expect(state.cards[PUBKEY]).toBeUndefined()
    expect(state.events).toHaveLength(1)
  })
})

describe("flashcardV2 slice — ledger", () => {
  it("records intent first and lets the outcome replace it by id", () => {
    const pending = {
      kind: "sweep" as const,
      id: "s1",
      pubkey: PUBKEY,
      at: 3_000,
      amount: 1500,
      unit: "usd",
      status: "pending" as const,
    }
    let state = reducer(undefined, eventRecorded(pending))
    state = reducer(
      state,
      eventRecorded({ ...pending, meltQuoteId: "m1", status: "settled" }),
    )

    expect(state.events).toEqual([{ ...pending, meltQuoteId: "m1", status: "settled" }])
  })

  it("appends in order, newest last", () => {
    let state = reducer(
      undefined,
      eventRecorded({ kind: "pinChanged", id: "p1", pubkey: PUBKEY, at: 1 }),
    )
    state = reducer(
      state,
      eventRecorded({ kind: "pinChanged", id: "p2", pubkey: PUBKEY, at: 2 }),
    )
    expect(state.events.map((e) => e.id)).toEqual(["p1", "p2"])
  })

  it("never stores PIN material — a PIN change is only the fact of it", () => {
    const state = reducer(
      undefined,
      eventRecorded({ kind: "pinChanged", id: "p1", pubkey: PUBKEY, at: 1 }),
    )
    expect(JSON.stringify(state)).not.toMatch(/pin["']?\s*:/i)
  })

  it("reset drops everything", () => {
    let state = reducer(undefined, seen())
    state = reducer(state, resetFlashcardV2())
    expect(state).toEqual(initialFlashcardV2State)
  })
})

describe("redux-persist migration to version 2", () => {
  it("is registered at the current persist version", () => {
    expect(PERSIST_VERSION).toBe(2)
    expect(migrations[2]).toBe(migrateFlashcardV2)
  })

  it("gives a phone persisted before the slice existed an empty ledger", () => {
    const migrated = migrateFlashcardV2({ accountUpgrade: { accountType: "ONE" } })
    expect(migrated.flashcardV2).toEqual(initialFlashcardV2State)
    expect(migrated.accountUpgrade).toEqual({ accountType: "ONE" })
  })

  it("keeps a slice that is already there", () => {
    const existing = { cards: { [PUBKEY]: { pubkey: PUBKEY } }, events: [] }
    expect(migrateFlashcardV2({ flashcardV2: existing }).flashcardV2).toBe(existing)
  })
})
