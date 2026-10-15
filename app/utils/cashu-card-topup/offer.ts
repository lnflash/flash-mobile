/**
 * Whether the card screen offers a tidy after a read (ENG-702), and what it
 * says: the decision the read's pieces, the mint's fee and the card's
 * unfinished top-ups and tidies make together. Pure: the caller asks the mint
 * and the store.
 *
 * Offered, not run (architect's decision 1): a tidy holds the card through a
 * mint round trip and may need the PIN, so it is the owner's choice, made on
 * an online read where the card took this phone's grant. "Not now" hides it
 * until the card's pieces change (`piecesFingerprint`), so it is never asked
 * on every read.
 */
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { CardInfo, CardProofSlot, toHex } from "../cashu-card"
import { CHANGE_MOST } from "../cashu-card-spend"
import { planTidy, tidyKeyset } from "./ladder"

export type TidyOffer =
  | {
      kind: "offer"
      /** The mint's fee, in the keyset's unit: shown when above 0. */
      fee: number
      /** How many new pieces the card makes. */
      outputs: number
      /** False for a partial tidy: another is offered on a later read. */
      complete: boolean
      /**
       * Decision 1: the card has a PIN and its no-PIN allowance does not
       * cover the fee (an allowance of 0 never does), so the PIN is asked for
       * before the tap.
       */
      needsPin: boolean
      /** The pieces the offer was made for (`piecesFingerprint`). */
      fingerprint: string
    }
  /** The card is below its shape, and too few slots are free to tidy it. */
  | { kind: "slots-short"; fingerprint: string }

/**
 * The card's unspent pieces, as an order-free fingerprint: what "Not now"
 * remembers, so a dismissed offer comes back only once the pieces change.
 */
export const piecesFingerprint = (
  pieces: readonly Pick<CardProofSlot, "nonce">[],
): string =>
  toHex(
    sha256(
      new TextEncoder().encode(
        pieces
          .map((piece) => piece.nonce.toLowerCase())
          .sort()
          .join(","),
      ),
    ),
  ).slice(0, 32)

/**
 * The offer for a read: undefined when there is nothing to say (the card is
 * at its shape, the fee is too large, no tidy brings it closer). The card's
 * change openings are not read in a read tap, so all eight are taken as
 * free; the tidy's own tap plans again with what the card holds.
 */
export function tidyOfferFor(
  card: Pick<CardInfo, "empty" | "pinState" | "allowance" | "nopinSpent"> & {
    unspentSlots: readonly CardProofSlot[]
  },
  { feePpk, committedSlots }: { feePpk: number; committedSlots: number },
): TidyOffer | undefined {
  // A blocked PIN signs nothing, the allowance included; an unknown state is
  // a card this app does not understand.
  if (card.pinState === "blocked" || card.pinState === "unknown") return undefined
  const keysetId = tidyKeyset(card.unspentSlots)
  if (!keysetId) return undefined
  const fingerprint = piecesFingerprint(card.unspentSlots)
  const plan = planTidy(card.unspentSlots, {
    freeOpenings: CHANGE_MOST,
    freeSlots: card.empty - committedSlots,
    feePpk,
    keysetId,
  })
  if (plan.kind === "skip") {
    return plan.reason === "slots" ? { kind: "slots-short", fingerprint } : undefined
  }
  const allowanceLeft = card.allowance - card.nopinSpent
  return {
    kind: "offer",
    fee: plan.fee,
    outputs: plan.outputs.length,
    complete: plan.complete,
    needsPin:
      card.pinState === "set" && (card.allowance === 0 || allowanceLeft < plan.fee),
    fingerprint,
  }
}

/** Whether the screen shows `offer`: not once "Not now" was said to these same pieces. */
export const showsTidyOffer = (
  offer: TidyOffer | undefined,
  dismissed: string | undefined,
): offer is TidyOffer => offer !== undefined && offer.fingerprint !== dismissed
