/**
 * ENG-702: the card's spend commands as a tidy sends them, on the wire
 * (cashu-javacard spec/APDU.md, Category 0x2x and GET_CHANGE): the framing,
 * SPEND_ALL_SIGN's "not yet" loop, GET_CHANGE's pages, and each refusal
 * named by its status word.
 */
import { schnorr } from "@noble/curves/secp256k1"
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { CardError, CardProtocolError, toHex } from "../../app/utils/cashu-card"
import {
  CHANGE_MOST,
  CardSpendError,
  MAX_SIGN_WAITS,
  getChange,
  parseChangePage,
  sigAllMessage,
  spendAllAgain,
  spendAllBegin,
  spendAllChange,
  spendAllSign,
  verifyCardSignature,
} from "../../app/utils/cashu-card-spend"

const OK = [0x90, 0x00]
const sw = (word: number) => [word >> 8, word & 0xff] // eslint-disable-line no-bitwise

/** A card that answers each APDU in turn with the next of `answers`, and records what it was sent. */
const scripted = (...answers: number[][]) => {
  const sent: number[][] = []
  const transceive = jest.fn(async (apdu: number[]) => {
    sent.push(apdu)
    const answer = answers.shift()
    if (!answer) throw new Error("no answer scripted")
    return answer
  })
  return { transceive, sent }
}

const B_ = [0x02, ...new Array(32).fill(0x5a)]
const SIG = new Array(64).fill(0x11)

/** One GET_CHANGE opening: amount, keyset, date, nonce, r. */
const opening = (amount: number, nonceByte: number) => [
  0,
  0,
  0,
  amount,
  ...new Array(8).fill(0xab),
  0,
  0,
  0,
  0,
  ...new Array(32).fill(nonceByte),
  ...new Array(32).fill(0xcc),
]

