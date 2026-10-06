/**
 * The NUT-20 message the top-up engine signs is pinned to Nutshell's own
 * `construct_message` (cashu/core/nuts/nut20.py): the digest below and the
 * signature came from the Flash Forge mint's interpreter (Nutshell 0.20.3.1)
 * over these exact outputs, so a drift on either side fails here, not at the
 * mint. The legacy digest is pinned too, so nobody can "fix" this back to it.
 */
import { schnorr } from "@noble/curves/secp256k1"
import { bytesToHex, hexToBytes } from "@noble/curves/abstract/utils"
import { Amount } from "@cashu/cashu-ts"

import {
  mintQuoteDigest,
  signMintQuote,
  verifyMintQuoteSignature,
} from "../../app/utils/cashu-card-topup/nut20"

const QUOTE = "01a1135c-f8e7-7049-929b-191e79e3fee7"
const KEYSET = "0059534ce0bfa19a"
const OUTPUTS = [
  {
    id: KEYSET,
    amount: Amount.from(1),
    B_: "02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  },
  {
    id: KEYSET,
    amount: Amount.from(256),
    B_: "03ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100",
  },
  // Zero: no amount bytes at all, only its zero length.
  {
    id: KEYSET,
    amount: Amount.from(0),
    B_: "021111111111111111111111111111111111111111111111111111111111111111",
  },
]

// Nutshell, same quote and outputs:
const NUTSHELL_DIGEST = "c31704c0316811744f14478caeff0f822fb3bc2cb1cfacf769353ff69c831499"
const NUTSHELL_LEGACY_DIGEST =
  "4c473dbaa51787939f5514bfec091932566d4c08ff6fbe8f9cfcf1f56dfa3a61"
// sign_mint_quote(QUOTE, OUTPUTS, PRIVATE_KEY) on the mint.
const PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001"
const PUBLIC_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
const NUTSHELL_SIGNATURE =
  "9f2957161ea2932c5b254018e2c36dbbbe2ddfeb03632fe24545428182319cd15d8c34b7f286abc1a5a1869963f59b9c1b6747c90c34b1030ac4f7e27b0307f2"

describe("NUT-20 mint quote signature (current message)", () => {
  it("builds the digest Nutshell builds, and not the legacy one", () => {
    expect(bytesToHex(mintQuoteDigest(QUOTE, OUTPUTS))).toBe(NUTSHELL_DIGEST)
    expect(NUTSHELL_DIGEST).not.toBe(NUTSHELL_LEGACY_DIGEST)
  })

  it("accepts the mint's own signature over that digest", () => {
    expect(
      verifyMintQuoteSignature({
        pubkey: PUBLIC_KEY,
        quoteId: QUOTE,
        outputs: OUTPUTS,
        signature: NUTSHELL_SIGNATURE,
      }),
    ).toBe(true)
    expect(
      schnorr.verify(
        hexToBytes(NUTSHELL_SIGNATURE),
        mintQuoteDigest(QUOTE, OUTPUTS),
        hexToBytes(PUBLIC_KEY).subarray(1),
      ),
    ).toBe(true)
  })

  it("signs so that the mint's check passes, and a changed output does not", () => {
    const signature = signMintQuote(PRIVATE_KEY, QUOTE, OUTPUTS)
    expect(signature).toMatch(/^[0-9a-f]{128}$/)
    expect(
      verifyMintQuoteSignature({
        pubkey: PUBLIC_KEY,
        quoteId: QUOTE,
        outputs: OUTPUTS,
        signature,
      }),
    ).toBe(true)
    const tampered = [{ ...OUTPUTS[0], amount: Amount.from(2) }, ...OUTPUTS.slice(1)]
    expect(
      verifyMintQuoteSignature({
        pubkey: PUBLIC_KEY,
        quoteId: QUOTE,
        outputs: tampered,
        signature,
      }),
    ).toBe(false)
    expect(
      verifyMintQuoteSignature({
        pubkey: PUBLIC_KEY,
        quoteId: "other-quote",
        outputs: OUTPUTS,
        signature,
      }),
    ).toBe(false)
  })

  it("rejects garbage without throwing", () => {
    expect(
      verifyMintQuoteSignature({
        pubkey: "zz",
        quoteId: QUOTE,
        outputs: OUTPUTS,
        signature: NUTSHELL_SIGNATURE,
      }),
    ).toBe(false)
    expect(
      verifyMintQuoteSignature({
        pubkey: PUBLIC_KEY,
        quoteId: QUOTE,
        outputs: OUTPUTS,
        signature: "00",
      }),
    ).toBe(false)
  })
})
