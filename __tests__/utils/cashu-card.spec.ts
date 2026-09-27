/**
 * ENG-616: the Cashu card APDU codec, byte for byte.
 *
 * The wire format is spelled out literally (cashu-javacard spec/APDU.md, as
 * cardctl and flash-pos send it). Literal on purpose: a change in the client
 * that drifts from the spec — or from what the merchant terminal sends to the
 * same card — must fail here, not be absorbed by a shared constant.
 */
import {
  CASHU_APPLET_AID,
  CardError,
  CardProtocolError,
  INS,
  PROOF_SIZE,
  buildApdu,
  buildSelectApdu,
  describeStatusWord,
  getBalance,
  getInfo,
  getProof,
  getProofCount,
  getPubkey,
  getSlotStatuses,
  loadProof,
  parseBalance,
  parseInfo,
  parseResponse,
  readCashuCard,
  selectApplet,
  spendProof,
  toHex,
  verifyCardPin,
} from "../../app/utils/cashu-card"

// SELECT is Case-4: the trailing 0x00 Le is load-bearing on iOS, where a
// Case-3 SELECT makes CoreNFC send no Le and the applet version comes back
// empty. flash-pos found this on hardware; both apps must send the same bytes.
const SELECT_PACKAGE = [
  0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02, 0x00,
]
const SELECT_APPLET = [
  0x00, 0xa4, 0x04, 0x00, 0x08, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02, 0x01, 0x00,
]
const GET_INFO = [0xb0, 0x01, 0x00, 0x00, 0x00]
const GET_PUBKEY = [0xb0, 0x10, 0x00, 0x00, 0x21]
const GET_BALANCE = [0xb0, 0x11, 0x00, 0x00, 0x04]
const GET_PROOF_COUNT = [0xb0, 0x12, 0x00, 0x00, 0x01]

// version 0.2, 32 slots, 1 unspent, 7 spent, 24 empty, caps 0x07, PIN set.
const INFO_BODY = [0, 2, 32, 1, 7, 24, 0x07, 1]
const BALANCE_BODY = [0, 0, 0x01, 0xf4]
const PUBKEY = [0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]
const SW_FILE_NOT_FOUND = [0x6a, 0x82]
const SW_UNKNOWN = [0x6f, 0x00]
/** JavaCard runtime: the applet exists but its select() failed. */
const SW_APPLET_SELECT_FAILED = [0x69, 0x99]
/** GlobalPlatform: the instance is present but locked. */
const SW_LOCKED = [0x62, 0x83]

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

/** A card that answers every APDU the same way, recording what it saw. */
const echoCard = (response: number[]) => {
  const sent: number[][] = []
  const transceive = async (bytes: number[]) => {
    sent.push(bytes)
    return response
  }
  return { sent, transceive }
}

describe("buildApdu", () => {
  it("builds a bare command with no data and no Le", () => {
    expect(buildApdu(INS.GET_INFO)).toEqual([0xb0, 0x01, 0x00, 0x00])
  })

  it("appends Le when given", () => {
    expect(buildApdu(INS.GET_BALANCE, { le: 0x04 })).toEqual(GET_BALANCE)
  })

  it("prefixes data with its length and puts the slot in P1", () => {
    expect(buildApdu(INS.SPEND_PROOF, { p1: 3, data: [0xaa, 0xbb], le: 0x40 })).toEqual([
      0xb0, 0x20, 0x03, 0x00, 0x02, 0xaa, 0xbb, 0x40,
    ])
  })

  it("omits the length byte for empty data rather than sending Lc=0", () => {
    expect(buildApdu(INS.GET_INFO, { data: [] })).toEqual([0xb0, 0x01, 0x00, 0x00])
  })

  it("accepts the largest payload short-form Lc can express", () => {
    const apdu = buildApdu(INS.LOAD_PROOF, { data: new Array(255).fill(0x11) })
    expect(apdu[4]).toBe(255)
    expect(apdu).toHaveLength(4 + 1 + 255)
  })

  it("refuses a payload too long for short-form Lc instead of truncating it", () => {
    expect(() => buildApdu(INS.LOAD_PROOF, { data: new Array(256).fill(0) })).toThrow(
      CardProtocolError,
    )
  })
})

