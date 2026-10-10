/**
 * ENG-616: the Cashu card APDU codec, byte for byte.
 *
 * The wire format is spelled out literally (cashu-javacard spec/APDU.md, as
 * cardctl and flash-pos send it). Literal on purpose: a change in the client
 * that drifts from the spec — or from what the merchant terminal sends to the
 * same card — must fail here, not be absorbed by a shared constant.
 */
import {
  AppletNotSelectedError,
  CASHU_APPLET_AID,
  CardError,
  CardProtocolError,
  INS,
  PROOF_SIZE,
  blockedPinGatesSpend,
  buildApdu,
  buildSelectApdu,
  clearSpent,
  describeStatusWord,
  getBalance,
  getInfo,
  getProof,
  getProofCount,
  getPubkey,
  getSlotStatuses,
  getUnspentByKeyset,
  isProofShaped,
  isValidCardPin,
  loadProof,
  parseBalance,
  parseInfo,
  parseResponse,
  readCardSlots,
  readCashuCard,
  readKeysetSplit,
  selectApplet,
  spendProof,
  toHex,
  verifyCardPin,
  triesLeft,
  setCardPin,
  changeCardPin,
  clearCardPin,
} from "../../app/utils/cashu-card"
import { createFakeCard } from "../helpers/fake-cashu"

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
// spec/APDU.md GET_SLOT_STATUS: Le 20, one status byte for each of 32 slots.
const GET_SLOT_STATUS_32 = [0xb0, 0x14, 0x00, 0x00, 0x20]
const getProofApdu = (slot: number) => [0xb0, 0x13, slot, 0x00, PROOF_SIZE]
// spec/APDU.md CLEAR_SPENT: Le 1, the count of slots freed.
const CLEAR_SPENT = [0xb0, 0x31, 0x00, 0x00, 0x01]

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

// The NUT-02 id forge's sat keyset has, as the slot stores it: 8 raw bytes.
const KEYSET = [0x00, 0x59, 0x53, 0x4c, 0xe0, 0xbf, 0xa1, 0x9a]
const KEYSET_HEX = "0059534ce0bfa19a"
const OTHER_KEYSET = [0x00, 0xad, 0x26, 0x8c, 0x4d, 0x1f, 0x58, 0x26]

/** A uint32 as its four big-endian bytes, by arithmetic rather than shifts. */
const uint32 = (n: number) =>
  [2 ** 24, 2 ** 16, 2 ** 8, 1].map((d) => Math.floor(n / d) % 256)

/**
 * A 78-byte slot as GET_PROOF returns it (spec/APDU.md "Proof Slot Layout").
 * `nonceByte` fills the nonce, so slots can be told apart.
 */
const proofSlot = (
  status: number,
  amount: number,
  { keyset = KEYSET, nonceByte = 0xab }: { keyset?: number[]; nonceByte?: number } = {},
) => [
  status,
  ...keyset,
  ...uint32(amount),
  ...new Array(32).fill(nonceByte),
  0x02,
  ...new Array(32).fill(0xcd),
]

/** INFO_BODY's slots: slot 0 unspent, then 7 spent, then 24 empty. */
const SLOT_STATUSES = [1, ...new Array(7).fill(2), ...new Array(24).fill(0)]
/** The seven spent slots of INFO_BODY's card: slot i holds 2^i, nonce bytes i. */
const SPENT_SLOTS = [1, 2, 3, 4, 5, 6, 7]
const spentScript = (): Array<[number[], number[]]> =>
  SPENT_SLOTS.map((slot) => [
    getProofApdu(slot),
    ok(proofSlot(2, 2 ** slot, { nonceByte: slot })),
  ])
const spentSlotsRead = () =>
  SPENT_SLOTS.map((slot) => ({
    slot,
    status: "spent",
    keysetId: KEYSET_HEX,
    amount: 2 ** slot,
    nonce: slot.toString(16).padStart(2, "0").repeat(32),
    C: "02" + "cd".repeat(32),
  }))

