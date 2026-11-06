/* eslint-disable no-bitwise -- the specs flip one bit of a signature, a DLEQ */
/**
 * ENG-820: the cryptography the vendored relay engine is handed. Every check
 * answers strictly true or false, and refuses a bad point, a bad signature
 * and a bad DLEQ.
 */
import { createBlindSignature, createDLEQProof, pointFromHex } from "@cashu/cashu-ts"
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { toHex } from "@app/utils/cashu-card"
import { relayCrypto } from "@app/utils/cashu-card-relay/crypto"
import { proofY } from "@app/utils/cashu-card-topup"

import { cardSecret, pointOf } from "../helpers/relay-packet"

const fromHex = (hex: string) => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
const KEY = "07".repeat(32)
const PUB = Array.from(secp256k1.getPublicKey(KEY, true))

describe("relayCrypto", () => {
  it("hashes with SHA-256", () => {
    expect(toHex(relayCrypto.hash([0x61, 0x62, 0x63]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })

  it("accepts the card key's BIP-340 signature and refuses a changed one, message or key", () => {
    const message = Array.from(sha256(Uint8Array.from([1, 2, 3])))
    const signature = Array.from(schnorr.sign(Uint8Array.from(message), KEY))
    expect(relayCrypto.verify(signature, message, PUB)).toBe(true)
    const bad = [...signature]
    bad[10] ^= 1
    expect(relayCrypto.verify(bad, message, PUB)).toBe(false)
    expect(relayCrypto.verify(signature, [...message.slice(1), 0], PUB)).toBe(false)
    expect(relayCrypto.verify(signature, message, fromHex(pointOf(BigInt(5))))).toBe(
      false,
    )
    expect(relayCrypto.verify(signature, message, PUB.slice(1))).toBe(false)
  })

  it("accepts a compressed point and refuses one off the curve, of the wrong length or prefix", () => {
    expect(relayCrypto.point(fromHex(pointOf(BigInt(3))))).toBe(true)
    expect(relayCrypto.point([0x02, ...new Array(32).fill(0)])).toBe(false)
    expect(relayCrypto.point([0x05, ...fromHex(pointOf(BigInt(3))).slice(1)])).toBe(false)
    expect(relayCrypto.point(fromHex(pointOf(BigInt(3))).slice(0, 32))).toBe(false)
  })

  it("names a proof by Y = hash_to_curve(secret), as the top-up does", () => {
    const nonce = "ab".repeat(32)
    const card = toHex(PUB)
    expect(relayCrypto.proofY(cardSecret(nonce, card))).toBe(proofY(nonce, card))
  })

  it("accepts a mint's blinded DLEQ and refuses one for another key, another output or tampered", () => {
    const k = secp256k1.utils.randomPrivateKey()
    const A = toHex(secp256k1.getPublicKey(k, true))
    const B_ = pointOf(BigInt(99))
    const { C_ } = createBlindSignature(pointFromHex(B_), k, "00ad268c4d1f5826")
    const proof = createDLEQProof(pointFromHex(B_), k)
    const signature = {
      id: "00ad268c4d1f5826",
      amount: 8,
      C_: toHex(C_.toBytes(true)),
      dleq: { e: toHex(proof.e), s: toHex(proof.s) },
    }
    const output = { amount: 8, id: "00ad268c4d1f5826", B_ }
    expect(relayCrypto.dleq(output, signature, A)).toBe(true)
    expect(relayCrypto.dleq(output, signature, pointOf(BigInt(7)))).toBe(false)
    expect(relayCrypto.dleq({ ...output, B_: pointOf(BigInt(98)) }, signature, A)).toBe(
      false,
    )
    const e = fromHex(signature.dleq.e)
    e[0] ^= 1
    expect(
      relayCrypto.dleq(
        output,
        { ...signature, dleq: { ...signature.dleq, e: toHex(e) } },
        A,
      ),
    ).toBe(false)
    expect(relayCrypto.dleq(output, { ...signature, C_: "zz" }, A)).toBe(false)
  })
})
