/**
 * The PIN sealed to the card (ENG-675, card protocol 2.0).
 *
 * A PIN sent as it was typed crosses the air in the clear, and anybody
 * listening to the tap has it. A 2.0 card that says so (GET_INFO capability
 * bit 7, `CardInfo.sealed`) takes it enciphered to a key of its own instead.
 * In one answer (GET_NONCE with P1 = 1) the card gives sixteen fresh bytes,
 * that PIN key, and its signing key's BIP-340 signature over
 * SHA-256("CashuCard/pinkey" ‖ PIN key). The phone checks that signature
 * against the card key (GET_PUBKEY) before it seals anything, makes a key
 * pair for this one message, agrees a secret with the PIN key (the x of the
 * shared point), and from it hashes a keystream and a tag:
 *
 *   block(i, more) = SHA-256("CashuCard/seal" ‖ i ‖ secret (32)
 *                            ‖ the phone's key (65) ‖ the card's 16 bytes
 *                            ‖ the instruction (1) ‖ more)
 *
 * Blocks 1, 2, ... are the keystream; block 0 over the ciphertext is the tag
 * (its first sixteen bytes). What is sent is the phone's key (65), the PIN
 * block under the keystream, and the tag. The PIN block is always nine bytes
 * (its length, the PIN, zeros to eight), so its length says nothing of the
 * PIN's.
 *
 * Ported from getfoxy/iOS `build/wallet/08a-flashcard.js` (MIT), lines
 * 1039-1120 (`cardPinBlock`, `cardSealKey`, `cardSeal`), with the 2.0 labels
 * (`CashuCard/…` where Foxy's 1.x said `FoxyCard/…`). The applet's side is
 * `unseal` in lnflash/cashu-javacard `CashuApplet.java`; its transcript
 * (spec/vectors/transcript.json) is what the spec holds this file to.
 *
 * Pure: no card, no transport. `cashu-card.ts` asks the card for its PIN key
 * and sends what this builds.
 */
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

export const SEAL_LABEL = "CashuCard/seal"
export const PINKEY_LABEL = "CashuCard/pinkey"

/** The PIN block: length, PIN, zeros to eight. Nine bytes, whatever the PIN's length. */
export const PIN_BLOCK_LENGTH = 9
/** The sealed envelope's fixed parts: the phone's key (65) and the tag (16). */
const EPHEMERAL_LENGTH = 65
const TAG_LENGTH = 16
const NONCE_LENGTH = 16

/** What the card gave for sealing: its sixteen bytes and its PIN key. */
export type CardPinKey = {
  /** 16 bytes, good for one sealed command (or one owner's proof and its sealing). */
  nonce: number[]
  /** The card's PIN key, 33 bytes compressed. */
  pinKey: number[]
}

/** The card's PIN key is not signed by the card: nothing is sealed to it. */
export class CardPinKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CardPinKeyError"
  }
}

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0))

const hexOf = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/**
 * A PIN as the block that is sealed: its length, the PIN's bytes, and zeros
 * to eight. `pin` is the PIN's bytes (ASCII digits), 4 to 8 of them.
 */
export const cardPinBlock = (pin: number[]): number[] => {
  if (pin.length < 4 || pin.length > 8) {
    throw new CardPinKeyError("a PIN block holds a PIN of 4 to 8 bytes")
  }
  return [pin.length, ...pin, ...new Array(8 - pin.length).fill(0)]
}

/**
 * GET_NONCE P1 = 1's 113 bytes, checked: the nonce (16), the PIN key (33,
 * compressed) and the card key's BIP-340 signature (64) over
 * SHA-256("CashuCard/pinkey" ‖ PIN key). Throws `CardPinKeyError` for any
 * other length, a PIN key that is not a compressed point, or a signature the
 * card key (`cardPubkey`, 33 bytes hex, from GET_PUBKEY) did not make: a PIN
 * sealed to a key the card cannot vouch for could be opened by whoever made it.
 */
export const parseCardPinKey = (body: number[], cardPubkey: string): CardPinKey => {
  if (body.length !== NONCE_LENGTH + 33 + 64) {
    throw new CardPinKeyError(
      `the card's PIN key answer is ${body.length} bytes, not 113`,
    )
  }
  const nonce = body.slice(0, NONCE_LENGTH)
  const pinKey = body.slice(NONCE_LENGTH, NONCE_LENGTH + 33)
  const signature = body.slice(NONCE_LENGTH + 33)
  let good = false
  try {
    secp256k1.ProjectivePoint.fromHex(Uint8Array.from(pinKey))
    const digest = sha256(Uint8Array.from([...ascii(PINKEY_LABEL), ...pinKey]))
    good =
      (pinKey[0] === 0x02 || pinKey[0] === 0x03) &&
      /^0[23][0-9a-f]{64}$/.test(cardPubkey) &&
      schnorr.verify(Uint8Array.from(signature), digest, cardPubkey.slice(2))
  } catch {
    good = false
  }
  if (!good) {
    throw new CardPinKeyError("the card's PIN key is not signed by the card")
  }
  return { nonce, pinKey }
}

/**
 * `clear` sealed for the command `ins` under what the card gave (`key`): the
 * phone's one-message public key (65, uncompressed), the bytes under the
 * keystream, and the tag (16). `ephemeral` is the one-message secret key; a
 * fresh one is drawn when it is not given (a test passes one to get the same
 * envelope twice).
 */
export const cardSeal = (
  key: CardPinKey,
  { ins, clear }: { ins: number; clear: number[] },
  ephemeral: Uint8Array = secp256k1.utils.randomPrivateKey(),
): number[] => {
  if (key.nonce.length !== NONCE_LENGTH) {
    throw new CardPinKeyError("a seal needs the card's sixteen bytes")
  }
  const mine = Array.from(secp256k1.getPublicKey(ephemeral, false))
  if (mine.length !== EPHEMERAL_LENGTH) throw new CardPinKeyError("not a sealing key")
  // The x of the shared point: bytes 1..33 of its compressed form.
  const shared = Array.from(
    secp256k1.getSharedSecret(ephemeral, hexOf(key.pinKey), true).slice(1, 33),
  )
  const head = [...shared, ...mine, ...key.nonce, ins]
  const block = (i: number, more: number[] = []) =>
    Array.from(sha256(Uint8Array.from([...ascii(SEAL_LABEL), i, ...head, ...more])))
  const out: number[] = []
  for (let at = 0; at < clear.length; at += 32) {
    const stream = block(1 + at / 32)
    for (let k = 0; k < 32 && at + k < clear.length; k += 1) {
      // eslint-disable-next-line no-bitwise -- a keystream XOR
      out.push(clear[at + k] ^ stream[k])
    }
  }
  const tag = block(0, out).slice(0, TAG_LENGTH)
  return [...mine, ...out, ...tag]
}