/** secp256k1's generator, compressed: a C that is a point. */
const ON_CURVE_C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
/** An x past the field order: no point has it. */
const OFF_CURVE_C = "02" + "ff".repeat(32)

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

  // The bridges keep only the low byte (Android `& 0xff`, iOS a Byte cast) and
  // read NaN as 0: slot 256 would reach the card as slot 0, a NaN as 0x00.
  const notBytes: [string, Parameters<typeof buildApdu>[1]][] = [
    ["a P1 past 0xFF", { p1: 256 }],
    ["a negative P1", { p1: -1 }],
    ["a fractional P2", { p2: 1.5 }],
    ["a NaN data byte", { data: [0x01, NaN] }],
    ["a data value past 0xFF", { data: [0x100] }],
    ["an Le past 0xFF", { le: 0x100 }],
  ]
  notBytes.forEach(([label, opts]) => {
    it(`refuses ${label} rather than let the bridge truncate it`, () => {
      expect(() => buildApdu(INS.GET_PROOF, opts)).toThrow(CardProtocolError)
    })
  })

  it("guards the commands built on it: a slot index past 0xFF never reaches the card", async () => {
    const card = echoCard(ok(proofSlot(1, 8)))
    await expect(getProof(card.transceive, 256)).rejects.toThrow(CardProtocolError)
    expect(card.sent).toEqual([])
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

  // spec/APDU.md:26-27: "the 7-byte form first, the 8-byte form as a fallback
  // on any error" — cardctl's select() too. flash-pos falls back on 6A82 only;
  // this app follows the spec, deliberately (see selectApplet's comment).
  const otherRefusals: [string, number[]][] = [
    ["6999 (the applet's select() failed)", SW_APPLET_SELECT_FAILED],
    ["6283 (a locked instance)", SW_LOCKED],
    ["6F00", SW_UNKNOWN],
  ]
  otherRefusals.forEach(([label, sw]) => {
    it(`falls back to the applet AID on ${label}, not only on 6A82`, async () => {
      const card = scriptedCard([
        [SELECT_PACKAGE, sw],
        [SELECT_APPLET, ok([0, 2])],
      ])
      await expect(selectApplet(card.transceive)).resolves.toEqual([0, 2])
      expect(card.sent).toEqual([SELECT_PACKAGE, SELECT_APPLET])
    })
  })

  it("treats a response too short to carry a status word as a refusal", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, [0x90]],
      [SELECT_APPLET, ok([0, 2])],
    ])
    await expect(selectApplet(card.transceive)).resolves.toEqual([0, 2])
  })

  it("rejects with both status words when neither AID selects", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_APPLET_SELECT_FAILED],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(AppletNotSelectedError)
    // Still a CardError, carrying the last word the card said.
    expect(error).toBeInstanceOf(CardError)
    expect(error).toMatchObject({ sw: 0x6a82, packageSw: 0x6999, appletSw: 0x6a82 })
    expect(error.message).toBe("SELECT failed: package AID 6999, applet AID 6A82")
    expect(error.noSuchApplet).toBe(false)
  })

  it("marks 6A82 to both forms as no such applet: not a Cashu card", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      sw: 0x6a82,
      noSuchApplet: true,
    })
  })

  it("rethrows a transport failure instead of retrying on a dead handle", async () => {
    const sent: number[][] = []
    const transceive = async (bytes: number[]) => {
      sent.push(bytes)
      throw new Error("Tag was lost")
    }
    await expect(selectApplet(transceive)).rejects.toThrow("Tag was lost")
    expect(sent).toEqual([SELECT_PACKAGE])
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
      clearPin: false,
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
    expect(info.clearPin).toBe(false)
  })

  // spec/APDU.md GET_INFO, capability bit 3: CLEAR_PIN (0x43) is answered,
  // applet 0.5 and later. The bit alone decides; the version says nothing.
  it("decodes the CLEAR_PIN capability (bit 3) on its own, whatever the version", () => {
    const withBit = parseInfo([0, 4, 32, 0, 0, 32, 0x08, 1])
    expect(withBit.clearPin).toBe(true)
    expect(withBit.secp256k1Native).toBe(false)
    expect(withBit.schnorr).toBe(false)
    expect(parseInfo([0, 5, 32, 0, 0, 32, 0x0f, 1]).clearPin).toBe(true)
    expect(parseInfo([0, 5, 32, 0, 0, 32, 0x07, 1]).clearPin).toBe(false)
    // Reserved bits 4-7 never read as the capability.
    expect(parseInfo([0, 5, 32, 0, 0, 32, 0xf7, 1]).clearPin).toBe(false)
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

describe("blockedPinGatesSpend (ENG-615)", () => {
  // CashuApplet.java@v0.2.0:587-591 gates only pinState 1, so a blocked v0.2
  // card spends with no PIN. No release carrying cashu-javacard#25 is
  // confirmed yet, so no version — including ones this app has never seen —
  // may be presented as frozen.
  const versions = ["0.1", "0.2", "0.3", "1.0", "9.9"]
  versions.forEach((version) => {
    it(`treats a blocked v${version} card as spendable by whoever holds it`, () => {
      expect(blockedPinGatesSpend(version)).toBe(false)
    })
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

  it("sends an eight-digit PIN, the applet's longest", async () => {
    const card = scriptedCard([
      [
        [0xb0, 0x40, 0x00, 0x00, 0x08, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38],
        ok([]),
      ],
    ])
    await expect(verifyCardPin(card.transceive, "12345678")).resolves.toBeUndefined()
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

  // Every one of these would reach the card as the wrong bytes (or a length
  // the applet refuses) and spend one of its three tries; the third blocks
  // the card, and a blocked v0.2 card spends for anyone (ENG-615).
  const refused: [string, string][] = [
    ["Arabic-Indic digits from a localised keypad", "١٢٣٤"],
    ["full-width digits", "１２３４"],
    ["letters", "12a4"],
    ["a space", "12 34"],
    ["three digits", "123"],
    ["nine digits", "123456789"],
    ["nothing", ""],
  ]
  refused.forEach(([label, pin]) => {
    it(`refuses ${label} before anything reaches the card`, async () => {
      const card = echoCard(ok([]))
      await expect(verifyCardPin(card.transceive, pin)).rejects.toThrow(CardProtocolError)
      expect(card.sent).toEqual([])
    })
  })

  it("never echoes the PIN in the refusal", async () => {
    const card = echoCard(ok([]))
    const error = await verifyCardPin(card.transceive, "98x7").catch((e) => e)
    expect(error.message).not.toContain("98x7")
  })

  it("isValidCardPin accepts exactly 4 to 8 ASCII digits", () => {
    expect(["1234", "00000000", "12345"].every(isValidCardPin)).toBe(true)
    expect(["123", "123456789", "12a4", "١٢٣٤"].some(isValidCardPin)).toBe(false)
  })
})

describe("LOAD_PROOF", () => {
  const proof = {
    keysetId: KEYSET_HEX,
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

  it("writes the largest amount the 4-byte field holds", async () => {
    const card = echoCard(ok([0]))
    await loadProof(card.transceive, { ...proof, amount: 0xffffffff })
    expect(card.sent[0].slice(13, 17)).toEqual([0xff, 0xff, 0xff, 0xff])
  })

  it("refuses a keyset id that is not 16 hex chars — ASCII-encoding stored half an id once", async () => {
    const card = echoCard(ok([0]))
    await expect(
      loadProof(card.transceive, { ...proof, keysetId: "0059534c" }),
    ).rejects.toThrow(/keyset id must be 16 hex chars/)
    expect(card.sent).toEqual([])
  })

  it("refuses a wrong-length nonce or C before anything reaches the card", async () => {
    const card = echoCard(ok([0]))
    await expect(loadProof(card.transceive, { ...proof, nonce: "ab" })).rejects.toThrow(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  // `>>>` wraps silently, and parseInt of a non-hex pair is NaN, which the
  // bridge sends as 0x00: each would store a proof the mint rejects.
  const badProofs: [string, Partial<typeof proof>][] = [
    ["a zero amount", { amount: 0 }],
    ["a negative amount", { amount: -8 }],
    ["a fractional amount", { amount: 1.5 }],
    ["an amount past 2^32 - 1", { amount: 2 ** 32 }],
    ["a NaN amount", { amount: NaN }],
    ["a keyset id with a non-hex digit", { keysetId: "0059534ce0bfa19z" }],
    ["a nonce with non-hex digits", { nonce: "zz".repeat(32) }],
    ["a C with a non-hex digit", { C: "0g" + "cd".repeat(32) }],
    ["an odd-length C", { C: "02" + "cd".repeat(32) + "e" }],
  ]
  badProofs.forEach(([label, override]) => {
    it(`refuses ${label} before any APDU is built`, async () => {
      const card = echoCard(ok([0]))
      await expect(loadProof(card.transceive, { ...proof, ...override })).rejects.toThrow(
        CardProtocolError,
      )
      expect(card.sent).toEqual([])
    })
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
  it("decodes all five fields of the 78-byte slot, keyset id from raw bytes", async () => {
    const card = scriptedCard([[getProofApdu(3), ok(proofSlot(1, 1024))]])
    await expect(getProof(card.transceive, 3)).resolves.toEqual({
      slot: 3,
      status: "unspent",
      keysetId: KEYSET_HEX,
      amount: 1024,
      nonce: "ab".repeat(32),
      C: "02" + "cd".repeat(32),
    })
  })

  it("reports a spent slot as spent — spent slots stay readable", async () => {
    const card = echoCard(ok(proofSlot(2, 1024)))
    await expect(getProof(card.transceive, 0)).resolves.toMatchObject({ status: "spent" })
  })

  it("rejects a short slot rather than reading undefined bytes", async () => {
    const card = echoCard(ok(proofSlot(1, 1024).slice(0, 40)))
    await expect(getProof(card.transceive, 0)).rejects.toThrow(CardProtocolError)
  })

  it("rejects an empty or unknown status byte instead of guessing", async () => {
    await expect(
      getProof(echoCard(ok(proofSlot(0, 1024))).transceive, 0),
    ).rejects.toThrow(/unknown status/)
    await expect(
      getProof(echoCard(ok(proofSlot(9, 1024))).transceive, 0),
    ).rejects.toThrow(/unknown status/)
  })

  it("surfaces a card refusal as a CardError naming the slot", async () => {
    const card = echoCard([0x6a, 0x88])
    await expect(getProof(card.transceive, 7)).rejects.toThrow(
      "GET_PROOF slot 7 failed: slot is empty (0x6A88)",
    )
  })
})

describe("getUnspentByKeyset", () => {
  it("reads the slot map, then only the unspent slots, and sums them per keyset", async () => {
    // slots 0 and 3 unspent under one keyset, 5 under another; 1 spent, rest empty.
    const statuses = [1, 2, 0, 1, 0, 1, 0, 0]
    const card = scriptedCard([
      [[0xb0, 0x14, 0x00, 0x00, 0x08], ok(statuses)],
      [getProofApdu(0), ok(proofSlot(1, 16))],
      [getProofApdu(3), ok(proofSlot(1, 8))],
      [getProofApdu(5), ok(proofSlot(1, 250, { keyset: OTHER_KEYSET }))],
    ])

    await expect(getUnspentByKeyset(card.transceive, 8)).resolves.toEqual([
      { keysetId: KEYSET_HEX, amount: 24 },
      { keysetId: hex(OTHER_KEYSET), amount: 250 },
    ])
    // A spent or empty slot is never read: its value is not on the card.
    expect(card.sent).toEqual([
      [0xb0, 0x14, 0x00, 0x00, 0x08],
      getProofApdu(0),
      getProofApdu(3),
      getProofApdu(5),
    ])
  })

  it("never sends SPEND_PROOF, LOAD_PROOF or SIGN_ARBITRARY", async () => {
    const card = scriptedCard([
      [GET_SLOT_STATUS_32, ok(SLOT_STATUSES)],
      [getProofApdu(0), ok(proofSlot(1, 500))],
    ])
    await getUnspentByKeyset(card.transceive, 32)
    const instructions = card.sent.map((apdu) => apdu[1])
    expect(instructions).toEqual([INS.GET_SLOT_STATUS, INS.GET_PROOF])
  })
})

describe("CLEAR_SPENT", () => {
  it("sends the exact APDU: CLA b0, INS 31, Le 1, and returns the card's count of freed slots", async () => {
    const card = scriptedCard([[CLEAR_SPENT, ok([7])]])
    await expect(clearSpent(card.transceive)).resolves.toBe(7)
    expect(card.sent).toEqual([[0xb0, 0x31, 0x00, 0x00, 0x01]])
  })

  it("rejects a count that is not one byte rather than guess what was freed", async () => {
    await expect(clearSpent(echoCard(ok([])).transceive)).rejects.toThrow(
      CardProtocolError,
    )
    await expect(clearSpent(echoCard(ok([1, 2])).transceive)).rejects.toThrow(
      "CLEAR_SPENT: expected a 1-byte count, got 2",
    )
  })

  it("surfaces a PIN-gated refusal as a CardError naming the command", async () => {
    await expect(clearSpent(echoCard([0x69, 0x82]).transceive)).rejects.toMatchObject({
      name: "CardError",
      sw: 0x6982,
      message: "CLEAR_SPENT failed: PIN required (0x6982)",
    })
  })
})

describe("isProofShaped (spec/CARD-FILE.md slot checks: a CLEAR_SPENT remnant is not a proof)", () => {
  const proof = {
    keysetId: KEYSET_HEX,
    amount: 8,
    nonce: "ab".repeat(32),
    C: ON_CURVE_C,
  }

  it("accepts a slot whose amount is a power of two, whose C is a point, and whose nonce and keyset are set", () => {
    expect(isProofShaped(proof)).toBe(true)
    expect(isProofShaped({ ...proof, amount: 1 })).toBe(true)
    expect(isProofShaped({ ...proof, amount: 2 ** 31 })).toBe(true)
  })

  const remnants: [string, Partial<typeof proof>][] = [
    ["a zeroed amount", { amount: 0 }],
    ["an amount that is no power of two", { amount: 3 }],
    ["an amount past the 4-byte field", { amount: 2 ** 32 }],
    ["a fractional amount", { amount: 2.5 }],
    ["a C that is no point", { C: OFF_CURVE_C }],
    ["a zeroed C", { C: "00".repeat(33) }],
    ["a zeroed nonce", { nonce: "00".repeat(32) }],
    ["a zeroed keyset id", { keysetId: "0000000000000000" }],
  ]
  remnants.forEach(([label, torn]) => {
    it(`refuses ${label}`, () => {
      expect(isProofShaped({ ...proof, ...torn })).toBe(false)
    })
  })
})

describe("readCardSlots", () => {
  it("reads the slot map, then every occupied slot, and returns the unspent value per keyset beside the spent slots", async () => {
    // slots 0 and 3 unspent under one keyset, 5 under another; 1 and 6 spent.
    const statuses = [1, 2, 0, 1, 0, 1, 2, 0]
    const card = scriptedCard([
      [[0xb0, 0x14, 0x00, 0x00, 0x08], ok(statuses)],
      [getProofApdu(0), ok(proofSlot(1, 16))],
      [getProofApdu(1), ok(proofSlot(2, 4, { nonceByte: 0x11 }))],
      [getProofApdu(3), ok(proofSlot(1, 8))],
      [getProofApdu(5), ok(proofSlot(1, 250, { keyset: OTHER_KEYSET }))],
      [getProofApdu(6), ok(proofSlot(2, 2, { keyset: OTHER_KEYSET, nonceByte: 0x66 }))],
    ])

    await expect(readCardSlots(card.transceive, 8)).resolves.toEqual({
      keysets: [
        { keysetId: KEYSET_HEX, amount: 24 },
        { keysetId: hex(OTHER_KEYSET), amount: 250 },
      ],
      spentSlots: [
        {
          slot: 1,
          status: "spent",
          keysetId: KEYSET_HEX,
          amount: 4,
          nonce: "11".repeat(32),
          C: "02" + "cd".repeat(32),
        },
        {
          slot: 6,
          status: "spent",
          keysetId: hex(OTHER_KEYSET),
          amount: 2,
          nonce: "66".repeat(32),
          C: "02" + "cd".repeat(32),
        },
      ],
    })
    // An empty slot is never read; the spent ones are, in slot order.
    expect(card.sent).toEqual([
      [0xb0, 0x14, 0x00, 0x00, 0x08],
      getProofApdu(0),
      getProofApdu(1),
      getProofApdu(3),
      getProofApdu(5),
      getProofApdu(6),
    ])
  })

  it("counts a slot as neither when its own status byte disagrees with the slot map", async () => {
    const card = scriptedCard([
      [[0xb0, 0x14, 0x00, 0x00, 0x02], ok([1, 2])],
      // The map said spent; the slot says unspent (and the other way round).
      [getProofApdu(0), ok(proofSlot(2, 16))],
      [getProofApdu(1), ok(proofSlot(1, 8))],
    ])
    await expect(readCardSlots(card.transceive, 2)).resolves.toEqual({
      keysets: [],
      spentSlots: [],
    })
  })

  it("reads only: never SPEND_PROOF, LOAD_PROOF or CLEAR_SPENT", async () => {
    const card = scriptedCard([
      [GET_SLOT_STATUS_32, ok(SLOT_STATUSES)],
      [getProofApdu(0), ok(proofSlot(1, 500))],
      ...spentScript(),
    ])
    await readCardSlots(card.transceive, 32)
    const instructions = card.sent.map((apdu) => apdu[1])
    expect(instructions).toEqual([
      INS.GET_SLOT_STATUS,
      ...new Array(8).fill(INS.GET_PROOF),
    ])
  })
})

describe("readKeysetSplit", () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  const info = (unspent: number, spent: number) =>
    parseInfo([0, 2, 32, unspent, spent, 32 - unspent - spent, 0x07, 1])

  it("reads the slots of a card holding nothing unspent but something spent: the spent slots are what the next top-up frees", async () => {
    const card = scriptedCard([
      [GET_SLOT_STATUS_32, ok([0, ...new Array(7).fill(2), ...new Array(24).fill(0)])],
      ...spentScript(),
    ])
    await expect(readKeysetSplit(card.transceive, info(0, 7))).resolves.toEqual({
      keysets: [],
      spentSlots: spentSlotsRead(),
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it("sends nothing to a card with no occupied slot", async () => {
    const card = scriptedCard([])
    await expect(readKeysetSplit(card.transceive, info(0, 0))).resolves.toEqual({
      keysets: [],
      spentSlots: [],
    })
    expect(card.sent).toEqual([])
  })

  it("a spent slot the card refuses to read costs the whole read, split and spent slots alike", async () => {
    const card = scriptedCard([
      [GET_SLOT_STATUS_32, ok(SLOT_STATUSES)],
      [getProofApdu(0), ok(proofSlot(1, 500))],
      [getProofApdu(1), SW_UNKNOWN],
    ])
    await expect(readKeysetSplit(card.transceive, info(1, 7))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: CardError 6F00")
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

  it("hex-encodes a Uint8Array too (a Uint8Array's own map would coerce the strings back to bytes)", () => {
    expect(toHex(new Uint8Array([0x00, 0xff, 0x10, 0x0a]))).toBe("00ff100a")
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

  /** INFO_BODY's card: one unspent 500 proof in slot 0, spent slots 1-7. */
  const READ_SCRIPT: Array<[number[], number[]]> = [
    [SELECT_PACKAGE, ok([0, 2])],
    [GET_INFO, ok(INFO_BODY)],
    [GET_PUBKEY, ok(PUBKEY)],
    [GET_BALANCE, ok(BALANCE_BODY)],
    [GET_SLOT_STATUS_32, ok(SLOT_STATUSES)],
    [getProofApdu(0), ok(proofSlot(1, 500))],
    ...spentScript(),
  ]

  it("selects, then reads info, pubkey, balance and every occupied slot, in that order and nothing else", async () => {
    const card = scriptedCard(READ_SCRIPT)

    await expect(readCashuCard(card.transceive)).resolves.toEqual({
      version: "0.2",
      maxSlots: 32,
      unspent: 1,
      spent: 7,
      empty: 24,
      secp256k1Native: true,
      schnorr: true,
      clearPin: false,
      pinState: "set",
      pubkey: hex(PUBKEY),
      balance: 500,
      keysets: [{ keysetId: KEYSET_HEX, amount: 500 }],
      // The spent slots, data and all (ENG-631): the next top-up asks the
      // mint about them before its load tap frees any.
      spentSlots: spentSlotsRead(),
    })
    expect(card.sent).toEqual([
      SELECT_PACKAGE,
      GET_INFO,
      GET_PUBKEY,
      GET_BALANCE,
      GET_SLOT_STATUS_32,
      getProofApdu(0),
      ...SPENT_SLOTS.map(getProofApdu),
    ])
  })

  it("reads no slots on an empty card", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok([0, 2, 32, 0, 0, 32, 0x07, 0])],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, ok([0, 0, 0, 0])],
    ])

    await expect(readCashuCard(card.transceive)).resolves.toMatchObject({
      balance: 0,
      keysets: [],
      spentSlots: [],
    })
    expect(card.sent).toEqual([SELECT_PACKAGE, GET_INFO, GET_PUBKEY, GET_BALANCE])
  })

  it("retries with the 8-byte applet AID when the card declines the package AID", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, ok([0, 2])],
      ...READ_SCRIPT.slice(1),
    ])

    const info = await readCashuCard(card.transceive)

    expect(info?.balance).toBe(500)
    expect(card.sent[0]).toEqual(SELECT_PACKAGE)
    expect(card.sent[1]).toEqual(SELECT_APPLET)
  })

  it("reads a card whose package-AID SELECT fails with something other than 6A82", async () => {
    // The live read path and selectApplet share one policy: any refusal of the
    // package AID earns the applet-AID SELECT (spec/APDU.md:26-27).
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_APPLET_SELECT_FAILED],
      [SELECT_APPLET, ok([0, 2])],
      ...READ_SCRIPT.slice(1),
    ])

    await expect(readCashuCard(card.transceive)).resolves.toMatchObject({ balance: 500 })
    expect(warn).not.toHaveBeenCalled()
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

  it("a transport failure on SELECT propagates instead of reading as not-a-Cashu-card", async () => {
    const transceive = async () => {
      throw new Error("Tag was lost")
    }
    await expect(readCashuCard(transceive)).rejects.toThrow("Tag was lost")
  })

  it("genuine status failures up to GET_BALANCE throw a CardError naming the command", async () => {
    // The four reads flash-pos readCard makes: without any of them there is
    // no balance to show, so the read fails as a whole.
    const infoFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, SW_UNKNOWN],
    ])
    await expect(readCashuCard(infoFails.transceive)).rejects.toThrow(
      "GET_INFO failed: the card failed to sign (0x6F00)",
    )

    const pubkeyFails = scriptedCard([
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, SW_UNKNOWN],
    ])
    await expect(readCashuCard(pubkeyFails.transceive)).rejects.toThrow(
      "GET_PUBKEY failed: the card failed to sign (0x6F00)",
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

  describe("the keyset split is best effort once GET_BALANCE has answered", () => {
    // Two unspent proofs, 500 + 1000, in slots 0 and 1; the rest empty.
    const TWO_PROOF_INFO = [0, 2, 32, 2, 0, 30, 0x07, 1]
    const TWO_PROOF_BALANCE = uint32(1500)
    const TWO_PROOF_STATUSES = [1, 1, ...new Array(30).fill(0)]
    const upToBalance: Array<[number[], number[]]> = [
      [SELECT_PACKAGE, ok([0, 2])],
      [GET_INFO, ok(TWO_PROOF_INFO)],
      [GET_PUBKEY, ok(PUBKEY)],
      [GET_BALANCE, ok(TWO_PROOF_BALANCE)],
    ]

    it("a card pulled away at the second GET_PROOF still reads: balance and pubkey, no split", async () => {
      // The Android case the split must survive: the user lifts the phone at
      // the discovery beep, midway through the per-slot reads.
      const card = scriptedCard([
        ...upToBalance,
        [GET_SLOT_STATUS_32, ok(TWO_PROOF_STATUSES)],
        [getProofApdu(0), ok(proofSlot(1, 500))],
      ])
      const lost = new Error("readerTransceiveErrorTagConnectionLost")
      const transceive = async (bytes: number[]) => {
        if (hex(bytes) === hex(getProofApdu(1))) {
          card.sent.push(bytes)
          throw lost
        }
        return card.transceive(bytes)
      }

      const info = await readCashuCard(transceive)

      expect(info).toMatchObject({
        version: "0.2",
        unspent: 2,
        pinState: "set",
        pubkey: hex(PUBKEY),
        balance: 1500,
      })
      // Not a partial split that would under-report the card: none at all.
      expect(info?.keysets).toBeUndefined()
      expect(info?.spentSlots).toBeUndefined()
      // The second GET_PROOF was attempted; nothing after it.
      expect(card.sent).toEqual([
        SELECT_PACKAGE,
        GET_INFO,
        GET_PUBKEY,
        GET_BALANCE,
        GET_SLOT_STATUS_32,
        getProofApdu(0),
        getProofApdu(1),
      ])
      // Only the error's class name reaches the console, never its message.
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: Error")
    })

    it("a slot the card refuses to read leaves the split out and logs the status word", async () => {
      const card = scriptedCard([
        ...READ_SCRIPT.slice(0, 5),
        [getProofApdu(0), SW_UNKNOWN],
      ])

      const info = await readCashuCard(card.transceive)

      expect(info).toMatchObject({ balance: 500, pubkey: hex(PUBKEY) })
      expect(info?.keysets).toBeUndefined()
      expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: CardError 6F00")
    })

    it("a card that refuses GET_SLOT_STATUS reads without the split and sends no GET_PROOF", async () => {
      const card = scriptedCard([...upToBalance, [GET_SLOT_STATUS_32, [0x6d, 0x00]]])

      const info = await readCashuCard(card.transceive)

      expect(info).toMatchObject({ balance: 1500 })
      expect(info?.keysets).toBeUndefined()
      expect(card.sent.map((apdu) => apdu[1])).not.toContain(INS.GET_PROOF)
      expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: CardError 6D00")
    })

    it("a malformed slot map is a framing failure, and also costs only the split", async () => {
      const card = scriptedCard([...upToBalance, [GET_SLOT_STATUS_32, ok([1, 1, 0])]])

      const info = await readCashuCard(card.transceive)

      expect(info).toMatchObject({ balance: 1500 })
      expect(info?.keysets).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        "Cashu card keyset split skipped: CardProtocolError",
      )
    })
  })

  it("spends, loads and clears nothing — a read must never send SPEND_PROOF, LOAD_PROOF or CLEAR_SPENT", async () => {
    const card = scriptedCard(READ_SCRIPT)
    await readCashuCard(card.transceive)
    const instructions = card.sent.map((apdu) => apdu[1])
    expect(instructions).not.toContain(INS.SPEND_PROOF)
    expect(instructions).not.toContain(INS.LOAD_PROOF)
    expect(instructions).not.toContain(INS.CLEAR_SPENT)
  })
})

describe("PIN validation", () => {
  it("accepts 4 to 8 digits and nothing else", () => {
    expect(isValidCardPin("1234")).toBe(true)
    expect(isValidCardPin("12345678")).toBe(true)
    expect(isValidCardPin("123")).toBe(false)
    expect(isValidCardPin("123456789")).toBe(false)
    expect(isValidCardPin("12a4")).toBe(false)
    expect(isValidCardPin("")).toBe(false)
  })

  it("decodes the tries left from 63CX and nothing else", () => {
    expect(triesLeft(0x63c2)).toBe(2)
    expect(triesLeft(0x63c0)).toBe(0)
    expect(triesLeft(0x6983)).toBeUndefined()
    expect(triesLeft(0x9000)).toBeUndefined()
  })
})

describe("SET_PIN", () => {
  it("sends the PIN as ASCII bytes with Lc, no Le", async () => {
    const card = scriptedCard([
      [[0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34], ok([])],
    ])
    await expect(setCardPin(card.transceive, "1234")).resolves.toBeUndefined()
  })

  it("refuses an invalid PIN before anything reaches the card", async () => {
    const card = echoCard(ok([]))
    await expect(setCardPin(card.transceive, "12")).rejects.toThrow(CardProtocolError)
    expect(card.sent).toEqual([])
  })

  it("surfaces a card that already has a PIN", async () => {
    const card = echoCard([0x69, 0x85])
    await expect(setCardPin(card.transceive, "1234")).rejects.toMatchObject({
      sw: 0x6985,
    })
  })
})

describe("CHANGE_PIN", () => {
  it("sends oldLen ‖ old ‖ new as ASCII with Lc, no Le", async () => {
    const card = scriptedCard([
      [
        [
          0xb0, 0x42, 0x00, 0x00, 0x0b, 0x04, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
          0x38, 0x39, 0x30,
        ],
        ok([]),
      ],
    ])
    await expect(
      changeCardPin(card.transceive, "1234", "567890"),
    ).resolves.toBeUndefined()
  })

  it("refuses an invalid old or new PIN before anything reaches the card", async () => {
    const card = echoCard(ok([]))
    await expect(changeCardPin(card.transceive, "12", "5678")).rejects.toThrow(
      CardProtocolError,
    )
    await expect(changeCardPin(card.transceive, "1234", "56")).rejects.toThrow(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  it("surfaces an unverified session and a wrong old PIN as the card reports them", async () => {
    await expect(
      changeCardPin(echoCard([0x69, 0x82]).transceive, "1234", "5678"),
    ).rejects.toMatchObject({ sw: 0x6982 })
    await expect(
      changeCardPin(echoCard([0x63, 0xc1]).transceive, "1234", "5678"),
    ).rejects.toThrow("CHANGE_PIN failed: wrong PIN, 1 tries left (0x63C1)")
  })
})

describe("CLEAR_PIN (ENG-633, applet 0.5)", () => {
  it("sends len ‖ pin as ASCII with Lc one more than the PIN, no Le", async () => {
    const card = scriptedCard([
      [[0xb0, 0x43, 0x00, 0x00, 0x05, 0x04, 0x31, 0x32, 0x33, 0x34], ok([])],
    ])
    await expect(clearCardPin(card.transceive, "1234")).resolves.toBeUndefined()
    expect(card.sent[0][1]).toBe(INS.CLEAR_PIN)
  })

  it("sends an eight-digit PIN, the applet's longest", async () => {
    const card = scriptedCard([
      [
        [
          0xb0, 0x43, 0x00, 0x00, 0x09, 0x08, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37,
          0x38,
        ],
        ok([]),
      ],
    ])
    await expect(clearCardPin(card.transceive, "12345678")).resolves.toBeUndefined()
  })

  it("refuses an invalid PIN before anything reaches the card", async () => {
    const card = echoCard(ok([]))
    await expect(clearCardPin(card.transceive, "12")).rejects.toThrow(CardProtocolError)
    await expect(clearCardPin(card.transceive, "١٢٣٤")).rejects.toThrow(CardProtocolError)
    expect(card.sent).toEqual([])
  })

  it("never echoes the PIN in the refusal", async () => {
    const card = echoCard(ok([]))
    const error = await clearCardPin(card.transceive, "98x7").catch((e) => e)
    expect(error.message).not.toContain("98x7")
  })

  // Every status word spec/APDU.md lists for CLEAR_PIN, plus the 6D00 a 0.4
  // build answers: each reaches the caller as the card said it, named.
  const refusals: [number[], number, string][] = [
    [[0x69, 0x82], 0x6982, "CLEAR_PIN failed: PIN required (0x6982)"],
    [[0x63, 0xc1], 0x63c1, "CLEAR_PIN failed: wrong PIN, 1 tries left (0x63C1)"],
    [[0x69, 0x83], 0x6983, "CLEAR_PIN failed: PIN blocked (0x6983)"],
    [[0x69, 0x86], 0x6986, "CLEAR_PIN failed: card is locked against writes (0x6986)"],
    [[0x67, 0x00], 0x6700, "CLEAR_PIN failed: wrong length (0x6700)"],
    [[0x6d, 0x00], 0x6d00, "CLEAR_PIN failed: unsupported command (0x6D00)"],
  ]
  refusals.forEach(([response, sw, message]) => {
    it(`surfaces ${sw.toString(16).toUpperCase()} as the card reports it`, async () => {
      const error = await clearCardPin(echoCard(response).transceive, "1234").catch(
        (e) => e,
      )
      expect(error).toBeInstanceOf(CardError)
      expect(error).toMatchObject({ sw, context: "CLEAR_PIN" })
      expect(error.message).toBe(message)
    })
  })

  describe("against a card that follows the spec", () => {
    const info = async (card: ReturnType<typeof createFakeCard>) =>
      getInfo(card.transceive)

    it("after VERIFY_PIN in the same session, removes the PIN: GET_INFO then reads unset, with the capability still set", async () => {
      const card = createFakeCard(32, { pin: "1234", clearPin: true })
      expect(await info(card)).toMatchObject({ pinState: "set", clearPin: true })

      await verifyCardPin(card.transceive, "1234")
      await expect(clearCardPin(card.transceive, "1234")).resolves.toBeUndefined()

      expect(card.pin()).toBeUndefined()
      expect(card.triesLeft()).toBe(3)
      expect(await info(card)).toMatchObject({ pinState: "unset", clearPin: true })
      // The PIN is gone: VERIFY_PIN says so, and SET_PIN's slot is open.
      await expect(verifyCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6984,
      })
      expect(card.ins()).toEqual([0x01, 0x40, 0x43, 0x01, 0x40])
    })

    it("is refused without a verified session, and the PIN stays", async () => {
      const card = createFakeCard(32, { pin: "1234", clearPin: true })
      await expect(clearCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6982,
      })
      expect(card.pin()).toBe("1234")
    })

    it("a wrong PIN costs a try and ends the session's verification, so the next CLEAR_PIN is refused even with the right PIN", async () => {
      const card = createFakeCard(32, { pin: "1234", clearPin: true })
      await verifyCardPin(card.transceive, "1234")
      await expect(clearCardPin(card.transceive, "1111")).rejects.toMatchObject({
        sw: 0x63c2,
      })
      expect(card.triesLeft()).toBe(2)
      expect(card.verified()).toBe(false)
      await expect(clearCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6982,
      })
      expect(card.pin()).toBe("1234")
      // VERIFY_PIN again restores the session and the counter; then it clears.
      await verifyCardPin(card.transceive, "1234")
      expect(card.triesLeft()).toBe(3)
      await expect(clearCardPin(card.transceive, "1234")).resolves.toBeUndefined()
      expect(card.pin()).toBeUndefined()
    })

    it("a blocked PIN cannot be cleared: no session verifies it, so CLEAR_PIN answers 6982 with the right PIN", async () => {
      const card = createFakeCard(32, { pin: "1234", clearPin: true })
      for (const sw of [0x63c2, 0x63c1, 0x6983]) {
        await expect(verifyCardPin(card.transceive, "0000")).rejects.toMatchObject({ sw })
      }
      expect(await info(card)).toMatchObject({ pinState: "blocked" })
      await expect(verifyCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6983,
      })
      await expect(clearCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6982,
      })
      expect(card.pin()).toBe("1234")
    })

    it("a card without the capability (applet 0.4) answers 6D00, and GET_INFO never advertised it", async () => {
      const card = createFakeCard(32, { pin: "1234" })
      expect(await info(card)).toMatchObject({ pinState: "set", clearPin: false })
      await verifyCardPin(card.transceive, "1234")
      await expect(clearCardPin(card.transceive, "1234")).rejects.toMatchObject({
        sw: 0x6d00,
      })
      expect(card.pin()).toBe("1234")
    })
  })
})