describe("parseResponse", () => {
  it("strips the status word from the body", () => {
    expect(parseResponse([1, 2, 3, 0x90, 0x00], "X")).toEqual([1, 2, 3])
  })

  it("accepts an empty body with a success status word", () => {
    expect(parseResponse([0x90, 0x00], "X")).toEqual([])
  })

  it("throws CardError carrying the status word and naming the command", () => {
    try {
      parseResponse([0x69, 0x82], "SPEND_PROOF slot 4")
      throw new Error("did not throw")
    } catch (error) {
      expect(error).toBeInstanceOf(CardError)
      expect((error as CardError).sw).toBe(0x6982)
      expect((error as CardError).message).toBe(
        "SPEND_PROOF slot 4 failed: PIN required (0x6982)",
      )
    }
  })

  it("reports a response too short for a status word as a framing failure, not a refusal", () => {
    expect(() => parseResponse([0x90], "X")).toThrow(CardProtocolError)
    expect(() => parseResponse([0x90], "X")).not.toThrow(CardError)
  })
})

describe("describeStatusWord", () => {
  const named: [number, string][] = [
    [0x9000, "OK"],
    [0x6982, "PIN required"],
    [0x6983, "PIN blocked"],
    [0x6984, "no PIN set"],
    [0x6985, "proof already spent"],
    [0x6986, "card is locked against writes"],
    [0x6a82, "applet not found"],
    [0x6a84, "no free slot"],
    [0x6a88, "slot is empty"],
    [0x6e00, "wrong CLA — is this a Cashu card?"],
  ]
  named.forEach(([sw, text]) => {
    it(`names 0x${sw.toString(16)}`, () => {
      expect(describeStatusWord(sw)).toBe(text)
    })
  })

  it("decodes the tries-remaining nibble of a wrong-PIN answer", () => {
    expect(describeStatusWord(0x63c2)).toBe("wrong PIN, 2 tries left")
    expect(describeStatusWord(0x63c0)).toBe("wrong PIN, 0 tries left")
  })

  it("falls back for unknown codes instead of throwing", () => {
    expect(describeStatusWord(0x1234)).toBe("unexpected status word")
  })
})

describe("SELECT", () => {
  it("builds the package-AID SELECT by default and the applet-AID one on request", () => {
    expect(buildSelectApdu()).toEqual(SELECT_PACKAGE)
    expect(buildSelectApdu(CASHU_APPLET_AID)).toEqual(SELECT_APPLET)
  })

  it("selects with the 7-byte package AID first and returns the version body", async () => {
    const card = scriptedCard([[SELECT_PACKAGE, ok([0, 2])]])
    await expect(selectApplet(card.transceive)).resolves.toEqual([0, 2])
    expect(card.sent).toEqual([SELECT_PACKAGE])
  })

  it("falls back to the full applet AID when prefix select is unsupported", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, ok([0, 2])],
    ])
    await expect(selectApplet(card.transceive)).resolves.toEqual([0, 2])
    expect(card.sent).toEqual([SELECT_PACKAGE, SELECT_APPLET])
  })

  it("surfaces the card error when no AID selects", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({ sw: 0x6a82 })
  })

  it("rethrows a transport failure instead of retrying on a dead handle", async () => {
    const transceive = async () => {
      throw new Error("Tag was lost")
    }
    await expect(selectApplet(transceive)).rejects.toThrow("Tag was lost")
  })

  it("rethrows a non-6A82 status word without trying the fallback AID", async () => {
    const card = scriptedCard([[SELECT_PACKAGE, SW_LOCKED]])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({ sw: 0x6283 })
    expect(card.sent).toEqual([SELECT_PACKAGE])
  })
})

