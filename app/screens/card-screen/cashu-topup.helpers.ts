/**
 * cashu-topup.helpers.ts
 * Shared helpers for the Cashu card top-up flow.
 */

interface CashuProofGql {
  id: string
  amount: number
  secret: string
  C: string
}

/**
 * Extract the 32-byte nonce hex from a P2PK secret JSON string.
 * The nonce is what gets stored on the card (32-byte field of 77-byte proof slot).
 */
export function extractNonceFromSecret(secret: string): string {
  try {
    const parsed = JSON.parse(secret) as [string, { nonce: string }]
    if (parsed[0] !== "P2PK" || !parsed[1]?.nonce) throw new Error("Not P2PK")
    return parsed[1].nonce
  } catch {
    throw new Error(`Invalid P2PK secret: ${secret.slice(0, 60)}`)
  }
}

/**
 * Convert a GQL proof into the flat format needed for useCashuCard.writeProofs().
 */
export function toCardWriteProof(proof: CashuProofGql): {
  keysetId: string
  amount: number
  nonce: string
  C: string
} {
  return {
    keysetId: proof.id,
    amount: proof.amount,
    nonce: extractNonceFromSecret(proof.secret),
    C: proof.C,
  }
}
