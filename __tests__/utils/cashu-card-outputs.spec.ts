/**
 * ENG-616: the outputs minted for a Cashu card. The secret a mint signs must
 * be the one the card rebuilds at spend time, byte for byte; flash-pos,
 * cashu-client and this app must agree.
 */
import { Amount, OutputData } from "@cashu/cashu-ts"

import { CardProtocolError } from "../../app/utils/cashu-card"
import {
  buildCardP2PKSecret,
  cardSlotFromProof,
  makeCanonicalCardOutput,
  randomBytes,
  splitPow2,
} from "../../app/utils/cashu-card-outputs"

// Real values from the J3R180 silicon run, the same fixture flash-pos pins
// (__tests__/services/cashuMint.test.ts): a formatting drift fails here rather
// than at the mint, after the card has burned a slot.
const CARD_PUBKEY = "03858498d50d2545aec9233357a69ef6d03c25b885921f47d7504c18161025574d"
const NONCE = "12a121736d3975fd4aefa5fda969e84b2023235d78962c17db23d2ea87d375ef"
const KEYSET_ID = "0059534ce0bfa19a"
const C = "02" + "cd".repeat(32)

const secretOf = (output: OutputData) => new TextDecoder().decode(output.secret)

describe("buildCardP2PKSecret", () => {
  it("reproduces the mint-time serialization byte for byte", () => {
    expect(buildCardP2PKSecret(NONCE, CARD_PUBKEY)).toBe(
      '["P2PK",{"nonce":"' +
        NONCE +
        '","data":"' +
        CARD_PUBKEY +
        '","tags":[["sigflag","SIG_INPUTS"]]}]',
    )
  })

  it("lower-cases whatever the card reports", () => {
    expect(buildCardP2PKSecret(NONCE.toUpperCase(), CARD_PUBKEY.toUpperCase())).toBe(
      buildCardP2PKSecret(NONCE, CARD_PUBKEY),
    )
  })
})

describe("makeCanonicalCardOutput", () => {
  it("blinds the canonical secret for a fresh nonce, under the keyset and amount asked", () => {
    const output = makeCanonicalCardOutput(8, KEYSET_ID, CARD_PUBKEY)
    const secret = secretOf(output)
    const { nonce } = JSON.parse(secret)[1]

    expect(nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(secret).toBe(buildCardP2PKSecret(nonce, CARD_PUBKEY))
    expect(output.blindedMessage.id).toBe(KEYSET_ID)
    expect(Amount.from(output.blindedMessage.amount).toNumber()).toBe(8)
    expect(output.blindedMessage.B_).toMatch(/^0[23][0-9a-f]{64}$/)
  })

  it("never reuses a nonce or a blinding factor", () => {
    const a = makeCanonicalCardOutput(8, KEYSET_ID, CARD_PUBKEY)
    const b = makeCanonicalCardOutput(8, KEYSET_ID, CARD_PUBKEY)
    expect(secretOf(a)).not.toBe(secretOf(b))
    expect(a.blindingFactor).not.toBe(b.blindingFactor)
  })
})

describe("randomBytes", () => {
  it("refuses to run without a secure random source rather than fall back", () => {
    const crypto = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true })
    try {
      expect(() => randomBytes(32)).toThrow(/secure random source/)
    } finally {
      if (crypto) Object.defineProperty(globalThis, "crypto", crypto)
    }
  })

  it("returns the length asked", () => {
    expect(randomBytes(32)).toHaveLength(32)
  })
})

describe("splitPow2", () => {
  const cases: [number, number[]][] = [
    [1, [1]],
    [2, [2]],
    [3, [2, 1]],
    [1000, [512, 256, 128, 64, 32, 8]],
    [1024, [1024]],
    [1_000_000, [524288, 262144, 131072, 65536, 16384, 512, 64]],
  ]
  cases.forEach(([amount, pieces]) => {
    it(`splits ${amount} into the fewest proofs, largest first`, () => {
      expect(splitPow2(amount)).toEqual(pieces)
      expect(pieces.reduce((a, b) => a + b, 0)).toBe(amount)
    })
  })

  it("refuses anything that is not a positive whole number", () => {
    ;[0, -1, 1.5, Number.NaN].forEach((amount) => {
      expect(() => splitPow2(amount)).toThrow(RangeError)
    })
  })
})

describe("cardSlotFromProof", () => {
  const proof = (secret: string) => ({ id: KEYSET_ID, amount: Amount.from(8), secret, C })

  it("returns exactly what LOAD_PROOF writes: keyset, amount, nonce and C", () => {
    expect(
      cardSlotFromProof(proof(buildCardP2PKSecret(NONCE, CARD_PUBKEY)), CARD_PUBKEY),
    ).toEqual({
      keysetId: KEYSET_ID,
      amount: 8,
      nonce: NONCE,
      C,
    })
  })

  it("refuses a proof locked to another card", () => {
    const other = "02" + "11".repeat(32)
    expect(() =>
      cardSlotFromProof(proof(buildCardP2PKSecret(NONCE, other)), CARD_PUBKEY),
    ).toThrow(CardProtocolError)
  })

  it("refuses a secret the card would rebuild differently (no sigflag tag: cashu-ts's own P2PK form)", () => {
    const cashuTsForm = JSON.stringify([
      "P2PK",
      { nonce: NONCE, data: CARD_PUBKEY, tags: [] },
    ])
    expect(() => cardSlotFromProof(proof(cashuTsForm), CARD_PUBKEY)).toThrow(
      /would not rebuild on this card/,
    )
  })

  it("refuses a secret that is not a card secret at all", () => {
    ;[
      "not json",
      '["HTLC",{"nonce":"' + NONCE + '"}]',
      '["P2PK",{"nonce":"xyz"}]',
    ].forEach((secret) => {
      expect(() => cardSlotFromProof(proof(secret), CARD_PUBKEY)).toThrow(
        /not a card secret/,
      )
    })
  })
})