describe("GET_INFO", () => {
  it("decodes the 8-byte info block, PIN state included", () => {
    expect(parseInfo(INFO_BODY)).toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
      empty: 24,
      secp256k1Native: true,
      schnorr: true,
      pinState: "set",
    })
  })

  const pinStates: [number, string][] = [
    [0, "unset"],
    [1, "set"],
    [2, "blocked"],
    [9, "unknown"],
  ]
  pinStates.forEach(([byte, state]) => {
    it(`maps PIN state byte ${byte} to ${state}`, () => {
      expect(parseInfo([0, 2, 32, 0, 0, 32, 0x07, byte]).pinState).toBe(state)
    })
  })

  it("decodes capability flags independently", () => {
    const info = parseInfo([0, 2, 32, 0, 0, 32, 0x02, 0])
    expect(info.secp256k1Native).toBe(false)
    expect(info.schnorr).toBe(true)
  })

  it("rejects a short info block rather than reading undefined bytes", () => {
    expect(() => parseInfo([0, 2])).toThrow(/expected 8 bytes/)
  })

  it("sends the documented APDU", async () => {
    const card = scriptedCard([[GET_INFO, ok(INFO_BODY)]])
    await getInfo(card.transceive)
    expect(card.sent).toEqual([GET_INFO])
  })
})

describe("GET_PUBKEY", () => {
  it("sends Le=0x21 and returns the 33-byte compressed key", async () => {
    const card = scriptedCard([[GET_PUBKEY, ok(PUBKEY)]])
    await expect(getPubkey(card.transceive)).resolves.toEqual(PUBKEY)
    expect(card.sent).toEqual([GET_PUBKEY])
  })

  it("rejects a short key — a truncated pubkey would poison a P2PK lock", async () => {
    const card = echoCard(ok(PUBKEY.slice(0, 32)))
    await expect(getPubkey(card.transceive)).rejects.toThrow(CardProtocolError)
  })
})

describe("GET_BALANCE", () => {
  it("decodes a big-endian uint32", () => {
    expect(parseBalance(BALANCE_BODY)).toBe(500)
    expect(parseBalance([0, 0, 0, 0])).toBe(0)
  })

  it("stays unsigned above 2^31 — a large balance must not read negative", () => {
    expect(parseBalance([0x80, 0x00, 0x00, 0x00])).toBe(2147483648)
    expect(parseBalance([0xff, 0xff, 0xff, 0xff])).toBe(4294967295)
  })

  it("rejects a wrong-length balance", () => {
    expect(() => parseBalance([0, 0])).toThrow(/expected 4 bytes/)
  })

  it("sends the documented APDU", async () => {
    const card = scriptedCard([[GET_BALANCE, ok(BALANCE_BODY)]])
    await expect(getBalance(card.transceive)).resolves.toBe(500)
  })
})

describe("GET_PROOF_COUNT", () => {
  it("sends Le=1 and returns the count", async () => {
    const card = scriptedCard([[GET_PROOF_COUNT, ok([8])]])
    await expect(getProofCount(card.transceive)).resolves.toBe(8)
    expect(card.sent).toEqual([GET_PROOF_COUNT])
  })
})

describe("VERIFY_PIN", () => {
  it("sends the PIN as ASCII bytes with Lc, no Le", async () => {
    const card = scriptedCard([
      [[0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34], ok([])],
    ])
    await expect(verifyCardPin(card.transceive, "1234")).resolves.toBeUndefined()
  })

  it("surfaces a wrong PIN with the tries remaining", async () => {
    const card = echoCard([0x63, 0xc2])
    await expect(verifyCardPin(card.transceive, "0000")).rejects.toThrow(
      "VERIFY_PIN failed: wrong PIN, 2 tries left (0x63C2)",
    )
  })

  it("surfaces a blocked PIN", async () => {
    const card = echoCard([0x69, 0x83])
    await expect(verifyCardPin(card.transceive, "1234")).rejects.toMatchObject({
      sw: 0x6983,
    })
  })
})

