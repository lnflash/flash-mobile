/**
 * The card's owner (ENG-675, card protocol 2.0): the owner key, its proofs,
 * and the owner's commands.
 *
 * A 2.0 card with an owner holds a NIST P-256 public key (SET_OWNER). Changing
 * its PIN, its limits or its record, loading it without the PIN and refreshing
 * its clock's budget all need the owner's proof: an ECDSA signature (P-256,
 * SHA-256, DER) by the owner's private key over
 *
 *   label (ASCII) ‖ nonce (16, the card's GET_NONCE in this tap) ‖ value
 *
 * where the value is exactly the bytes after the proof (spec/APDU.md, The
 * owner's proof). Each nonce is good for one proof, right or wrong: a refused
 * proof (`6A91`) costs nothing and changes nothing, and is never sent again.
 *
 * The owner key for a card is derived from the app's backed-up seed where it
 * has one (architect's decision 14; spec/APDU.md and FOXY-CARD-SPEC.md 5.6
 * with the 2.0 label):
 *
 *   d = HMAC-SHA256(key = the 64-byte BIP-39 seed,
 *                   message = "CashuCard/owner" ‖ 0x00 ‖ the card key (33)) mod n
 *
 * remade with a counter byte appended while d is 0. Restoring the seed
 * restores ownership of every card. With no seed on the phone, a random key
 * is made instead, and it lives only on this phone (`cashu-card-owner-store.ts`).
 *
 * Pure: no Keychain, no React Native. `cashu-card-owner-store.ts` keeps the
 * keys; the e2e fixtures (`scripts/e2e`) sign with the public TEST key.
 */
import { p256 } from "@noble/curves/p256"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { hmac } from "@noble/hashes/hmac"
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import {
  CardProtocolError,
  HEADER_SIZE,
  INS,
  OWNER_LABEL,
  OwnerSigner,
  PinForm,
  ROLL_BUDGET_DEFAULT,
  ROLL_BUDGET_MOST,
  Transceiver,
  cardRecordValue,
  changeCardPin,
  parseRefreshNow,
  sendCommand,
  sendOwnerCommand,
  toHex,
} from "./cashu-card"

export const OWNER_DERIVATION_LABEL = "CashuCard/owner"

/** P-256's group order. */
const P256_N = p256.CURVE.n

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0))

const bytesOfHex = (hex: string): number[] =>
  (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))

const scalarHex = (d: bigint): string => d.toString(16).padStart(64, "0")

const isCardKey = (cardPubkey: string) => /^0[23][0-9a-f]{64}$/.test(cardPubkey)

/**
 * The owner key for `cardPubkey` (33 bytes, hex), derived from a 64-byte BIP-39
 * seed: HMAC-SHA256(seed, "CashuCard/owner" ‖ 00 ‖ card key [‖ counter]) mod n,
 * with a counter byte (1, 2, ...) appended while the result is 0. Resolves the
 * private scalar as 64 hex chars.
 */
export const deriveOwnerKey = (seed: Uint8Array, cardPubkey: string): string => {
  if (seed.length !== 64) throw new CardProtocolError("a BIP-39 seed is 64 bytes")
  if (!isCardKey(cardPubkey)) throw new CardProtocolError("not a card key")
  const base = [...ascii(OWNER_DERIVATION_LABEL), 0x00, ...bytesOfHex(cardPubkey)]
  for (let counter = 0; counter < 256; counter += 1) {
    const message = counter === 0 ? base : [...base, counter]
    const d = BigInt(`0x${toHex(hmac(sha256, seed, Uint8Array.from(message)))}`) % P256_N
    if (d !== BigInt(0)) return scalarHex(d)
  }
  throw new CardProtocolError("no owner key for this card")
}

/** A fresh random owner key, for a phone with no seed: 64 hex chars. */
export const randomOwnerKey = (): string => toHex(p256.utils.randomPrivateKey())

/**
 * The deterministic TEST owner key, SHA-256("cashu-javacard/cardctl test owner
 * key") mod n: cashu-javacard's cardctl, cardsim and its client all hold it.
 * Anyone with that repository has it, so it is for simulated cards only: the
 * e2e fixtures and the development bridge (`cashu-card-bridge.ts`).
 */
export const TEST_OWNER_PRIVATE_KEY = scalarHex(
  BigInt(
    `0x${toHex(
      sha256(new TextEncoder().encode("cashu-javacard/cardctl test owner key")),
    )}`,
  ) % P256_N,
)

/** The owner's public key as SET_OWNER takes it: 65 bytes, 04 ‖ X ‖ Y. */
export const ownerPublicKey = (privateKey: string): number[] =>
  Array.from(p256.getPublicKey(privateKey, false))

/** The owner's proof over `label ‖ nonce ‖ value`: ECDSA P-256, SHA-256, DER. */
export const ownerProof = (
  privateKey: string,
  { label, nonce, value }: { label: string; nonce: number[]; value: number[] },
): number[] => {
  if (nonce.length !== 16) throw new CardProtocolError("an owner's nonce is 16 bytes")
  const digest = sha256(Uint8Array.from([...ascii(label), ...nonce, ...value]))
  return Array.from(p256.sign(digest, privateKey).toDERRawBytes())
}

/** An `OwnerSigner` for one private key. */
export const ownerSigner =
  (privateKey: string): OwnerSigner =>
  async (label, nonce, value) =>
    ownerProof(privateKey, { label, nonce, value })

