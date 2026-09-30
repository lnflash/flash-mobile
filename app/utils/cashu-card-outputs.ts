/**
 * The outputs a mint signs for a Cashu card, and the proofs they become
 * (ENG-616).
 *
 * A card stores a proof as keyset id + amount + 32-byte nonce + C. The full
 * NUT-10 secret never goes on the card: whoever spends the proof rebuilds it
 * from the nonce and the card's public key (`buildCardP2PKSecret`). So the
 * secret a mint signs must be exactly that string, byte for byte. A proof
 * whose secret differs by a single character is refused by the mint, and only
 * after the card has burned the slot to sign for it.
 *
 * Ported from flash-pos `src/services/cashuMint.ts`. flash-pos, cashu-client
 * (`buildP2PKSecret`) and this module must serialize identically; the spec
 * pins all three against a proof minted on silicon.
 */
import { Amount, OutputData, Proof, blindMessage } from "@cashu/cashu-ts"

import { CardProtocolError, toHex } from "./cashu-card"

/**
 * The NUT-10 P2PK secret for a card proof, from the two values a card reports.
 * `sigflag` is written out even though SIG_INPUTS is the default: the card
 * toolchain has always serialized it, and cashu-ts's own `createP2PKData`,
 * which omits it, mints proofs a card can never spend.
 */
export function buildCardP2PKSecret(nonce: string, cardPubkey: string): string {
  return JSON.stringify([
    "P2PK",
    {
      nonce: nonce.toLowerCase(),
      data: cardPubkey.toLowerCase(),
      tags: [["sigflag", "SIG_INPUTS"]],
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
 * fewest of the card's 32 slots, that make it up exactly.
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

/** What LOAD_PROOF writes into a slot. */
export type CardSlotProof = {
  keysetId: string
  amount: number
  nonce: string
  C: string
}

/**
 * The slot contents for a proof the mint signed for this card, or a
 * `CardProtocolError` if the card could never spend it: a secret that is not
 * the canonical P2PK form, or one locked to a different key. Checked before
 * anything is written, because a card cannot tell a spendable proof from a
 * dead one and would give it a slot and a balance.
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
  return {
    keysetId: proof.id,
    amount: Amount.from(proof.amount).toNumber(),
    nonce,
    C: proof.C,
  }
}
