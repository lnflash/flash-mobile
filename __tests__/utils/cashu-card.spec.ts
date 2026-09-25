import {
  CASHU_APPLET_AID,
  buildSelectApdu,
  parseBalance,
  parseInfo,
  readCashuCardBalance,
} from "../../app/utils/cashu-card"

// The wire format, spelled out byte for byte (cashu-javacard spec/APDU.md,
// as cardctl sends it). Literal on purpose: a change in the client that
// drifts from the spec must fail here, not be absorbed by a shared constant.
const SELECT_PACKAGE = [
  0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02,
]
const SELECT_APPLET = [
  0x00, 0xa4, 0x04, 0x00, 0x08, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02, 0x01,
]
const GET_INFO = [0xb0, 0x01, 0x00, 0x00, 0x00]
const GET_BALANCE = [0xb0, 0x11, 0x00, 0x00, 0x04]

const INFO_BODY = [0, 2, 32, 1, 7, 0x07, 1, 0]
const BALANCE_BODY = [0, 0, 0x01, 0xf4]
const SW_FILE_NOT_FOUND = [0x6a, 0x82]
const SW_UNKNOWN = [0x6f, 0x00]

const ok = (data: number[]) => [...data, 0x90, 0x00]
const hex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")

/**
 * A card that answers only the exact APDUs in `script`. Anything else is a
 * wire-format regression and throws. Records every APDU sent, in order.
 */
const scriptedCard = (script: Array<[number[], number[]]>) => {
  const sent: number[][] = []
  const responses = new Map(script.map(([apdu, response]) => [hex(apdu), response]))
  const transceive = async (bytes: number[]) => {
    sent.push(bytes)
    const response = responses.get(hex(bytes))
    if (!response) {
      throw new Error(`unexpected APDU ${hex(bytes)}`)
    }
    return response
  }
  return { sent, transceive }
}

describe("cashu-card parser", () => {
  it("parses the GET_INFO body", () => {
    expect(parseInfo(INFO_BODY)).toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
    })
  })

  it("parses the GET_BALANCE body (big-endian sat)", () => {
    expect(parseBalance(BALANCE_BODY)).toBe(500)
    expect(parseBalance([0, 0, 0, 0])).toBe(0)
  })

  it("parses the full uint32 range without going negative", () => {
    expect(parseBalance([0x80, 0x00, 0x00, 0x00])).toBe(2147483648)
    expect(parseBalance([0xff, 0xff, 0xff, 0xff])).toBe(4294967295)
  })

  it("rejects short bodies", () => {
    expect(() => parseInfo([0, 2])).toThrow(/expected 8 bytes/)
    expect(() => parseBalance([0, 0])).toThrow(/expected 4 bytes/)
  })

  it("builds the SELECT for the package AID by default and the applet AID on request", () => {
    expect(buildSelectApdu()).toEqual(SELECT_PACKAGE)
    expect(buildSelectApdu(CASHU_APPLET_AID)).toEqual(SELECT_APPLET)
  })
})

describe("readCashuCardBalance", () => {
  it("selects, reads info and balance over the IsoDep channel", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_BALANCE, ok(BALANCE_BODY)],
    ])

    const info = await readCashuCardBalance(card.transceive)

    expect(info).toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
      balanceSat: 500,
    })
    // Exact bytes, exact order: SELECT first, then GET_INFO, then GET_BALANCE.
    expect(card.sent).toEqual([SELECT_PACKAGE, GET_INFO, GET_BALANCE])
  })

  it("retries with the 8-byte applet AID when the card declines the package AID", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_BALANCE, ok(BALANCE_BODY)],
    ])

    const info = await readCashuCardBalance(card.transceive)

    expect(info?.balanceSat).toBe(500)
    expect(card.sent).toEqual([SELECT_PACKAGE, SELECT_APPLET, GET_INFO, GET_BALANCE])
  })

  it("a tag without the Cashu applet resolves null after both SELECT forms fail", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])

    await expect(readCashuCardBalance(card.transceive)).resolves.toBeNull()
    // Nothing is sent to a card that isn't ours.
    expect(card.sent).toEqual([SELECT_PACKAGE, SELECT_APPLET])
  })

  it("genuine status failures throw", async () => {
    const infoFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, SW_UNKNOWN],
    ])
    await expect(readCashuCardBalance(infoFails.transceive)).rejects.toThrow(
      /GET_INFO failed: 6f00/,
    )

    const balanceFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_BALANCE, SW_UNKNOWN],
    ])
    await expect(readCashuCardBalance(balanceFails.transceive)).rejects.toThrow(
      /GET_BALANCE failed: 6f00/,
    )
  })
})
