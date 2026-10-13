/**
 * The outputs a mint signs for a Cashu card, and the proofs they become
 * (ENG-616; format 4, card protocol 2.0, ENG-675).
 *
 * A card stores a piece as keyset id + amount + 32-byte nonce + C + date. The
 * full NUT-10 secret never goes on the card: the card rebuilds it from the
 * nonce, its own public key and the date (`buildCardP2PKSecret`, spec/NUT-XX.md
 * "The card piece"), and signs one SIG_ALL signature over every piece's
 * secret. So the secret a mint signs must be exactly that string, byte for
 * byte. A piece whose secret differs by a single character is one the card
 * signs for and the mint refuses.
 *
 * Byte-exact to getfoxy/iOS `08a-flashcard.js` `cardSecret` (MIT) with format
 * 4 and date 0, and to cashu-javacard's spec/vectors/secret.json; the spec
 * holds this module to both.
 */
import { Amount, OutputData, Proof, blindMessage } from "@cashu/cashu-ts"

import { CardProtocolError, toHex } from "./cashu-card"

/**
 * The format-4 NUT-10 P2PK secret of a card piece, from the values a card
 * reports: no spaces, this key order, lowercase hex, and `["sigflag","SIG_ALL"]`
 * as the last tag. The app's pieces carry no date (no locktime, no refund key:
 * the recoverable path stays off), so the flag is the only tag.
 */
export function buildCardP2PKSecret(nonce: string, cardPubkey: string): string {
  return JSON.stringify([
    "P2PK",
    {
      nonce: nonce.toLowerCase(),
      data: cardPubkey.toLowerCase(),
      tags: [["sigflag", "SIG_ALL"]],
    },
  ])
}

type Crypto = { getRandomValues: (bytes: Uint8Array) => Uint8Array }

/**
 * Cryptographically random bytes from the platform (react-native-get-random-values
 * installs it on device; Node has it natively). There is no fallback: a
 * predictable nonce would make every proof on the card guessable.
 */
export const randomBytes = (length: number): Uint8Array => {
  const crypto = (globalThis as { crypto?: Partial<Crypto> }).crypto
  if (!crypto?.getRandomValues) {
    throw new Error("No secure random source (crypto.getRandomValues)")
  }
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * A blinded output whose secret is the canonical card secret for a fresh
 * random nonce, locked to `cardPubkey`. Every output meant for a card must be
 * built here.
 */
export function makeCanonicalCardOutput(
  amount: number,
  keysetId: string,
  cardPubkey: string,
): OutputData {
  const secret = buildCardP2PKSecret(toHex(randomBytes(32)), cardPubkey)
  const secretBytes = new TextEncoder().encode(secret)
  const { r, B_ } = blindMessage(secretBytes)
  return new OutputData(
    { id: keysetId, amount: Amount.from(amount), B_: toHex(B_.toBytes(true)) },
    r,
    secretBytes,
  )
}

/**
 * `amount` as powers of two, largest first: the fewest proofs, and so the
 * fewest of the card's 128 slots, that make it up exactly.
 */
export function splitPow2(amount: number): number[] {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new RangeError(`splitPow2: amount must be a positive integer, got ${amount}`)
  }
  const pieces: number[] = []
  let remaining = amount
  let denomination = 1
  while (denomination * 2 <= remaining) denomination *= 2
  while (remaining > 0) {
    if (denomination <= remaining) {
      pieces.push(denomination)
      remaining -= denomination
    } else {
      denomination = Math.floor(denomination / 2)
    }
  }
  return pieces
}

/** The mint's NUT-12 proof as the card keeps it beside a piece: e and s from the mint, r the blinding factor. */
export type CardDleq = { e: string; s: string; r: string }

/** What LOAD_PROOF writes into a slot, with the mint's DLEQ proof beside it. */
export type CardSlotProof = {
  keysetId: string
  amount: number
  nonce: string
  C: string
  /** The piece's locktime: always 0, the app's pieces carry no date. */
  date: number
  dleq: CardDleq
}

const HEX32 = /^[0-9a-f]{64}$/

/**
 * The slot contents for a proof the mint signed for this card, or a
 * `CardProtocolError` if the card could never spend it, or nobody could check
 * it: a secret that is not the canonical format-4 form, one locked to a
 * different key, or a proof without its DLEQ (e, s and r). Checked before
 * anything is written, because a card cannot tell a spendable piece from a
 * dead one, and a till checks a piece offline by the DLEQ the card keeps.
 */
export function cardSlotFromProof(proof: Proof, cardPubkey: string): CardSlotProof {
  let nonce: unknown
  try {
    const parsed = JSON.parse(proof.secret)
    nonce = Array.isArray(parsed) && parsed[0] === "P2PK" ? parsed[1]?.nonce : undefined
  } catch {
    nonce = undefined
  }
  if (typeof nonce !== "string" || !/^[0-9a-f]{64}$/.test(nonce)) {
    throw new CardProtocolError("a minted proof's secret is not a card secret")
  }
  if (proof.secret !== buildCardP2PKSecret(nonce, cardPubkey)) {
    throw new CardProtocolError(
      "a minted proof's secret would not rebuild on this card (wrong key or form)",
    )
  }
  const dleq = proof.dleq as Partial<CardDleq> | undefined
  const e = dleq?.e?.toLowerCase()
  const s = dleq?.s?.toLowerCase()
  const r = dleq?.r?.toLowerCase()
  if (!e || !s || !r || !HEX32.test(e) || !HEX32.test(s) || !HEX32.test(r)) {
    throw new CardProtocolError("a minted proof carries no DLEQ proof (e, s and r)")
  }
  return {
    keysetId: proof.id,
    amount: Amount.from(proof.amount).toNumber(),
    nonce,
    C: proof.C,
    date: 0,
    dleq: { e, s, r },
  }
}