describe("LOAD_PROOF", () => {
  const proof = {
    keysetId: "0059534ce0bfa19a",
    amount: 1024,
    nonce: "ab".repeat(32),
    C: "02" + "cd".repeat(32),
  }

  it("sends keyset as 8 RAW bytes, amount big-endian, nonce, C, with Le=1", async () => {
    const expected = [
      0xb0,
      0x30,
      0x00,
      0x00,
      77,
      0x00,
      0x59,
      0x53,
      0x4c,
      0xe0,
      0xbf,
      0xa1,
      0x9a,
      0x00,
      0x00,
      0x04,
      0x00,
      ...new Array(32).fill(0xab),
      0x02,
      ...new Array(32).fill(0xcd),
      0x01,
    ]
    const card = scriptedCard([[expected, ok([5])]])
    await expect(loadProof(card.transceive, proof)).resolves.toBe(5)
  })

  it("refuses a keyset id that is not 16 hex chars — ASCII-encoding stored half an id once", async () => {
    const card = echoCard(ok([0]))
    await expect(
      loadProof(card.transceive, { ...proof, keysetId: "0059534c" }),
    ).rejects.toThrow(/16 hex chars/)
    expect(card.sent).toEqual([])
  })

  it("refuses a wrong-length nonce or C before anything reaches the card", async () => {
    const card = echoCard(ok([0]))
    await expect(loadProof(card.transceive, { ...proof, nonce: "ab" })).rejects.toThrow(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  it("surfaces a full card", async () => {
    const card = echoCard([0x6a, 0x84])
    await expect(loadProof(card.transceive, proof)).rejects.toThrow(/no free slot/)
  })
})

describe("GET_SLOT_STATUS", () => {
  it("asks for exactly count bytes (Le is the slot count) and decodes them", async () => {
    const card = scriptedCard([[[0xb0, 0x14, 0x00, 0x00, 0x04], ok([0, 1, 2, 1])]])
    await expect(getSlotStatuses(card.transceive, 4)).resolves.toEqual([
      "empty",
      "unspent",
      "spent",
      "unspent",
    ])
  })

  it("rejects a short body rather than mapping missing slots to empty", async () => {
    const card = echoCard(ok([0, 1]))
    await expect(getSlotStatuses(card.transceive, 4)).rejects.toThrow(CardProtocolError)
  })

  it("rejects an unknown status byte", async () => {
    const card = echoCard(ok([0, 7]))
    await expect(getSlotStatuses(card.transceive, 2)).rejects.toThrow(/unknown status/)
  })

  it("refuses a nonsensical count before any APDU is sent", async () => {
    const card = echoCard(ok([]))
    await expect(getSlotStatuses(card.transceive, 0)).rejects.toThrow(CardProtocolError)
    expect(card.sent).toEqual([])
  })
})

describe("GET_PROOF", () => {
  const slotBody = (status: number) => [
    status,
    0x00,
    0x59,
    0x53,
    0x4c,
    0xe0,
    0xbf,
    0xa1,
    0x9a,
    0x00,
    0x00,
    0x04,
    0x00,
    ...new Array(32).fill(0xab),
    0x02,
    ...new Array(32).fill(0xcd),
  ]

  it("decodes all five fields of the 78-byte slot, keyset id from raw bytes", async () => {
    const card = scriptedCard([[[0xb0, 0x13, 0x03, 0x00, PROOF_SIZE], ok(slotBody(1))]])
    await expect(getProof(card.transceive, 3)).resolves.toEqual({
      slot: 3,
      status: "unspent",
      keysetId: "0059534ce0bfa19a",
      amount: 1024,
      nonce: "ab".repeat(32),
      C: "02" + "cd".repeat(32),
    })
  })

  it("reports a spent slot as spent — spent slots stay readable", async () => {
    const card = echoCard(ok(slotBody(2)))
    await expect(getProof(card.transceive, 0)).resolves.toMatchObject({ status: "spent" })
  })

  it("rejects a short slot rather than reading undefined bytes", async () => {
    const card = echoCard(ok(slotBody(1).slice(0, 40)))
    await expect(getProof(card.transceive, 0)).rejects.toThrow(CardProtocolError)
  })

  it("rejects an empty or unknown status byte instead of guessing", async () => {
    await expect(getProof(echoCard(ok(slotBody(0))).transceive, 0)).rejects.toThrow(
      /unknown status/,
    )
    await expect(getProof(echoCard(ok(slotBody(9))).transceive, 0)).rejects.toThrow(
      /unknown status/,
    )
  })

  it("surfaces a card refusal as a CardError naming the slot", async () => {
    const card = echoCard([0x6a, 0x88])
    await expect(getProof(card.transceive, 7)).rejects.toThrow(
      "GET_PROOF slot 7 failed: slot is empty (0x6A88)",
    )
  })
})

describe("SPEND_PROOF", () => {
  const message = new Array(32).fill(0x5a)
  const signature = new Array(64).fill(0x77)

  it("sends the exact APDU: CLA b0, INS 20, slot in P1, Lc 32, Le 40", async () => {
    const card = scriptedCard([
      [[0xb0, 0x20, 0x02, 0x00, 0x20, ...message, 0x40], ok(signature)],
    ])
    await expect(spendProof(card.transceive, 2, message)).resolves.toEqual(signature)
  })

  it("refuses a message that is not 32 bytes before anything reaches the card", async () => {
    const card = echoCard(ok(signature))
    await expect(spendProof(card.transceive, 2, [1, 2, 3])).rejects.toThrow(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  it("rejects a short signature — the slot is burned but the witness is unusable", async () => {
    const card = echoCard(ok(signature.slice(0, 63)))
    await expect(spendProof(card.transceive, 2, message)).rejects.toThrow(
      CardProtocolError,
    )
  })

  it("surfaces a double-spend refusal as a CardError naming the slot", async () => {
    const card = echoCard([0x69, 0x85])
    await expect(spendProof(card.transceive, 2, message)).rejects.toThrow(
      "SPEND_PROOF slot 2 failed: proof already spent (0x6985)",
    )
  })
})

describe("toHex", () => {
  it("zero-pads single-digit bytes", () => {
    expect(toHex([0, 1, 0xab])).toBe("0001ab")
  })
})

describe("readCashuCard", () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it("selects, then reads info, pubkey and balance, in that order and nothing else", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, ok(BALANCE_BODY)],
    ])

    await expect(readCashuCard(card.transceive)).resolves.toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
      empty: 24,
      secp256k1Native: true,
      schnorr: true,
      pinState: "set",
      pubkey: hex(PUBKEY),
      balance: 500,
    })
    expect(card.sent).toEqual([SELECT_PACKAGE, GET_INFO, GET_PUBKEY, GET_BALANCE])
  })

  it("retries with the 8-byte applet AID when the card declines the package AID", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, ok(BALANCE_BODY)],
    ])

    const info = await readCashuCard(card.transceive)

    expect(info?.balance).toBe(500)
    expect(card.sent[0]).toEqual(SELECT_PACKAGE)
    expect(card.sent[1]).toEqual(SELECT_APPLET)
  })

  it("a tag without the Cashu applet resolves null after both SELECT forms fail", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])

    await expect(readCashuCard(card.transceive)).resolves.toBeNull()
    // Nothing is sent to a card that isn't ours.
    expect(card.sent).toEqual([SELECT_PACKAGE, SELECT_APPLET])
    // 6A82 to both forms is the BoltCard/NTAG 424 answer the NDEF fall-through
    // relies on: an expected outcome, not one worth a log line.
    expect(warn).not.toHaveBeenCalled()
  })

  it("a card that refuses the package AID with anything but 6A82 resolves null and says so", async () => {
    // spec/APDU.md "SELECT": a double refusal "looks like an uninstalled
    // applet" — but 6999 is an installed applet whose select() failed, which
    // the caller would otherwise misreport as "not a Cashu card".
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_APPLET_SELECT_FAILED],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])

    await expect(readCashuCard(card.transceive)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "Cashu applet SELECT refused: package AID 6999, applet AID 6A82",
    )
  })

  it("a locked applet instance resolves null and logs both status words", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_LOCKED],
      [SELECT_APPLET, SW_LOCKED],
    ])

    await expect(readCashuCard(card.transceive)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(
      "Cashu applet SELECT refused: package AID 6283, applet AID 6283",
    )
  })

  it("genuine status failures after SELECT throw a CardError naming the command", async () => {
    const infoFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, SW_UNKNOWN],
    ])
    await expect(readCashuCard(infoFails.transceive)).rejects.toThrow(
      "GET_INFO failed: the card failed to sign (0x6F00)",
    )

    const balanceFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, SW_UNKNOWN],
    ])
    await expect(readCashuCard(balanceFails.transceive)).rejects.toMatchObject({
      sw: 0x6f00,
    })
  })

  it("spends and loads nothing — a read must never send SPEND_PROOF or LOAD_PROOF", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, ok(BALANCE_BODY)],
    ])
    await readCashuCard(card.transceive)
    const instructions = card.sent.map((apdu) => apdu[1])
    expect(instructions).not.toContain(INS.SPEND_PROOF)
    expect(instructions).not.toContain(INS.LOAD_PROOF)
  })
})
