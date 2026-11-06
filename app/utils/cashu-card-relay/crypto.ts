import { hashToCurve, pointFromHex, verifyDLEQProof } from "@cashu/cashu-ts"
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { toHex } from "../cashu-card"
import type { RelayCrypto } from "./relay"

const fromHex = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/../g) ?? []).map((h) => parseInt(h, 16)))

/**
 * The cryptography the vendored engine (`relay.js`) is handed, from the
 * libraries the card flows already use. Every check answers strictly `true`
 * or `false`, never throws: the engine compares with `=== true`, so a throw
 * would be read as a refusal anyway, and a truthy non-boolean never as a pass.
 */
export const relayCrypto: RelayCrypto = {
  hash: (bytes) => Array.from(sha256(Uint8Array.from(bytes))),
  verify: (signature, message, key) => {
    // The engine hands the compressed card key; BIP-340 takes its x only.
    if (key.length !== 33) return false
    try {
      return (
        schnorr.verify(
          Uint8Array.from(signature),
          Uint8Array.from(message),
          Uint8Array.from(key.slice(1)),
        ) === true
      )
    } catch {
      return false
    }
  },
  point: (bytes) => {
    if (bytes.length !== 33) return false
    try {
      secp256k1.ProjectivePoint.fromHex(Uint8Array.from(bytes)).assertValidity()
      return true
    } catch {
      return false
    }
  },
  proofY: (secret) => toHex(hashToCurve(new TextEncoder().encode(secret)).toBytes(true)),
  // The blinded NUT-12 check (B_, C_, e, s against the amount key A): the
  // relay holds no blinding factor, so `hasValidDleq`, which checks an
  // unblinded proof with its r, cannot be the one.
  dleq: (output, signature, key) => {
    try {
      return (
        verifyDLEQProof(
          { e: fromHex(signature.dleq.e), s: fromHex(signature.dleq.s) },
          pointFromHex(output.B_),
          pointFromHex(signature.C_),
          pointFromHex(key),
        ) === true
      )
    } catch {
      return false
    }
  },
}
