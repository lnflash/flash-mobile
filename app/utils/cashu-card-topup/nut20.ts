import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/curves/abstract/utils"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"
import { Amount, SerializedBlindedMessage } from "@cashu/cashu-ts"

/**
 * NUT-20 mint-quote signatures, current message format.
 *
 * cashu-ts 4.11 exports `signMintQuote` with the ORIGINAL message — the
 * quote id and the blinded points concatenated as text, then hashed. Its
 * Wallet class signs the current, domain-separated message instead, but that
 * signer is not exported, and the top-up engine signs at this level. Nutshell
 * still verifies the original form through a fallback it has marked
 * deprecated since 0.20.2 ("Using legacy NUT-20 signature verification" on
 * every top-up); when that fallback goes, every top-up fails at the mint
 * call. This is the message Nutshell's `construct_message` builds, byte for
 * byte, and the one cashu-ts will export as `signMintQuote` from 5.0.
 *
 * Message: SHA-256 over the tag "Cashu_MintQuoteSig_v1", the quote id, and
 * for each output its amount then its blinded point; every field after the
 * tag is prefixed with its byte length as a 4-byte big-endian integer. An
 * amount is its minimal big-endian bytes, none at all for zero.
 */
const DOMAIN = utf8ToBytes("Cashu_MintQuoteSig_v1")

const lengthPrefix = (field: Uint8Array): Uint8Array => {
  const prefix = new Uint8Array(4)
  new DataView(prefix.buffer).setUint32(0, field.length)
  return prefix
}

const minimalAmountBytes = (amount: SerializedBlindedMessage["amount"]): Uint8Array => {
  const value = Amount.from(amount).toBigInt()
  if (value === BigInt(0)) return new Uint8Array()
  const hex = value.toString(16)
  return hexToBytes(hex.length % 2 === 1 ? `0${hex}` : hex)
}

/** The 32-byte message a NUT-20 signature over this quote and outputs signs. */
export const mintQuoteDigest = (
  quoteId: string,
  outputs: readonly SerializedBlindedMessage[],
): Uint8Array => {
  const hash = sha256.create()
  hash.update(DOMAIN)
  const quote = utf8ToBytes(quoteId)
  hash.update(lengthPrefix(quote))
  hash.update(quote)
  for (const output of outputs) {
    const amount = minimalAmountBytes(output.amount)
    hash.update(lengthPrefix(amount))
    hash.update(amount)
    const point = hexToBytes(output.B_)
    hash.update(lengthPrefix(point))
    hash.update(point)
  }
  return hash.digest()
}

/**
 * The BIP-340 signature the mint expects on a NUT-20 locked quote, hex.
 * `privateKey` is the quote's lock key, hex.
 */
export const signMintQuote = (
  privateKey: string,
  quoteId: string,
  outputs: readonly SerializedBlindedMessage[],
): string =>
  bytesToHex(schnorr.sign(mintQuoteDigest(quoteId, outputs), hexToBytes(privateKey)))

/** What a mint checks on a NUT-20 locked quote. */
export type MintQuoteSignatureCheck = {
  /** The quote's lock pubkey, 33-byte compressed, hex. */
  pubkey: string
  quoteId: string
  outputs: readonly SerializedBlindedMessage[]
  /** BIP-340 signature, hex. */
  signature: string
}

/**
 * Whether the signature is the lock key's BIP-340 signature over this quote
 * and outputs. Here for the test fake, which must accept exactly what
 * Nutshell accepts.
 */
export const verifyMintQuoteSignature = ({
  pubkey,
  quoteId,
  outputs,
  signature,
}: MintQuoteSignatureCheck): boolean => {
  try {
    const xOnly = hexToBytes(pubkey).subarray(1)
    return schnorr.verify(hexToBytes(signature), mintQuoteDigest(quoteId, outputs), xOnly)
  } catch {
    return false
  }
}
