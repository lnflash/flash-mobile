/**
 * cashu-topup-helpers.spec.ts
 *
 * Unit tests for the Cashu card top-up helper functions.
 * These are pure logic functions with no RN/NFC dependencies.
 */

import {
  extractNonceFromSecret,
  toCardWriteProof,
} from "@app/screens/card-screen/cashu-topup.helpers"

// ── Fixtures ──────────────────────────────────────────────────────────────

// NUT-XX worked example from spec/NUT-XX.md
const EXAMPLE_NONCE = "916c21b8c67da71e9d02f4e3adc6f30700c152e01a07ae30e3bcc6b55b0c9e5e"
const EXAMPLE_PUBKEY = "02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2"

/** Build a P2PK secret JSON string from (nonce, pubkey) matching the on-card format */
function makeP2PKSecret(nonce: string, pubkey: string): string {
  return JSON.stringify([
    "P2PK",
    {
      nonce,
      data: pubkey,
      tags: [["sigflag", "SIG_ALL"]],
    },
  ])
}

const EXAMPLE_SECRET = makeP2PKSecret(EXAMPLE_NONCE, EXAMPLE_PUBKEY)

const EXAMPLE_PROOF = {
  id: "0059534ce0bfa19a",
  amount: 100,
  secret: EXAMPLE_SECRET,
  C: "024a43eddcf0e42dad32ca5c0e82e51d7a38e7a48b80e89d2e17cc94abb02c04c3",
}

// ── extractNonceFromSecret ────────────────────────────────────────────────

describe("extractNonceFromSecret", () => {
  it("extracts nonce from a valid P2PK secret", () => {
    expect(extractNonceFromSecret(EXAMPLE_SECRET)).toBe(EXAMPLE_NONCE)
  })

  it("extracts nonce regardless of other fields", () => {
    const secretWithExtras = JSON.stringify([
      "P2PK",
      {
        nonce: "aabbcc",
        data: EXAMPLE_PUBKEY,
        tags: [["sigflag", "SIG_ALL"], ["locktime", "9999999999"]],
      },
    ])
    expect(extractNonceFromSecret(secretWithExtras)).toBe("aabbcc")
  })

  it("throws for non-P2PK secrets", () => {
    const htlcSecret = JSON.stringify([
      "HTLC",
      { nonce: "deadbeef", data: "something" },
    ])
    expect(() => extractNonceFromSecret(htlcSecret)).toThrow("Invalid P2PK secret")
  })

  it("throws for missing nonce field", () => {
    const noNonce = JSON.stringify(["P2PK", { data: EXAMPLE_PUBKEY }])
    expect(() => extractNonceFromSecret(noNonce)).toThrow("Invalid P2PK secret")
  })

  it("throws for invalid JSON", () => {
    expect(() => extractNonceFromSecret("not-json")).toThrow("Invalid P2PK secret")
  })

  it("throws for plain string secrets (non-P2PK)", () => {
    expect(() => extractNonceFromSecret("deadbeefdeadbeef")).toThrow(
      "Invalid P2PK secret",
    )
  })
})

// ── toCardWriteProof ──────────────────────────────────────────────────────

describe("toCardWriteProof", () => {
  it("maps a GQL proof to the card write format", () => {
    const result = toCardWriteProof(EXAMPLE_PROOF)
    expect(result).toEqual({
      keysetId: "0059534ce0bfa19a",
      amount: 100,
      nonce: EXAMPLE_NONCE,
      C: "024a43eddcf0e42dad32ca5c0e82e51d7a38e7a48b80e89d2e17cc94abb02c04c3",
    })
  })

  it("propagates nonce extraction errors", () => {
    const badProof = { ...EXAMPLE_PROOF, secret: "not-a-p2pk-secret" }
    expect(() => toCardWriteProof(badProof)).toThrow("Invalid P2PK secret")
  })

  it("preserves amount exactly (no rounding)", () => {
    const proofs = [1, 2, 4, 8, 16, 32, 64].map((amount) => ({
      ...EXAMPLE_PROOF,
      amount,
    }))
    proofs.forEach((proof) => {
      expect(toCardWriteProof(proof).amount).toBe(proof.amount)
    })
  })

  it("uses proof.id as keysetId (not amount or C)", () => {
    const result = toCardWriteProof(EXAMPLE_PROOF)
    expect(result.keysetId).toBe(EXAMPLE_PROOF.id)
    expect(result.keysetId).not.toBe(EXAMPLE_PROOF.C)
  })
})
