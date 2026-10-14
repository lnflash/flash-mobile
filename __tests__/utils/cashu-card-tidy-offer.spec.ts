/**
 * ENG-702: what the card screen offers after a read made under the owner's
 * grant. What it pins:
 *   - a card below its shape is offered a tidy, a card at it nothing;
 *   - the slots the card's unfinished top-ups and tidies hold are not free;
 *   - the PIN is asked for where the no-PIN allowance does not cover the fee
 *     (an allowance of 0 never does), and a blocked card is offered nothing;
 *   - "Not now" holds only for the pieces it was said to.
 */
import type { CardProofSlot } from "../../app/utils/cashu-card"
import { targetPieces } from "../../app/utils/cashu-card-shape"
import {
  piecesFingerprint,
  showsTidyOffer,
  tidyOfferFor,
} from "../../app/utils/cashu-card-topup"

const C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"

const slots = (amounts: number[]): CardProofSlot[] =>
  amounts.map((amount, slot) => ({
    slot,
    status: "unspent",
    keysetId: "00aabbccddeeff00",
    amount,
    nonce: (slot + 1).toString(16).padStart(64, "0"),
    C,
    date: 0,
  }))

const card = (amounts: number[], over = {}) => ({
  unspentSlots: slots(amounts),
  empty: 100,
  pinState: "unset" as const,
  allowance: 0,
  nopinSpent: 0,
  ...over,
})

const AFTER_A_TILL = [1, 2, 2, 4, 4, 4, 8, 8, 8, 16]
const FREE = { feePpk: 0, committedSlots: 0 }

describe("tidyOfferFor", () => {
  it("offers a tidy for a card below its shape, and says how many new pieces", () => {
    expect(tidyOfferFor(card(AFTER_A_TILL), FREE)).toEqual({
      kind: "offer",
      fee: 0,
      outputs: 5,
      complete: true,
      needsPin: false,
      fingerprint: piecesFingerprint(slots(AFTER_A_TILL)),
    })
  })

  it("offers nothing for a card at its shape, or empty", () => {
    expect(tidyOfferFor(card(targetPieces(60)), FREE)).toBeUndefined()
    expect(tidyOfferFor(card([]), FREE)).toBeUndefined()
  })

  it("counts what the card's unfinished top-ups and tidies hold: the slots short note", () => {
    expect(
      tidyOfferFor(card(AFTER_A_TILL, { empty: 4 }), { ...FREE, committedSlots: 4 }),
    ).toEqual({
      kind: "slots-short",
      fingerprint: piecesFingerprint(slots(AFTER_A_TILL)),
    })
  })

  it("asks for the PIN where the no-PIN allowance does not cover the fee: an allowance of 0 never does", () => {
    const pinCard = (allowance: number, nopinSpent = 0) =>
      card(AFTER_A_TILL, { pinState: "set", allowance, nopinSpent })
    expect(tidyOfferFor(pinCard(0), FREE)).toMatchObject({ needsPin: true })
    expect(tidyOfferFor(pinCard(100), FREE)).toMatchObject({ needsPin: false })
    // A card with no PIN signs for anything.
    expect(tidyOfferFor(card(AFTER_A_TILL), FREE)).toMatchObject({ needsPin: false })
  })

  it("offers nothing to a card whose PIN is blocked, or in a state this app cannot read", () => {
    expect(
      tidyOfferFor(card(AFTER_A_TILL, { pinState: "blocked" }), FREE),
    ).toBeUndefined()
    expect(
      tidyOfferFor(card(AFTER_A_TILL, { pinState: "unknown" }), FREE),
    ).toBeUndefined()
  })

  it("offers nothing at a fee as large as the smallest new piece", () => {
    expect(tidyOfferFor(card(AFTER_A_TILL), { ...FREE, feePpk: 100 })).toBeUndefined()
  })
})

describe("piecesFingerprint and showsTidyOffer", () => {
  it("is the same for the same pieces in any order, and differs when a piece changes", () => {
    const pieces = slots(AFTER_A_TILL)
    expect(piecesFingerprint([...pieces].reverse())).toBe(piecesFingerprint(pieces))
    expect(piecesFingerprint(pieces.slice(1))).not.toBe(piecesFingerprint(pieces))
  })

  it("shows an offer unless Not now was said to the same pieces", () => {
    const offer = tidyOfferFor(card(AFTER_A_TILL), FREE)
    expect(showsTidyOffer(offer, undefined)).toBe(true)
    expect(showsTidyOffer(offer, offer?.fingerprint)).toBe(false)
    expect(showsTidyOffer(offer, "other pieces")).toBe(true)
    expect(showsTidyOffer(undefined, undefined)).toBe(false)
  })
})