/**
 * ALLOW_LOAD: the owner's proof over "CashuCard/load" and nothing. For the rest
 * of this tap LOAD_PROOF and CLEAR_SPENT need no PIN, and SET_PIN may add one
 * to a card with none. Never a payment. `6A91` from a phone that is not the
 * owner, `6A90` on a card with none: the caller falls back to the PIN.
 */
export async function allowLoad(transceive: Transceiver, sign: OwnerSigner) {
  await sendOwnerCommand(transceive, INS.ALLOW_LOAD, {
    label: OWNER_LABEL.LOAD,
    value: [],
    sign,
    context: "ALLOW_LOAD",
  })
}

/** The owner's limits, all off (0) on a new card, and the rollover budget (1-30, 7 by default). */
export type CardLimits = {
  /** What may leave the card in one day's window, sats; 0 is none. */
  day: number
  /** A payment over this waits, by the card's own work; 0 is none. */
  payment: number
  /** What a card with a PIN signs for a day without it; 0 is none. */
  allowance: number
  /** How often the day's window may roll between the owner's REFRESHes: 1 to 30. */
  rollBudget: number
}

export const NO_LIMITS: CardLimits = {
  day: 0,
  payment: 0,
  allowance: 0,
  rollBudget: ROLL_BUDGET_DEFAULT,
}

const u32 = (value: number, what: string): number[] => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new CardProtocolError(`${what} must be a whole number from 0 to 2^32-1`)
  }
  // eslint-disable-next-line no-bitwise -- big-endian bytes
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff)
}

/**
 * SET_LIMIT's thirteen-byte value: the day's limit, the one payment's, the
 * no-PIN allowance (4 each) and the rollover budget (1). Always the long form,
 * so the budget the owner chose is what the card holds: a shorter form sets it
 * back to 7.
 */
export const limitValue = (limits: CardLimits): number[] => {
  const { rollBudget } = limits
  if (!Number.isInteger(rollBudget) || rollBudget < 1 || rollBudget > ROLL_BUDGET_MOST) {
    throw new CardProtocolError(`the rollover budget is 1 to ${ROLL_BUDGET_MOST}`)
  }
  return [
    ...u32(limits.day, "the daily limit"),
    ...u32(limits.payment, "the payment limit"),
    ...u32(limits.allowance, "the no-PIN allowance"),
    rollBudget,
  ]
}

/**
 * SET_LIMIT, the owner's form: no PIN, any funds. A card with no PIN refuses
 * an allowance above 0 (`6985`).
 */
export async function setLimits(
  transceive: Transceiver,
  sign: OwnerSigner,
  limits: CardLimits,
) {
  await sendOwnerCommand(transceive, INS.SET_LIMIT, {
    label: OWNER_LABEL.SET_LIMIT,
    value: limitValue(limits),
    sign,
    context: "SET_LIMIT",
  })
}

/**
 * CHANGE_PIN as the owner: no old PIN. Sets the PIN, refills the tries,
 * unblocks a blocked PIN, and ends any verified session.
 */
export async function changePinAsOwner(
  transceive: Transceiver,
  newPin: string,
  options: PinForm & { sign: OwnerSigner },
) {
  await changeCardPin(transceive, newPin, options)
}

/**
 * REFRESH: the owner's proof over "CashuCard/refresh" and a block header (80).
 * The header is held to SET_HEADER's checks and taken as SET_HEADER takes one;
 * then the rollover count goes back to 0. Resolves the card's `now`.
 */
export async function refreshCard(
  transceive: Transceiver,
  sign: OwnerSigner,
  header: number[],
): Promise<number> {
  if (header.length !== HEADER_SIZE) {
    throw new CardProtocolError(`REFRESH: a header is ${HEADER_SIZE} bytes`)
  }
  return parseRefreshNow(
    await sendOwnerCommand(transceive, INS.REFRESH, {
      label: OWNER_LABEL.REFRESH,
      value: header,
      sign,
      le: 0x04,
      context: "REFRESH",
    }),
  )
}

/** SET_CARD on an owned card: the record under the owner's proof. */
export async function setOwnedCardRecord(
  transceive: Transceiver,
  sign: OwnerSigner,
  record: { mint: string },
) {
  await sendOwnerCommand(transceive, INS.SET_CARD, {
    label: OWNER_LABEL.SET_CARD,
    value: cardRecordValue(record),
    sign,
    context: "SET_CARD",
  })
}

/**
 * SET_OWNER on a card with no owner: the owner key (65) and, when the phone
 * has one, the tip block header as the clock's anchor (80): the card then
 * never runs at `now = 0`. Only on a card with nothing unspent (`6A8D`).
 *
 * The torn-write rule is the caller's (`setUpCard` in
 * `cashu-card-owner-store.ts`): the key is saved BEFORE this goes out, and
 * never deleted while the card reports an owner. A lost answer is settled by
 * reading the card's owner flag on the next tap.
 */
export async function setOwner(
  transceive: Transceiver,
  privateKey: string,
  anchor?: number[],
) {
  if (anchor && anchor.length !== HEADER_SIZE) {
    throw new CardProtocolError(`SET_OWNER: an anchor header is ${HEADER_SIZE} bytes`)
  }
  await sendCommand(transceive, INS.SET_OWNER, {
    data: [...ownerPublicKey(privateKey), ...(anchor ?? [])],
    context: "SET_OWNER",
  })
}
