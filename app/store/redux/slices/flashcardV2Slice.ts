import { createSlice, PayloadAction } from "@reduxjs/toolkit"

import type { CardPinState } from "@app/utils/cashu-card"

/**
 * Flashcard v2 (Cashu card) — what this phone knows about the cards it has
 * tapped (ENG-616).
 *
 * The card itself keeps no history: no log, no counter, no clock. Everything a
 * user would call "history" — what was loaded, what was swept, when — exists
 * only where the app that did it wrote it down. This slice is that record.
 * It is device-local; a backend registry (ENG-618) is what would make it
 * survive a phone change.
 *
 * Nothing secret lives here: pubkeys, amounts, quote ids and timestamps. PIN
 * material never enters this slice — a PIN change is recorded as the fact that
 * it happened, nothing more.
 */

/** A card this phone has read, keyed by its P2PK pubkey (33 bytes, hex). */
export type KnownCard = {
  pubkey: string
  /** Applet version from the last read, e.g. "0.2". */
  version: string
  pinState: CardPinState
  /** The card's own unspent total at the last read, in the proofs' keyset unit. */
  lastBalance: number
  /** ms since epoch */
  lastSeenAt: number
  /** Mint keyset unit of the proofs on the card (`sat` / `usd`), once known. */
  unit?: string
  /** A name the user gave the card. */
  label?: string
}

/**
 * The ledger. Written by the flows that move value (top-up, sweep) and by
 * the PIN change; each is its own PR and adds its own reducer. The union is
 * declared here so the persisted shape is fixed before any of them ship.
 */
export type CardEvent =
  | {
      kind: "topup"
      id: string
      pubkey: string
      at: number
      amount: number
      unit: string
      /** NUT-04 mint quote id — the recovery handle for an interrupted top-up. */
      quoteId: string
      status: "pending" | "loaded" | "failed"
    }
  | {
      kind: "sweep"
      id: string
      pubkey: string
      at: number
      amount: number
      unit: string
      /** NUT-05 melt quote id, once the melt was requested. */
      meltQuoteId?: string
      status: "pending" | "settled" | "failed"
    }
  | {
      kind: "pinChanged"
      id: string
      pubkey: string
      at: number
    }

export interface FlashcardV2Slice {
  cards: Record<string, KnownCard>
  /** Newest last. */
  events: CardEvent[]
}

export const initialFlashcardV2State: FlashcardV2Slice = {
  cards: {},
  events: [],
}

export const flashcardV2Slice = createSlice({
  name: "flashcardV2",
  initialState: initialFlashcardV2State,
  reducers: {
    /** A read finished: remember the card and what it said about itself. */
    cardSeen: (
      state,
      action: PayloadAction<Omit<KnownCard, "lastSeenAt" | "label"> & { at: number }>,
    ) => {
      const { at, ...card } = action.payload
      const previous = state.cards[card.pubkey]
      state.cards[card.pubkey] = {
        ...previous,
        ...card,
        // A read never learns the unit or the label; keep what we knew.
        unit: card.unit ?? previous?.unit,
        lastSeenAt: at,
      }
    },
    cardLabelled: (state, action: PayloadAction<{ pubkey: string; label: string }>) => {
      const card = state.cards[action.payload.pubkey]
      if (card) card.label = action.payload.label
    },
    /** "Remove card": the card is forgotten; its ledger entries are not. */
    cardForgotten: (state, action: PayloadAction<{ pubkey: string }>) => {
      delete state.cards[action.payload.pubkey]
    },
    /** Append or replace by id, so a flow can record intent first and outcome later. */
    eventRecorded: (state, action: PayloadAction<CardEvent>) => {
      const index = state.events.findIndex((e) => e.id === action.payload.id)
      if (index === -1) state.events.push(action.payload)
      else state.events[index] = action.payload
    },
    resetFlashcardV2: () => initialFlashcardV2State,
  },
})

export const { cardSeen, cardLabelled, cardForgotten, eventRecorded, resetFlashcardV2 } =
  flashcardV2Slice.actions

export default flashcardV2Slice.reducer
