/**
 * ENG-675: the PIN sealed to the card's PIN key (card protocol 2.0), held to
 * the applet's own transcript (lnflash/cashu-javacard
 * spec/vectors/transcript.json at the pinned ref): the card's 113-byte PIN
 * key answer, the clear bytes, and the very APDU the applet took, sealed with
 * the one-message keys its tests use (0x11…, 0x22…, 0x33…). The construction
 * is getfoxy/iOS `cardSeal` with the 2.0 labels.
 */
import { secp256k1 } from "@noble/curves/secp256k1"

import {
  CardPinKeyError,
  PIN_BLOCK_LENGTH,
  cardPinBlock,
  cardSeal,
  parseCardPinKey,
} from "../../app/utils/cashu-card-seal"

const fromHex = (h: string) => (h.match(/../g) ?? []).map((x) => parseInt(x, 16))
const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("")

/** cardsim's card key (deterministic): the transcript's card. */
const CARD_KEY = "02fa05ed0a3649886270bacec5ddc1a3643009a759bee996f9a6ac060c9992a82e"
/** Every PIN key answer ends with the same PIN key and the card's signature over it. */
const PIN_KEY_AND_SIGNATURE =
  "02cf9bfbdca0c087fdea7097d5482d3a7b30b5fa1cb52b621f89c0a61619b782d47fb4580ccd7149a9ea7a362e270cd4c7a466c77b01ecc952633a8071c9962f50d8e17bd0dd9883e9630ddf4dbc14e026bada6202833b06e17b866151019fd348"

type Vector = {
  name: string
  ephemeral: string
  nonce: string
  clear: string
  apdu: string
}

const VECTORS: Vector[] = [
  {
    name: "SET_PIN sealed on an open card",
    ephemeral: "11".repeat(32),
    nonce: "2aa2ab70039c5510ddf06420eceb8892",
    clear: "043536373800000000",
    apdu: "b04101005a044f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa385b6b1b8ead809ca67454d9683fcf2ba03456d6fe2c4abe2b07f0fbdbb2f1c16e5e4f9789aa027ebc5451a21bfa5ef72a44386c3e37462a2e",
  },
  {
    name: "VERIFY_PIN sealed, the right PIN",
    ephemeral: "22".repeat(32),
    nonce: "51373e8b6fdec284db569204ca13d2ca",
    clear: "043536373800000000",
    apdu: "b04001005a04466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f276728176c3c6431f8eeda4538dc37c865e2784f3a9e77d044f33e407797e1278a7670d6b5eaed8e8b6e36de7f39688292ff5237cdd8ef3927bd",
  },
  {
    name: "CHANGE_PIN sealed: the owner's proof and the PIN block in one envelope, three blocks of keystream",
    ephemeral: "33".repeat(32),
    nonce: "e2b9db555f33cc641e67f23da835f08f",
    clear:
      "4830460221008721d2bf9ddd49e587506902f282537fceaa27efadbadc77c56ea71ca8379cd6022100ca6de08006c7539e3a3d0e76f93ed9b0f7867718f80e17e90db69144d530f0f8043536373800000000",
    apdu: "b0420100a3043c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b13b306b0fe085665d8fc1b28ae1676cd3ad6e08eaeda225fe38d0da4de55703e0ccfd9f65db4c3aaaff4d4fc7a1d9a037f7c10a78c977be343da46191a37404fd092031859bd66c728d2c2c0ba2f31a0572c75e8648b5d6a32bc577838a2a27ad4e3d21fb65a24b40ba6fc6642b2fe60e8ab73d938c43a5e600406bd85fed4c9734aa",
  },
]

