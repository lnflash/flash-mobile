import { createSlice, PayloadAction } from "@reduxjs/toolkit"

import type { CardPinState } from "@app/utils/cashu-card"

/**
 * Flashcard v2 (Cashu card) — the cards this phone has read (ENG-616).
 *
 * The card itself keeps no history: no log, no counter, no clock. What a user
 * would call a card's history exists only where the app that did something to
 * it wrote it down, so this device-local record is the only one until a
 * backend registry exists (ENG-618). Today it holds what each read said about
 * a card; the flows that move value (top-up, sweep) bring their own records
 * when they ship, designed together with their recovery story.
 *
 * Nothing secret lives here: pubkeys, versions, PIN *states*, amounts, units
 * and timestamps. Only a signed-in read writes to it, and logout resets it, so
 * one account's cards never greet the next account on the phone.
 */

/** A card this phone has read, keyed by its P2PK pubkey (33 bytes, hex). */
export type KnownCard = {
  pubkey: string
  /** Applet version from the last read, e.g. "0.2". */
  version: string
  pinState: CardPinState
  /** GET_BALANCE at the last read: every unspent proof, whatever its keyset. */
  lastBalance: number
  /** ms since epoch */
  lastSeenAt: number
  /**
   * The mint's unit (NUT-02 keyset `unit`, e.g. `sat`, `usd`) when every
   * unspent proof on the card is in that one unit, as the mint named it for
   * the last read it answered. Absent for an empty card, a card holding more
   * than one unit, or proofs in a keyset the mint does not list. A read alone
   * cannot learn it: the card stores keyset ids, not units.
   */
  unit?: string
}

export interface FlashcardV2Slice {
  cards: Record<string, KnownCard>
}

export const initialFlashcardV2State: FlashcardV2Slice = {
  cards: {},
}

export const flashcardV2Slice = createSlice({
  name: "flashcardV2",
  initialState: initialFlashcardV2State,
  reducers: {
    /** A read finished: remember the card and what it said about itself. */
    cardSeen: (
      state,
      action: PayloadAction<Omit<KnownCard, "lastSeenAt" | "unit"> & { at: number }>,
    ) => {
      const { at, ...card } = action.payload
      const previous = state.cards[card.pubkey]
      state.cards[card.pubkey] = {
        ...card,
        // A read never learns the unit; keep the last one the mint confirmed
        // until `cardUnitResolved` says otherwise.
        unit: previous?.unit,
        lastSeenAt: at,
      }
    },
    /**
     * The mint named the units of what the last read found. Sets the card's
     * unit, or clears it (`unit` undefined) when there is no single one. Only a
     * card already on record is touched: resolving a unit never invents one.
     */
    cardUnitResolved: (
      state,
      action: PayloadAction<{ pubkey: string; unit?: string }>,
    ) => {
      const card = state.cards[action.payload.pubkey]
      if (card) card.unit = action.payload.unit
    },
    /** "Remove card": this phone forgets the card. */
    cardForgotten: (state, action: PayloadAction<{ pubkey: string }>) => {
      delete state.cards[action.payload.pubkey]
    },
    /** Logout: forget every card. */
    resetFlashcardV2: () => initialFlashcardV2State,
  },
})

export const { cardSeen, cardUnitResolved, cardForgotten, resetFlashcardV2 } =
  flashcardV2Slice.actions

export default flashcardV2Slice.reducer