describe("spendAllBegin", () => {
  it("names the slots in order and answers what they are worth", async () => {
    const card = scripted([0, 0, 0x01, 0x00, ...OK])
    await expect(spendAllBegin(card.transceive, [3, 0, 7])).resolves.toBe(256)
    expect(card.sent).toEqual([[0xb0, 0x22, 0x00, 0x00, 3, 3, 0, 7, 0x04]])
  })

  it("refuses no slot, or a slot that is not one, before anything is sent", async () => {
    const card = scripted()
    await expect(spendAllBegin(card.transceive, [])).rejects.toBeInstanceOf(
      CardProtocolError,
    )
    await expect(spendAllBegin(card.transceive, [128])).rejects.toBeInstanceOf(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  it("names a spent slot (6985) and a slot of another date (6A80)", async () => {
    const card = scripted(sw(0x6985), sw(0x6a80))
    await expect(spendAllBegin(card.transceive, [1])).rejects.toMatchObject({
      name: "CardSpendError",
      reason: "not-satisfied",
      sw: 0x6985,
    })
    await expect(spendAllBegin(card.transceive, [1, 2])).rejects.toMatchObject({
      reason: "wrong-data",
      sw: 0x6a80,
    })
  })
})

describe("spendAllChange", () => {
  it("asks for one piece of change by its amount and answers its blinded message", async () => {
    const card = scripted([...B_, ...OK])
    await expect(spendAllChange(card.transceive, 16)).resolves.toBe(toHex(B_))
    expect(card.sent).toEqual([[0xb0, 0x26, 0x00, 0x00, 4, 0, 0, 0, 16, 0x21]])
  })

  it("names every opening held (6A84), and refuses change of 0 unsent", async () => {
    const card = scripted(sw(0x6a84))
    await expect(spendAllChange(card.transceive, 1)).rejects.toMatchObject({
      reason: "no-opening",
    })
    await expect(spendAllChange(card.transceive, 0)).rejects.toBeInstanceOf(
      CardProtocolError,
    )
    expect(card.sent).toHaveLength(1)
  })

  it("refuses an answer that is not a point's 33 bytes", async () => {
    const card = scripted([...B_.slice(1), ...OK])
    await expect(spendAllChange(card.transceive, 1)).rejects.toBeInstanceOf(
      CardProtocolError,
    )
  })
})

describe("spendAllSign", () => {
  it("asks again while the card says not yet (00 01), and answers the signature", async () => {
    const card = scripted([0, 1, ...OK], [0, 1, ...OK], [...SIG, ...OK])
    await expect(spendAllSign(card.transceive)).resolves.toEqual(SIG)
    expect(card.sent).toEqual([
      [0xb0, 0x24, 0x00, 0x00, 0x40],
      [0xb0, 0x24, 0x00, 0x00, 0x40],
      [0xb0, 0x24, 0x00, 0x00, 0x40],
    ])
  })

  it("gives up on a card that makes a payment wait without end", async () => {
    const card = scripted(...new Array(MAX_SIGN_WAITS + 1).fill([0, 1, ...OK]))
    await expect(spendAllSign(card.transceive)).rejects.toBeInstanceOf(CardProtocolError)
    expect(card.sent).toHaveLength(MAX_SIGN_WAITS + 1)
  })

  it("names the PIN needed (6A94) and the daily limit (6A8F): nothing was burned", async () => {
    const card = scripted(sw(0x6a94), sw(0x6a8f))
    const pin = spendAllSign(card.transceive)
    await expect(pin).rejects.toBeInstanceOf(CardSpendError)
    await expect(pin).rejects.toMatchObject({ reason: "pin-needed" })
    await expect(spendAllSign(card.transceive)).rejects.toMatchObject({
      reason: "over-limit",
    })
  })

  it("leaves any other refusal a plain CardError", async () => {
    const card = scripted(sw(0x6a96))
    const refused = spendAllSign(card.transceive)
    await expect(refused).rejects.toBeInstanceOf(CardError)
    await expect(refused).rejects.not.toBeInstanceOf(CardSpendError)
  })
})

describe("spendAllAgain", () => {
  it("asks for the last signature again", async () => {
    const card = scripted([...SIG, ...OK])
    await expect(spendAllAgain(card.transceive)).resolves.toEqual(SIG)
    expect(card.sent).toEqual([[0xb0, 0x25, 0x00, 0x00, 0x40]])
  })
})

describe("getChange", () => {
  it("reads page after page while each is full, three openings to a page", async () => {
    const card = scripted(
      [3, ...opening(1, 1), ...opening(2, 2), ...opening(4, 3), ...OK],
      [3, ...opening(8, 4), ...opening(16, 5), ...opening(32, 6), ...OK],
      [2, ...opening(64, 7), ...opening(128, 8), ...OK],
    )
    const openings = await getChange(card.transceive)
    expect(openings.map((o) => o.amount)).toEqual([1, 2, 4, 8, 16, 32, 64, 128])
    expect(openings).toHaveLength(CHANGE_MOST)
    expect(openings[0]).toEqual({
      amount: 1,
      keysetId: "ab".repeat(8),
      date: 0,
      nonce: "01".repeat(32),
      r: "cc".repeat(32),
    })
    expect(card.sent).toEqual([
      [0xb0, 0x19, 0x00, 0x00, 0x00],
      [0xb0, 0x19, 0x01, 0x00, 0x00],
      [0xb0, 0x19, 0x02, 0x00, 0x00],
    ])
  })

  it("stops at the first page that is not full, and reads none held as none", async () => {
    const card = scripted([0, ...OK])
    await expect(getChange(card.transceive)).resolves.toEqual([])
    expect(card.sent).toHaveLength(1)
  })

  it("refuses a page whose count and length disagree", () => {
    expect(() => parseChangePage([2, ...opening(1, 1)])).toThrow(CardProtocolError)
    expect(() => parseChangePage([4])).toThrow(CardProtocolError)
    expect(() => parseChangePage([])).toThrow(CardProtocolError)
  })
})

describe("sigAllMessage and verifyCardSignature", () => {
  const key = "07".repeat(32)
  const pubkey = toHex(schnorr.getPublicKey(key))

  it("hashes every input's secret and C, then every output's amount and B_, as the card does", () => {
    const inputs = [{ secret: '["P2PK",{}]', C: "02AB" }]
    const outputs = [{ amount: 16, B_: "03CD" }]
    const text = '["P2PK",{}]02ab1603cd'
    expect(toHex(sigAllMessage(inputs, outputs))).toBe(
      toHex(sha256(new TextEncoder().encode(text))),
    )
  })

  it("takes the card key's signature over the message and nothing else", () => {
    const message = sigAllMessage([{ secret: "s", C: "02" }], [{ amount: 1, B_: "03" }])
    const signature = toHex(schnorr.sign(message, key))
    expect(verifyCardSignature(signature, message, `02${pubkey}`)).toBe(true)
    const other = sigAllMessage([{ secret: "s", C: "02" }], [{ amount: 2, B_: "03" }])
    expect(verifyCardSignature(signature, other, `02${pubkey}`)).toBe(false)
    expect(verifyCardSignature("zz", message, `02${pubkey}`)).toBe(false)
  })
})