describe("cardSeal: the envelope the applet opens", () => {
  VECTORS.forEach((vector) => {
    it(`matches the applet transcript byte for byte: ${vector.name}`, () => {
      const key = parseCardPinKey(fromHex(vector.nonce + PIN_KEY_AND_SIGNATURE), CARD_KEY)
      const apdu = fromHex(vector.apdu)
      const envelope = cardSeal(
        key,
        { ins: apdu[1], clear: fromHex(vector.clear) },
        Uint8Array.from(fromHex(vector.ephemeral)),
      )
      expect(hex(envelope)).toBe(hex(apdu.slice(5)))
      // The phone's one-message key (65), the bytes under the keystream, the tag (16).
      expect(envelope).toHaveLength(65 + vector.clear.length / 2 + 16)
    })
  })

  it("an envelope sealed for one instruction is none for another", () => {
    const [vector] = VECTORS
    const key = parseCardPinKey(fromHex(vector.nonce + PIN_KEY_AND_SIGNATURE), CARD_KEY)
    const forVerify = cardSeal(
      key,
      { ins: 0x40, clear: fromHex(vector.clear) },
      Uint8Array.from(fromHex(vector.ephemeral)),
    )
    expect(hex(forVerify)).not.toBe(hex(fromHex(vector.apdu).slice(5)))
  })

  it("draws a fresh one-message key when none is given: no two envelopes alike", () => {
    const [vector] = VECTORS
    const key = parseCardPinKey(fromHex(vector.nonce + PIN_KEY_AND_SIGNATURE), CARD_KEY)
    const a = cardSeal(key, { ins: 0x40, clear: fromHex(vector.clear) })
    const b = cardSeal(key, { ins: 0x40, clear: fromHex(vector.clear) })
    expect(hex(a)).not.toBe(hex(b))
    expect(a[0]).toBe(0x04)
  })
})

describe("cardPinBlock", () => {
  it("is the PIN's length, the PIN and zeros to eight: nine bytes, whatever the PIN's length", () => {
    expect(cardPinBlock([0x35, 0x36, 0x37, 0x38])).toEqual(fromHex("043536373800000000"))
    expect(cardPinBlock([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38])).toEqual(
      fromHex("083132333435363738"),
    )
    expect(PIN_BLOCK_LENGTH).toBe(9)
  })

  it("refuses a PIN outside 4 to 8 bytes", () => {
    expect(() => cardPinBlock([1, 2, 3])).toThrow(CardPinKeyError)
    expect(() => cardPinBlock(new Array(9).fill(1))).toThrow(CardPinKeyError)
  })
})

describe("parseCardPinKey: nothing is sealed to a PIN key the card did not sign", () => {
  const answer = fromHex(VECTORS[1].nonce + PIN_KEY_AND_SIGNATURE)

  it("takes the card's answer: its sixteen bytes and its PIN key", () => {
    const key = parseCardPinKey(answer, CARD_KEY)
    expect(hex(key.nonce)).toBe(VECTORS[1].nonce)
    expect(hex(key.pinKey)).toBe(PIN_KEY_AND_SIGNATURE.slice(0, 66))
  })

  it("refuses the answer checked against another card's key", () => {
    const other = hex(Array.from(secp256k1.getPublicKey("09".repeat(32), true)))
    expect(() => parseCardPinKey(answer, other)).toThrow(CardPinKeyError)
  })

  it("refuses a PIN key whose signature was tampered with, and a PIN key swapped for another", () => {
    const tampered = [...answer]
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] + 1) % 256
    expect(() => parseCardPinKey(tampered, CARD_KEY)).toThrow(CardPinKeyError)
    const swapped = [...answer]
    swapped.splice(16, 33, ...Array.from(secp256k1.getPublicKey("09".repeat(32), true)))
    expect(() => parseCardPinKey(swapped, CARD_KEY)).toThrow(CardPinKeyError)
  })

  it("refuses an answer of any other length", () => {
    expect(() => parseCardPinKey(answer.slice(0, 112), CARD_KEY)).toThrow(/not 113/)
    expect(() => parseCardPinKey([...answer, 0], CARD_KEY)).toThrow(/not 113/)
  })
})
