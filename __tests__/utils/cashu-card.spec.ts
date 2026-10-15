/**
 * ENG-616, ENG-675: the Cashu card APDU codec, card protocol 2.0, byte for
 * byte.
 *
 * The wire format is spelled out literally (cashu-javacard spec/APDU.md at the
 * ref the e2e workflow pins). Literal on purpose: a change in the client that
 * drifts from the spec — or from what the merchant terminal sends to the same
 * card — must fail here, not be absorbed by a shared constant. The fake 2.0
 * card (`createFakeCard`) answers as the applet does; the real applet is
 * `__tests__/integration/card-topup-cardsim.spec.ts`'s.
 */
import { readFileSync } from "fs"
import { join } from "path"

import { schnorr, secp256k1 } from "@noble/curves/secp256k1"

import {
  AppletNotSelectedError,
  AuthenticatedTap,
  CASHU_AID,
  CASHU_APPLET_AID,
  CardAuthError,
  CardError,
  CardNeedsUpdateError,
  CardProtocolError,
  FOXY_LEGACY_AID,
  INS,
  LEGACY_CASHU_AID,
  MAX_SLOTS,
  PROOF_SIZE,
  ReadChanges,
  authMessage,
  authenticateCard,
  buildApdu,
  buildSelectApdu,
  cardRecordValue,
  changeCardPin,
  clearSpent,
  describeStatusWord,
  getBalance,
  getCardRecord,
  getInfo,
  getPieces,
  getProof,
  getProofCount,
  getPubkey,
  getSlotStatuses,
  getUnspentByKeyset,
  isProofShaped,
  isValidCardPin,
  loadProof,
  parseBalance,
  parseCardRecord,
  parseInfo,
  parseResponse,
  readCardSlots,
  readCashuCard,
  readKeysetSplit,
  selectApplet,
  setCardPin,
  setHeader,
  tellTime,
  toHex,
  triesLeft,
  verifyCardPin,
} from "../../app/utils/cashu-card"
import { ownerSigner, refreshCard } from "../../app/utils/cashu-card-owner"
import { FAKE_OWNER_KEY, createFakeCard } from "../helpers/fake-cashu"
import { HEADER_VECTORS, headerBytes } from "../helpers/block-headers"

// SELECT is Case-4: the trailing 0x00 Le is load-bearing on iOS, where a
// Case-3 SELECT makes CoreNFC send no Le and the applet version comes back
// empty. flash-pos found this on hardware; both apps must send the same bytes.
const SELECT_PACKAGE = [
  0x00, 0xa4, 0x04, 0x00, 0x0a, 0xf0, 0x43, 0x41, 0x53, 0x48, 0x55, 0x43, 0x41, 0x52,
  0x44, 0x00,
]
const SELECT_APPLET = [
  0x00, 0xa4, 0x04, 0x00, 0x0b, 0xf0, 0x43, 0x41, 0x53, 0x48, 0x55, 0x43, 0x41, 0x52,
  0x44, 0x01, 0x00,
]
const SELECT_LEGACY = [
  0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02, 0x00,
]
const SELECT_FOXY = [
  0x00, 0xa4, 0x04, 0x00, 0x09, 0xf0, 0x46, 0x4f, 0x58, 0x59, 0x43, 0x41, 0x52, 0x44,
  0x00,
]
// spec/APDU.md GET_INFO: P1 = 1, the long answer with the limits.
const GET_INFO = [0xb0, 0x01, 0x01, 0x00, 0x00]
const GET_PUBKEY = [0xb0, 0x10, 0x00, 0x00, 0x21]
const GET_BALANCE = [0xb0, 0x11, 0x00, 0x00, 0x04]
const GET_PROOF_COUNT = [0xb0, 0x12, 0x00, 0x00, 0x01]
const GET_CARD = [0xb0, 0x16, 0x00, 0x00, 0x00]
const getProofApdu = (slot: number) => [0xb0, 0x13, slot, 0x00, PROOF_SIZE]
const getPiecesApdu = (first: number) => [0xb0, 0x17, first, 0x00, 0x00]
// spec/APDU.md CLEAR_SPENT: Le 1, the count of slots freed.
const CLEAR_SPENT = [0xb0, 0x31, 0x00, 0x00, 0x01]

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
 * GET_INFO P1 = 1's 42 bytes (spec/APDU.md, GET_INFO): version 2.0, 128 slots,
 * the counts, capabilities FF, the PIN state, format 4, three tries, not
 * locked, the record set, a daily limit, an owner, the clock, and the
 * allowance.
 */
const infoBody = ({
  unspent = 1,
  spent = 7,
  pinState = 1,
  caps = 0xff,
  owner = 1,
  record = 1,
  day = 5000,
  now = 1791814824,
  payment = 0,
  allowance = 250,
  major = 2,
} = {}) => [
  major,
  0,
  128,
  unspent,
  spent,
  128 - unspent - spent,
  caps,
  pinState,
  4,
  3,
  0,
  record,
  ...uint32(day),
  owner,
  ...uint32(now),
  ...uint32(now - 3600),
  ...uint32(21),
  0,
  ...uint32(payment),
  ...uint32(allowance),
  ...uint32(13),
]
const INFO_BODY = infoBody()
const BALANCE_BODY = [0, 0, 0x01, 0xf4]
const PUBKEY = [0x02, ...Array.from({ length: 32 }, (_, i) => i + 1)]

/**
 * An 82-byte slot as GET_PROOF returns it (spec/APDU.md "Proof Slot Layout"):
 * status, keyset, amount, nonce, C, date. `nonceByte` fills the nonce, so
 * slots can be told apart.
 */
const proofSlot = (
  status: number,
  amount: number,
  {
    keyset = KEYSET,
    nonceByte = 0xab,
    date = 0,
  }: { keyset?: number[]; nonceByte?: number; date?: number } = {},
) => [
  status,
  ...keyset,
  ...uint32(amount),
  ...new Array(32).fill(nonceByte),
  0x02,
  ...new Array(32).fill(0xcd),
  ...uint32(date),
]

/** secp256k1's generator, compressed: a C that is a point. */
const ON_CURVE_C = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
/** An x past the field order: no point has it. */
const OFF_CURVE_C = "02" + "ff".repeat(32)

const ok = (data: number[]) => [...data, 0x90, 0x00]
const hex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")

/** GET_CARD's answer: format 4, the record set, unit sat, a limit, the clock bookkeeping, the mint. */
const cardBody = (mint = "https://forge.flashapp.me", { rolls = 2, budget = 0 } = {}) => [
  4,
  1,
  0,
  ...uint32(5000),
  ...new Array(33).fill(0),
  0x17,
  0x02,
  0x1e,
  0xc5,
  ...new Array(32).fill(0x11),
  rolls,
  budget,
  1,
  ...new Array(26).fill(0),
  mint.length,
  ...Array.from(mint, (c) => c.charCodeAt(0)),
  0,
  0,
  0,
]

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

/** The fake card's AUTH, answered with this card's key: the 16 reader bytes in, 80 bytes out. */
const CARD_KEY = "07".repeat(32)
const cardPubkeyBytes = Array.from(secp256k1.getPublicKey(CARD_KEY, true))

describe("buildApdu", () => {
  it("builds a bare command with no data and no Le", () => {
    expect(buildApdu(INS.GET_INFO)).toEqual([0xb0, 0x01, 0x00, 0x00])
  })

  it("appends Le when given", () => {
    expect(buildApdu(INS.GET_BALANCE, { le: 0x04 })).toEqual(GET_BALANCE)
  })

  it("prefixes data with its length and puts the slot in P1", () => {
    expect(buildApdu(INS.LOAD_PROOF, { p1: 1, data: [0xaa, 0xbb], le: 0x02 })).toEqual([
      0xb0, 0x30, 0x01, 0x00, 0x02, 0xaa, 0xbb, 0x02,
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

  it("names only the 2.0 commands: SPEND_PROOF and CLEAR_PIN are gone with 0.x", () => {
    expect(INS).not.toHaveProperty("SPEND_PROOF")
    expect(INS).not.toHaveProperty("CLEAR_PIN")
    expect(INS).toMatchObject({
      AUTH: 0x15,
      GET_CARD: 0x16,
      GET_PIECES: 0x17,
      GET_DLEQ: 0x1a,
      SET_CARD: 0x32,
      SET_LIMIT: 0x34,
      SET_HEADER: 0x36,
      TELL_TIME: 0x37,
      SET_OWNER: 0x43,
      GET_NONCE: 0x44,
      ALLOW_LOAD: 0x45,
      REFRESH: 0x53,
    })
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
      parseResponse([0x69, 0x82], "LOAD_PROOF")
      throw new Error("did not throw")
    } catch (error) {
      expect(error).toBeInstanceOf(CardError)
      expect((error as CardError).sw).toBe(0x6982)
      expect((error as CardError).message).toBe(
        "LOAD_PROOF failed: PIN or owner's grant required (0x6982)",
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
    [0x6982, "PIN or owner's grant required"],
    [0x6983, "PIN blocked"],
    [0x6984, "no PIN set"],
    [0x6985, "conditions not satisfied"],
    [0x6986, "card is locked against writes"],
    [0x6a82, "applet not found"],
    [0x6a84, "no free slot"],
    [0x6a88, "slot is empty"],
    [0x6a8c, "no card record"],
    [0x6a8d, "card holds value"],
    [0x6a90, "no owner"],
    [0x6a91, "owner's proof refused"],
    [0x6a93, "too little work in the block header"],
    [0x6a94, "already on the card"],
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
  it('names the 2.0 package AID, "CASHUCARD" after F0, and the instance AID with 01', () => {
    expect(CASHU_AID).toEqual([
      0xf0, 0x43, 0x41, 0x53, 0x48, 0x55, 0x43, 0x41, 0x52, 0x44,
    ])
    expect(CASHU_APPLET_AID).toEqual([...CASHU_AID, 0x01])
    expect(LEGACY_CASHU_AID).toEqual([0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02])
    expect(FOXY_LEGACY_AID).toEqual([
      0xf0, 0x46, 0x4f, 0x58, 0x59, 0x43, 0x41, 0x52, 0x44,
    ])
  })

  it("builds the applet-AID SELECT by default and the package-AID one on request", () => {
    expect(buildSelectApdu()).toEqual(SELECT_APPLET)
    expect(buildSelectApdu(CASHU_APPLET_AID)).toEqual(SELECT_APPLET)
    expect(buildSelectApdu(CASHU_AID)).toEqual(SELECT_PACKAGE)
  })

  // ENG-681: on a card installed opener first, the package AID (a partial
  // name) reaches the opener, so the full applet AID goes first, as Foxy's
  // wallet sends it.
  it("selects with the full applet AID first and returns the version body, 02 00, sending nothing else", async () => {
    const card = scriptedCard([[SELECT_APPLET, ok([2, 0])]])
    await expect(selectApplet(card.transceive)).resolves.toEqual([2, 0])
    expect(card.sent).toEqual([SELECT_APPLET])
  })

  it("falls back to the package AID when the applet AID is refused", async () => {
    const card = scriptedCard([
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_PACKAGE, ok([2, 0])],
    ])
    await expect(selectApplet(card.transceive)).resolves.toEqual([2, 0])
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
  })

  const otherRefusals: [string, number[]][] = [
    ["6999 (the applet's select() failed)", SW_APPLET_SELECT_FAILED],
    ["6283 (a locked instance)", SW_LOCKED],
    ["6F00", SW_UNKNOWN],
  ]
  otherRefusals.forEach(([label, sw]) => {
    it(`falls back to the package AID on ${label}, not only on 6A82`, async () => {
      const card = scriptedCard([
        [SELECT_APPLET, sw],
        [SELECT_PACKAGE, ok([2, 0])],
      ])
      await expect(selectApplet(card.transceive)).resolves.toEqual([2, 0])
      expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
    })
  })

  it("treats a response too short to carry a status word as a refusal", async () => {
    const card = scriptedCard([
      [SELECT_APPLET, [0x90]],
      [SELECT_PACKAGE, ok([2, 0])],
    ])
    await expect(selectApplet(card.transceive)).resolves.toEqual([2, 0])
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
  })

  it("a 0.x card (its withdrawn AID answers) needs an update, and nothing further is sent", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_LEGACY, ok([0, 6])],
    ])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(CardNeedsUpdateError)
    expect(error.found).toBe("0.x")
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE, SELECT_LEGACY])
  })

  it("a Foxy 1.x card needs an update too, and nothing further is sent", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_LEGACY, SW_FILE_NOT_FOUND],
      [SELECT_FOXY, ok([1, 20])],
    ])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      name: "CardNeedsUpdateError",
      found: "1.x",
    })
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE, SELECT_LEGACY, SELECT_FOXY])
  })

  it("a card under the full applet AID reporting an older major version needs an update, and the package AID is not tried", async () => {
    const card = scriptedCard([[SELECT_APPLET, ok([1, 20])]])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      name: "CardNeedsUpdateError",
      found: "older",
    })
    expect(card.sent).toEqual([SELECT_APPLET])
  })

  // cashu-javacard tools/cardsim/README.md, Old cards: any SELECT answer that
  // is not 02xx 9000 is "This card needs an update" (jCardSim says 6E00 or
  // 6999 where a real card's runtime says 6A82).
  const neitherSelects: [string, number[], number[]][] = [
    ["6999 to both forms", SW_APPLET_SELECT_FAILED, SW_APPLET_SELECT_FAILED],
    ["6E00 to both forms", [0x6e, 0x00], [0x6e, 0x00]],
    [
      "6999 to the package AID and 6A82 to the instance AID",
      SW_APPLET_SELECT_FAILED,
      SW_FILE_NOT_FOUND,
    ],
    [
      "6A82 to the package AID and 6283 (locked) to the instance AID",
      SW_FILE_NOT_FOUND,
      SW_LOCKED,
    ],
    [
      "6A82 to the package AID and 6A81 to the instance AID",
      SW_FILE_NOT_FOUND,
      [0x6a, 0x81],
    ],
    ["a response too short to carry a status word", [0x90], [0x90]],
  ]
  neitherSelects.forEach(([label, packageSw, appletSw]) => {
    it(`a card that answers the 2.0 SELECT with ${label} needs an update, and nothing further is sent`, async () => {
      const card = scriptedCard([
        [SELECT_PACKAGE, packageSw],
        [SELECT_APPLET, appletSw],
      ])
      const error = await selectApplet(card.transceive).catch((e) => e)
      expect(error).toBeInstanceOf(CardNeedsUpdateError)
      expect(error.found).toBe("refused")
      // Not read as another kind of card: no withdrawn AID, no NDEF.
      expect(error).not.toBeInstanceOf(AppletNotSelectedError)
      expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
    })
  })

  // ENG-681's error string: a 9000 to the full applet AID whose body is too
  // short is a protocol error, with no fallback to the package AID or to the
  // withdrawn AIDs.
  it("a 9000 to the full applet AID with no version body is a protocol error, and nothing further is sent", async () => {
    const card = scriptedCard([[SELECT_APPLET, ok([])]])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(CardProtocolError)
    expect(error.message).toMatch(/2-byte version/)
    expect(error).not.toBeInstanceOf(AppletNotSelectedError)
    expect(error).not.toBeInstanceOf(CardNeedsUpdateError)
    expect(card.sent).toEqual([SELECT_APPLET])
  })

  it("a card under the full applet AID reporting a newer major version needs an update too: this app speaks 2.x only", async () => {
    const card = scriptedCard([[SELECT_APPLET, ok([3, 0])]])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      name: "CardNeedsUpdateError",
      found: "newer",
    })
    expect(card.sent).toEqual([SELECT_APPLET])
  })

  // ENG-681: the package AID is a partial name. A 9000 to it with no 02 xx
  // version is not the applet (a J3R180 with the opener installed first
  // answers it with a bare 9000), so it is neither "needs an update" nor a
  // refusal: the read goes on to the withdrawn AIDs as after 6A82.
  const notTheApplet: [string, number[]][] = [
    ["no body (the opener)", []],
    ["an older version", [1, 20]],
    ["a newer version", [3, 0]],
    ["a version three bytes long", [2, 0, 0]],
    ["a single byte", [2]],
  ]
  notTheApplet.forEach(([label, body]) => {
    it(`a 9000 to the package AID with ${label} falls through after the applet AID said 6A82: not a Cashu card`, async () => {
      const card = scriptedCard([
        [SELECT_APPLET, SW_FILE_NOT_FOUND],
        [SELECT_PACKAGE, ok(body)],
        [SELECT_LEGACY, SW_FILE_NOT_FOUND],
        [SELECT_FOXY, SW_FILE_NOT_FOUND],
      ])
      const error = await selectApplet(card.transceive).catch((e) => e)
      expect(error).toBeInstanceOf(AppletNotSelectedError)
      expect(error).not.toBeInstanceOf(CardNeedsUpdateError)
      expect(error).toMatchObject({ sw: 0x6a82, packageSw: 0x9000, appletSw: 0x6a82 })
      expect(card.sent).toEqual([
        SELECT_APPLET,
        SELECT_PACKAGE,
        SELECT_LEGACY,
        SELECT_FOXY,
      ])
    })
  })

  it("names the applet AID first and a bare 9000 to the package AID as not the applet in the message", async () => {
    const card = scriptedCard([
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_PACKAGE, ok([])],
      [SELECT_LEGACY, SW_FILE_NOT_FOUND],
      [SELECT_FOXY, SW_FILE_NOT_FOUND],
    ])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(AppletNotSelectedError)
    expect(error.message).toBe(
      "SELECT failed: applet AID 6A82, package AID 9000 (no 02xx version)",
    )
  })

  it("a bare 9000 to the package AID still lets a withdrawn AID say the card needs an update", async () => {
    const card = scriptedCard([
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_PACKAGE, ok([])],
      [SELECT_LEGACY, ok([0, 6])],
    ])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      name: "CardNeedsUpdateError",
      found: "0.x",
    })
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE, SELECT_LEGACY])
  })

  it("a bare 9000 to the package AID after the applet AID refused with 6999 is still a refusal: needs an update", async () => {
    const card = scriptedCard([
      [SELECT_APPLET, SW_APPLET_SELECT_FAILED],
      [SELECT_PACKAGE, ok([])],
    ])
    await expect(selectApplet(card.transceive)).rejects.toMatchObject({
      name: "CardNeedsUpdateError",
      found: "refused",
    })
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
  })

  it("selects a 2.0 card installed opener first (the package AID reaches the opener) with the full applet AID alone", async () => {
    const card = createFakeCard(MAX_SLOTS, { opener: true })
    await expect(selectApplet(card.transceive)).resolves.toEqual([2, 0])
    expect(card.transceive.mock.calls.map(([apdu]) => apdu)).toEqual([SELECT_APPLET])
    // The applet holds the selection: GET_INFO answers, not the opener's 6D00.
    await expect(getInfo(card.transceive)).resolves.toMatchObject({ version: "2.0" })
  })

  it("the fake opener-first card answers as the J3R180 did: a bare 9000 to the package AID and 6D00 to what follows", async () => {
    const card = createFakeCard(MAX_SLOTS, { opener: true })
    await expect(card.transceive(SELECT_PACKAGE)).resolves.toEqual([0x90, 0x00])
    await expect(card.transceive(GET_INFO)).resolves.toEqual([0x6d, 0x00])
    await expect(card.transceive(SELECT_APPLET)).resolves.toEqual(ok([2, 0]))
    await expect(getInfo(card.transceive)).resolves.toMatchObject({ version: "2.0" })
  })

  it("rejects with both 2.0 status words when no Cashu AID selects and both 2.0 forms said 6A82", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_LEGACY, SW_APPLET_SELECT_FAILED],
      [SELECT_FOXY, SW_FILE_NOT_FOUND],
    ])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(AppletNotSelectedError)
    // Still a CardError, carrying the last 2.0 word the card said.
    expect(error).toBeInstanceOf(CardError)
    expect(error).toMatchObject({ sw: 0x6a82, packageSw: 0x6a82, appletSw: 0x6a82 })
    expect(error.message).toBe("SELECT failed: applet AID 6A82, package AID 6A82")
  })

  it("reads 6A82 to both 2.0 forms, and to every withdrawn AID, as not a Cashu card", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_LEGACY, SW_FILE_NOT_FOUND],
      [SELECT_FOXY, SW_FILE_NOT_FOUND],
    ])
    const error = await selectApplet(card.transceive).catch((e) => e)
    expect(error).toBeInstanceOf(AppletNotSelectedError)
    expect(error).not.toBeInstanceOf(CardNeedsUpdateError)
    expect(error).toMatchObject({ sw: 0x6a82, packageSw: 0x6a82, appletSw: 0x6a82 })
  })

  // CoreNFC connects only to a tag answering an AID the app lists, and tries
  // them in the listed order when it finds one; the full applet AID goes
  // ahead of the package AID, which an opener-first card answers instead.
  it("lists every AID selectApplet sends in Info.plist, the full applet AID ahead of the package AID", () => {
    const plist = readFileSync(join(__dirname, "../../ios/LNFlash/Info.plist"), "utf8")
    const key = "com.apple.developer.nfc.readersession.iso7816.select-identifiers"
    const array = plist.slice(plist.indexOf(key)).match(/<array>([\s\S]*?)<\/array>/)
    const listed = Array.from(
      (array?.[1] ?? "").matchAll(/<string>([0-9A-F]+)<\/string>/g),
      (match) => match[1],
    )
    const hexOf = (aid: number[]) => toHex(aid).toUpperCase()
    ;[CASHU_APPLET_AID, CASHU_AID, LEGACY_CASHU_AID, FOXY_LEGACY_AID].forEach((aid) =>
      expect(listed).toContain(hexOf(aid)),
    )
    expect(listed.indexOf(hexOf(CASHU_APPLET_AID))).toBeLessThan(
      listed.indexOf(hexOf(CASHU_AID)),
    )
    // The NDEF application AIDs a BoltCard answers stay listed.
    expect(listed).toEqual(expect.arrayContaining(["D2760000850100", "D2760000850101"]))
  })

  it("rethrows a transport failure instead of retrying on a dead handle", async () => {
    const sent: number[][] = []
    const transceive = async (bytes: number[]) => {
      sent.push(bytes)
      throw new Error("Tag was lost")
    }
    await expect(selectApplet(transceive)).rejects.toThrow("Tag was lost")
    expect(sent).toEqual([SELECT_APPLET])
  })
})

describe("GET_INFO", () => {
  it("decodes the 42-byte answer: counts, PIN state, owner, clock, limits and the sealed bit", () => {
    expect(parseInfo(INFO_BODY)).toEqual({
      version: "2.0",
      major: 2,
      minor: 0,
      maxSlots: 128,
      unspent: 1,
      spent: 7,
      empty: 120,
      secp256k1Native: true,
      schnorr: true,
      sealed: true,
      pinState: "set",
      format: 4,
      tries: 3,
      locked: false,
      recordSet: true,
      dailyLimit: 5000,
      hasOwner: true,
      now: 1791814824,
      windowStart: 1791814824 - 3600,
      spentToday: 21,
      changeGrant: false,
      paymentLimit: 0,
      allowance: 250,
      nopinSpent: 13,
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
      expect(parseInfo(infoBody({ pinState: byte })).pinState).toBe(state)
    })
  })

  it("reads capability bit 7 alone as the sealed PIN", () => {
    expect(parseInfo(infoBody({ caps: 0x7f })).sealed).toBe(false)
    expect(parseInfo(infoBody({ caps: 0x80 })).sealed).toBe(true)
  })

  it("reads an ownerless card with no record as one", () => {
    expect(parseInfo(infoBody({ owner: 0, record: 0 }))).toMatchObject({
      hasOwner: false,
      recordSet: false,
    })
  })

  // A 0.x card's 8 bytes, the 30 of P1 = 0 and the 43 of P1 = 2 are not this answer.
  const wrongLengths = [8, 30, 41, 43]
  wrongLengths.forEach((length) => {
    it(`refuses an answer of ${length} bytes rather than misread it`, () => {
      expect(() => parseInfo(new Array(length).fill(0))).toThrow(CardProtocolError)
      expect(() => parseInfo(new Array(length).fill(0))).toThrow(/expected 42 bytes/)
    })
  })

  it("sends GET_INFO with P1 = 1", async () => {
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

describe("AUTH", () => {
  const reader = Array.from({ length: 16 }, (_, i) => 0xa0 + i)
  const cardNonce = Array.from({ length: 16 }, (_, i) => 0x10 + i)
  const signed = (key: string, nonce = cardNonce) =>
    Array.from(schnorr.sign(authMessage(reader, nonce, cardPubkeyBytes), key))

  it("sends 16 bytes of the reader's with Le 0x50, and takes the card key's signature over both nonces and the key", async () => {
    const card = scriptedCard([
      [
        [0xb0, 0x15, 0x00, 0x00, 0x10, ...reader, 0x50],
        ok([...cardNonce, ...signed(CARD_KEY)]),
      ],
    ])
    await expect(
      authenticateCard(card.transceive, cardPubkeyBytes, reader),
    ).resolves.toBeUndefined()
  })

  it('hashes T ‖ T ‖ reader ‖ card ‖ key, T = SHA-256("CashuCard/auth"): a BIP-340 tagged hash', () => {
    // The tagged hash noble computes for BIP-340 is the same construction.
    const tagged = schnorr.utils.taggedHash(
      "CashuCard/auth",
      Uint8Array.from([...reader, ...cardNonce, ...cardPubkeyBytes]),
    )
    expect(toHex(authMessage(reader, cardNonce, cardPubkeyBytes))).toBe(toHex(tagged))
  })

  it("refuses a signature by another key", async () => {
    const card = echoCard(ok([...cardNonce, ...signed("09".repeat(32))]))
    await expect(
      authenticateCard(card.transceive, cardPubkeyBytes, reader),
    ).rejects.toBeInstanceOf(CardAuthError)
  })

  it("refuses a good signature over other nonces: an answer recorded from another tap", async () => {
    const card = echoCard(ok([...cardNonce, ...signed(CARD_KEY, new Array(16).fill(0))]))
    await expect(
      authenticateCard(card.transceive, cardPubkeyBytes, reader),
    ).rejects.toBeInstanceOf(CardAuthError)
  })

  it("refuses a short answer and a refusal alike, as CardAuthError", async () => {
    await expect(
      authenticateCard(echoCard(ok(cardNonce)).transceive, cardPubkeyBytes, reader),
    ).rejects.toBeInstanceOf(CardAuthError)
    await expect(
      authenticateCard(echoCard([0x6d, 0x00]).transceive, cardPubkeyBytes, reader),
    ).rejects.toBeInstanceOf(CardAuthError)
  })

  it("draws a fresh reader nonce each time", async () => {
    const card = createFakeCard()
    await authenticateCard(card.transceive, Array.from(Buffer.from(card.pubkey, "hex")))
    await authenticateCard(card.transceive, Array.from(Buffer.from(card.pubkey, "hex")))
    const [first, second] = card.transceive.mock.calls.map(([apdu]) => apdu.slice(5, 21))
    expect(first).not.toEqual(second)
  })

  it("passes against a card that holds its key, and fails against one that does not", async () => {
    const good = createFakeCard()
    const key = Array.from(Buffer.from(good.pubkey, "hex"))
    await expect(authenticateCard(good.transceive, key)).resolves.toBeUndefined()
    const bad = createFakeCard(MAX_SLOTS, { badAuth: true })
    await expect(authenticateCard(bad.transceive, key)).rejects.toBeInstanceOf(
      CardAuthError,
    )
  })
})

describe("VERIFY_PIN and SET_PIN, clear (a card that does not take its PIN sealed)", () => {
  const clear = { sealed: false, cardPubkey: hex(PUBKEY) }

  it("VERIFY_PIN sends the PIN as ASCII bytes with Lc, no Le, P1 = 0", async () => {
    const card = scriptedCard([
      [[0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34], ok([])],
    ])
    await expect(verifyCardPin(card.transceive, "1234", clear)).resolves.toBeUndefined()
  })

  it("sends an eight-digit PIN, the applet's longest", async () => {
    const card = scriptedCard([
      [
        [0xb0, 0x40, 0x00, 0x00, 0x08, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38],
        ok([]),
      ],
    ])
    await expect(
      verifyCardPin(card.transceive, "12345678", clear),
    ).resolves.toBeUndefined()
  })

  it("SET_PIN sends the PIN as ASCII bytes with Lc, no Le, P1 = 0", async () => {
    const card = scriptedCard([
      [[0xb0, 0x41, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34], ok([])],
    ])
    await expect(setCardPin(card.transceive, "1234", clear)).resolves.toBeUndefined()
  })

  it("surfaces a wrong PIN with the tries remaining", async () => {
    const card = echoCard([0x63, 0xc2])
    await expect(verifyCardPin(card.transceive, "0000", clear)).rejects.toThrow(
      "VERIFY_PIN failed: wrong PIN, 2 tries left (0x63C2)",
    )
  })

  it("surfaces a blocked PIN", async () => {
    const card = echoCard([0x69, 0x83])
    await expect(verifyCardPin(card.transceive, "1234", clear)).rejects.toMatchObject({
      sw: 0x6983,
    })
  })

  it("surfaces an owned card's refusal of SET_PIN without the owner's grant", async () => {
    const card = echoCard([0x6a, 0x91])
    await expect(setCardPin(card.transceive, "1234", clear)).rejects.toMatchObject({
      sw: 0x6a91,
    })
  })

  // Every one of these would reach the card as the wrong bytes (or a length
  // the applet refuses) and spend one of its three tries.
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
    it(`refuses ${label} before anything reaches the card, sealed or not`, async () => {
      const card = echoCard(ok([]))
      await expect(verifyCardPin(card.transceive, pin, clear)).rejects.toThrow(
        CardProtocolError,
      )
      await expect(
        setCardPin(card.transceive, pin, { ...clear, sealed: true }),
      ).rejects.toThrow(CardProtocolError)
      expect(card.sent).toEqual([])
    })
  })

  it("never echoes the PIN in the refusal", async () => {
    const card = echoCard(ok([]))
    const error = await verifyCardPin(card.transceive, "98x7", clear).catch((e) => e)
    expect(error.message).not.toContain("98x7")
  })

  it("isValidCardPin accepts exactly 4 to 8 ASCII digits", () => {
    expect(["1234", "00000000", "12345"].every(isValidCardPin)).toBe(true)
    expect(["123", "123456789", "12a4", "١٢٣٤"].some(isValidCardPin)).toBe(false)
  })
})

describe("the PIN, sealed (a card whose capability bit 7 is set)", () => {
  it("VERIFY_PIN asks the card for its PIN key first (GET_NONCE P1 = 1), then sends P1 = 1 and an envelope with no PIN in it", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", sealed: true })
    await verifyCardPin(card.transceive, "1234", {
      sealed: true,
      cardPubkey: card.pubkey,
    })
    const [nonce, verify] = card.transceive.mock.calls.map(([apdu]) => apdu)
    expect(nonce).toEqual([0xb0, 0x44, 0x01, 0x00, 0x71])
    expect(verify.slice(0, 4)).toEqual([0xb0, 0x40, 0x01, 0x00])
    // The phone's key (65), a 9-byte PIN block under the keystream, the tag (16).
    expect(verify[4]).toBe(65 + 9 + 16)
    expect(hex(verify)).not.toContain("31323334")
    expect(card.verified()).toBe(true)
  })

  it("a wrong PIN sealed costs a try, as one in the clear does", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", sealed: true })
    await expect(
      verifyCardPin(card.transceive, "9999", { sealed: true, cardPubkey: card.pubkey }),
    ).rejects.toMatchObject({ sw: 0x63c2 })
    expect(card.triesLeft()).toBe(2)
  })

  it("SET_PIN sealed sets the PIN the card then verifies", async () => {
    const card = createFakeCard(MAX_SLOTS, { owner: null, sealed: true })
    const form = { sealed: true, cardPubkey: card.pubkey }
    await setCardPin(card.transceive, "24680", form)
    expect(card.pin()).toBe("24680")
    await verifyCardPin(card.transceive, "24680", form)
    expect(card.verified()).toBe(true)
  })

  it("sends nothing sealed to a PIN key the card key did not sign", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", sealed: true })
    // Another card's key: the PIN key's signature does not verify against it.
    const other = toHex(secp256k1.getPublicKey("09".repeat(32), true))
    await expect(
      verifyCardPin(card.transceive, "1234", { sealed: true, cardPubkey: other }),
    ).rejects.toThrow(/not signed by the card/)
    expect(card.ins()).toEqual([0x44])
  })

  it("sends the PIN clear only to a card that does not take it sealed", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", sealed: false })
    await verifyCardPin(card.transceive, "1234", {
      sealed: false,
      cardPubkey: card.pubkey,
    })
    expect(card.transceive.mock.calls.map(([apdu]) => apdu)).toEqual([
      [0xb0, 0x40, 0x00, 0x00, 0x04, 0x31, 0x32, 0x33, 0x34],
    ])
  })
})

describe("CHANGE_PIN, the owner's form", () => {
  it("clear: GET_NONCE, then proof length ‖ proof over the new PIN ‖ the new PIN, with no old PIN", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234" })
    await changeCardPin(card.transceive, "5678", {
      sealed: false,
      cardPubkey: card.pubkey,
      sign: ownerSigner(FAKE_OWNER_KEY),
    })
    const [nonce, change] = card.transceive.mock.calls.map(([apdu]) => apdu)
    expect(nonce).toEqual([0xb0, 0x44, 0x00, 0x00, 0x10])
    expect(change.slice(0, 4)).toEqual([0xb0, 0x42, 0x00, 0x00])
    const proofLength = change[5]
    expect(change.slice(6 + proofLength)).toEqual([0x35, 0x36, 0x37, 0x38])
    expect(card.pin()).toBe("5678")
  })

  it("sealed: the proof over the PIN and the sealing nonce, inside the envelope, unblocks a blocked PIN", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", sealed: true })
    const form = { sealed: true, cardPubkey: card.pubkey }
    for (const sw of [0x63c2, 0x63c1, 0x6983]) {
      await expect(verifyCardPin(card.transceive, "0000", form)).rejects.toMatchObject({
        sw,
      })
    }
    expect((await getInfo(card.transceive)).pinState).toBe("blocked")
    await changeCardPin(card.transceive, "8642", {
      ...form,
      sign: ownerSigner(FAKE_OWNER_KEY),
    })
    const change = card.transceive.mock.calls
      .map(([apdu]) => apdu)
      .find((a) => a[1] === 0x42)
    expect(change?.slice(0, 4)).toEqual([0xb0, 0x42, 0x01, 0x00])
    expect(hex(change ?? [])).not.toContain("38363432")
    expect(card.pin()).toBe("8642")
    expect((await getInfo(card.transceive)).pinState).toBe("set")
    expect(card.triesLeft()).toBe(3)
  })

  it("a phone that is not the owner is refused (6A91), and the PIN stays", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234" })
    await expect(
      changeCardPin(card.transceive, "5678", {
        sealed: false,
        cardPubkey: card.pubkey,
        sign: ownerSigner("11".repeat(32)),
      }),
    ).rejects.toMatchObject({ sw: 0x6a91 })
    expect(card.pin()).toBe("1234")
  })

  it("refuses an invalid new PIN before anything reaches the card", async () => {
    const card = echoCard(ok([]))
    await expect(
      changeCardPin(card.transceive, "56", {
        sealed: false,
        cardPubkey: hex(PUBKEY),
        sign: ownerSigner(FAKE_OWNER_KEY),
      }),
    ).rejects.toThrow(CardProtocolError)
    expect(card.sent).toEqual([])
  })
})

describe("LOAD_PROOF", () => {
  const piece = {
    keysetId: KEYSET_HEX,
    amount: 1024,
    nonce: "ab".repeat(32),
    C: "02" + "cd".repeat(32),
  }
  const dleq = { e: "e1".repeat(32), s: "5a".repeat(32), r: "77".repeat(32) }
  const pieceBytes = [
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
    0x00,
    0x00,
    0x00,
    0x00,
  ]

  it("sends 81 bytes: keyset as 8 RAW bytes, amount big-endian, nonce, C, the date 0, with Le=1", async () => {
    const card = scriptedCard([
      [[0xb0, 0x30, 0x00, 0x00, 81, ...pieceBytes, 0x01], ok([5])],
    ])
    await expect(loadProof(card.transceive, piece)).resolves.toEqual({
      slot: 5,
      dleqKept: false,
    })
  })

  it("with the mint's DLEQ proof: P1 = 1, 177 bytes (the piece, then e ‖ s ‖ r), Le 2, one piece to a command", async () => {
    const card = scriptedCard([
      [
        [
          0xb0,
          0x30,
          0x01,
          0x00,
          177,
          ...pieceBytes,
          ...new Array(32).fill(0xe1),
          ...new Array(32).fill(0x5a),
          ...new Array(32).fill(0x77),
          0x02,
        ],
        ok([9, 1]),
      ],
    ])
    await expect(loadProof(card.transceive, { ...piece, dleq })).resolves.toEqual({
      slot: 9,
      dleqKept: true,
    })
  })

  it("reads a card with no room for proofs: the slot, and 00", async () => {
    const card = echoCard(ok([3, 0]))
    await expect(loadProof(card.transceive, { ...piece, dleq })).resolves.toEqual({
      slot: 3,
      dleqKept: false,
    })
  })

  it("6A94, a piece already on the card, is not an error: an earlier load landed", async () => {
    const card = echoCard([0x6a, 0x94])
    await expect(loadProof(card.transceive, { ...piece, dleq })).resolves.toEqual({
      alreadyOnCard: true,
    })
    expect(card.sent).toHaveLength(1)
  })

  it("against the 2.0 card: a second load of the same piece answers alreadyOnCard, and the card holds it once", async () => {
    const card = createFakeCard()
    const first = await loadProof(card.transceive, { ...piece, C: ON_CURVE_C, dleq })
    expect(first).toEqual({ slot: 0, dleqKept: true })
    await expect(
      loadProof(card.transceive, { ...piece, C: ON_CURVE_C, dleq }),
    ).resolves.toEqual({ alreadyOnCard: true })
    expect(card.unspentNonces()).toEqual(["ab".repeat(32)])
    expect(card.dleqs.get(0)).toHaveLength(96)
  })

  it("writes the largest amount the 4-byte field holds", async () => {
    const card = echoCard(ok([0]))
    await loadProof(card.transceive, { ...piece, amount: 0xffffffff })
    expect(card.sent[0].slice(13, 17)).toEqual([0xff, 0xff, 0xff, 0xff])
  })

  it("refuses a keyset id that is not 16 hex chars — ASCII-encoding stored half an id once", async () => {
    const card = echoCard(ok([0]))
    await expect(
      loadProof(card.transceive, { ...piece, keysetId: "0059534c" }),
    ).rejects.toThrow(/keyset id must be 16 hex chars/)
    expect(card.sent).toEqual([])
  })

  // `>>>` wraps silently, and parseInt of a non-hex pair is NaN, which the
  // bridge sends as 0x00: each would store a proof the mint rejects.
  const badPieces: [string, Record<string, unknown>][] = [
    ["a zero amount", { amount: 0 }],
    ["a negative amount", { amount: -8 }],
    ["a fractional amount", { amount: 1.5 }],
    ["an amount past 2^32 - 1", { amount: 2 ** 32 }],
    ["a NaN amount", { amount: NaN }],
    ["a keyset id with a non-hex digit", { keysetId: "0059534ce0bfa19z" }],
    ["a nonce with non-hex digits", { nonce: "zz".repeat(32) }],
    ["a wrong-length nonce", { nonce: "ab" }],
    ["a C with a non-hex digit", { C: "0g" + "cd".repeat(32) }],
    ["an odd-length C", { C: "02" + "cd".repeat(32) + "e" }],
    ["a date past 2^32 - 1", { date: 2 ** 32 }],
    ["a short DLEQ e", { dleq: { ...dleq, e: "e1" } }],
    ["a DLEQ r with non-hex digits", { dleq: { ...dleq, r: "zz".repeat(32) } }],
  ]
  badPieces.forEach(([label, override]) => {
    it(`refuses ${label} before any APDU is built`, async () => {
      const card = echoCard(ok([0]))
      await expect(
        loadProof(card.transceive, { ...piece, ...override } as typeof piece),
      ).rejects.toThrow(CardProtocolError)
      expect(card.sent).toEqual([])
    })
  })

  it("surfaces a full card, and an ownerless one", async () => {
    await expect(loadProof(echoCard([0x6a, 0x84]).transceive, piece)).rejects.toThrow(
      /no free slot/,
    )
    await expect(
      loadProof(echoCard([0x6a, 0x90]).transceive, piece),
    ).rejects.toMatchObject({ sw: 0x6a90 })
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

  it("reads a 2.0 card's 128 slots in one command, Le 0x80", async () => {
    const card = scriptedCard([
      [[0xb0, 0x14, 0x00, 0x00, 0x80], ok(new Array(128).fill(0))],
    ])
    await expect(getSlotStatuses(card.transceive, 128)).resolves.toHaveLength(128)
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
  it("decodes all six fields of the 82-byte slot, keyset id from raw bytes, the date last", async () => {
    const card = scriptedCard([[getProofApdu(3), ok(proofSlot(1, 1024, { date: 77 }))]])
    await expect(getProof(card.transceive, 3)).resolves.toEqual({
      slot: 3,
      status: "unspent",
      keysetId: KEYSET_HEX,
      amount: 1024,
      nonce: "ab".repeat(32),
      C: "02" + "cd".repeat(32),
      date: 77,
    })
  })

  it("asks for Le 0x52, the slot's 82 bytes", () => {
    expect(PROOF_SIZE).toBe(82)
    expect(getProofApdu(0)[4]).toBe(0x52)
  })

  it("reports a spent slot as spent — spent slots stay readable", async () => {
    const card = echoCard(ok(proofSlot(2, 1024)))
    await expect(getProof(card.transceive, 0)).resolves.toMatchObject({ status: "spent" })
  })

  it("rejects a short slot rather than reading undefined bytes, a 0.x slot of 78 among them", async () => {
    await expect(
      getProof(echoCard(ok(proofSlot(1, 1024).slice(0, 78))).transceive, 0),
    ).rejects.toThrow(CardProtocolError)
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

describe("GET_PIECES", () => {
  it("decodes a page: where it ends, each unspent slot whole, each spent one by number", async () => {
    const unspent = proofSlot(1, 16)
    const card = scriptedCard([
      [
        getPiecesApdu(0),
        ok([
          128,
          0,
          ...unspent.slice(1),
          0x81,
          5,
          ...proofSlot(1, 8, { nonceByte: 5 }).slice(1),
        ]),
      ],
    ])
    await expect(getPieces(card.transceive, 0)).resolves.toEqual({
      next: 128,
      unspent: [
        {
          slot: 0,
          status: "unspent",
          keysetId: KEYSET_HEX,
          amount: 16,
          nonce: "ab".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
        {
          slot: 5,
          status: "unspent",
          keysetId: KEYSET_HEX,
          amount: 8,
          nonce: "05".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
      ],
      spent: [1],
    })
  })

  it("refuses a page that does not move forward, or names a slot outside it", async () => {
    await expect(getPieces(echoCard(ok([3])).transceive, 3)).rejects.toThrow(
      CardProtocolError,
    )
    await expect(getPieces(echoCard(ok([10, 0x8c])).transceive, 0)).rejects.toThrow(
      CardProtocolError,
    )
    await expect(
      getPieces(echoCard(ok([10, 2, ...new Array(40).fill(0)])).transceive, 0),
    ).rejects.toThrow(/cut short/)
  })

  it("reads all 128 places of a full card page by page, three pieces to a page, and every one of them", async () => {
    const card = createFakeCard()
    for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
      card.slots[slot] = proofSlot(1, 1, { nonceByte: slot })
    }
    const read = await readCardSlots(card.transceive)
    expect(read.keysets).toEqual([{ keysetId: KEYSET_HEX, amount: 128 }])
    expect(read.spentSlots).toEqual([])
    // 128 pieces at three to a page: 43 GET_PIECES, and no GET_PROOF.
    expect(card.ins()).toEqual(new Array(43).fill(INS.GET_PIECES))
  })
})

describe("readCardSlots", () => {
  it("reads the unspent pieces by page, then each spent slot by GET_PROOF, and returns the value per keyset beside the spent slots", async () => {
    const card = createFakeCard()
    card.slots[0] = proofSlot(1, 16)
    card.slots[1] = proofSlot(2, 4, { nonceByte: 0x11 })
    card.slots[3] = proofSlot(1, 8, { nonceByte: 0x33 })
    card.slots[5] = proofSlot(1, 250, { keyset: OTHER_KEYSET, nonceByte: 0x55 })
    card.slots[6] = proofSlot(2, 2, { keyset: OTHER_KEYSET, nonceByte: 0x66 })

    await expect(readCardSlots(card.transceive)).resolves.toEqual({
      keysets: [
        { keysetId: KEYSET_HEX, amount: 24 },
        { keysetId: hex(OTHER_KEYSET), amount: 250 },
      ],
      // The unspent pieces' amounts, in slot order, whatever their keyset.
      pieces: [16, 8, 250],
      // And the pieces whole, for a tidy to name (ENG-702).
      unspent: [
        {
          slot: 0,
          status: "unspent",
          keysetId: KEYSET_HEX,
          amount: 16,
          nonce: "ab".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
        {
          slot: 3,
          status: "unspent",
          keysetId: KEYSET_HEX,
          amount: 8,
          nonce: "33".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
        {
          slot: 5,
          status: "unspent",
          keysetId: hex(OTHER_KEYSET),
          amount: 250,
          nonce: "55".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
      ],
      spentSlots: [
        {
          slot: 1,
          status: "spent",
          keysetId: KEYSET_HEX,
          amount: 4,
          nonce: "11".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
        {
          slot: 6,
          status: "spent",
          keysetId: hex(OTHER_KEYSET),
          amount: 2,
          nonce: "66".repeat(32),
          C: "02" + "cd".repeat(32),
          date: 0,
        },
      ],
    })
    expect(card.transceive.mock.calls.map(([apdu]) => apdu)).toEqual([
      getPiecesApdu(0),
      getProofApdu(1),
      getProofApdu(6),
    ])
  })

  it("counts a slot as neither when GET_PROOF disagrees with the page", async () => {
    const card = scriptedCard([
      [getPiecesApdu(0), ok([128, 0x80])],
      // The page said spent; the slot says unspent.
      [getProofApdu(0), ok(proofSlot(1, 16))],
    ])
    await expect(readCardSlots(card.transceive)).resolves.toEqual({
      keysets: [],
      pieces: [],
      unspent: [],
      spentSlots: [],
    })
  })

  it("reads only: never LOAD_PROOF, CLEAR_SPENT or a write", async () => {
    const card = createFakeCard()
    card.slots[0] = proofSlot(1, 500)
    card.slots[1] = proofSlot(2, 4)
    await readCardSlots(card.transceive)
    expect(card.ins()).toEqual([INS.GET_PIECES, INS.GET_PROOF])
  })

  it("returns the unspent pieces' amounts in slot order, across pages, spent slots left out (ENG-700)", async () => {
    const card = createFakeCard()
    card.slots[0] = proofSlot(1, 8)
    card.slots[2] = proofSlot(1, 1, { nonceByte: 2 })
    card.slots[3] = proofSlot(2, 64, { nonceByte: 3 })
    card.slots[4] = proofSlot(1, 32, { nonceByte: 4 })
    card.slots[9] = proofSlot(1, 2, { keyset: OTHER_KEYSET, nonceByte: 9 })
    card.slots[127] = proofSlot(1, 4, { nonceByte: 127 })

    const read = await readCardSlots(card.transceive)

    expect(read.pieces).toEqual([8, 1, 32, 2, 4])
    expect(read.spentSlots.map((slot) => slot.slot)).toEqual([3])
  })

  it("getUnspentByKeyset is its unspent split", async () => {
    const card = createFakeCard()
    card.slots[0] = proofSlot(1, 16)
    card.slots[2] = proofSlot(1, 250, { keyset: OTHER_KEYSET, nonceByte: 2 })
    await expect(getUnspentByKeyset(card.transceive)).resolves.toEqual([
      { keysetId: KEYSET_HEX, amount: 16 },
      { keysetId: hex(OTHER_KEYSET), amount: 250 },
    ])
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

  it("surfaces a gated refusal as a CardError naming the command", async () => {
    await expect(clearSpent(echoCard([0x69, 0x82]).transceive)).rejects.toMatchObject({
      name: "CardError",
      sw: 0x6982,
      message: "CLEAR_SPENT failed: PIN or owner's grant required (0x6982)",
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

describe("readKeysetSplit", () => {
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it("reads the slots of a card holding nothing unspent but something spent: the spent slots are what the next top-up frees", async () => {
    const card = createFakeCard()
    card.slots[1] = proofSlot(2, 2, { nonceByte: 1 })
    card.slots[2] = proofSlot(2, 4, { nonceByte: 2 })
    const read = await readKeysetSplit(card.transceive, { unspent: 0, spent: 2 })
    expect(read?.keysets).toEqual([])
    expect(read?.spentSlots.map((slot) => slot.slot)).toEqual([1, 2])
    expect(warn).not.toHaveBeenCalled()
  })

  it("sends nothing to a card with no occupied slot", async () => {
    const card = scriptedCard([])
    await expect(
      readKeysetSplit(card.transceive, { unspent: 0, spent: 0 }),
    ).resolves.toEqual({
      keysets: [],
      pieces: [],
      unspent: [],
      spentSlots: [],
    })
    expect(card.sent).toEqual([])
  })

  it("a spent slot the card refuses to read costs the whole read, split and spent slots alike", async () => {
    const card = scriptedCard([
      [getPiecesApdu(0), ok([128, 0, ...proofSlot(1, 500).slice(1), 0x81])],
      [getProofApdu(1), SW_UNKNOWN],
    ])
    await expect(
      readKeysetSplit(card.transceive, { unspent: 1, spent: 1 }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: CardError 6F00")
  })
})

describe("GET_CARD", () => {
  it("decodes the record: the mint, the clock's rolls and the rollover budget, 7 where the card holds 0", () => {
    expect(parseCardRecord(cardBody())).toEqual({
      format: 4,
      recordSet: true,
      unit: 0,
      dailyLimit: 5000,
      refundKey: undefined,
      lastHeader: "11".repeat(32),
      rolls: 2,
      rollBudget: 7,
      allowanceArmed: true,
      mint: "https://forge.flashapp.me",
    })
    expect(parseCardRecord(cardBody("m", { budget: 12 })).rollBudget).toBe(12)
  })

  it("refuses an answer too short for the record, or a mint past it", () => {
    expect(() => parseCardRecord(new Array(100).fill(0))).toThrow(CardProtocolError)
    const body = cardBody("abc")
    body[105] = 60
    expect(() => parseCardRecord(body)).toThrow(CardProtocolError)
  })

  it("sends Le 00", async () => {
    const card = scriptedCard([[GET_CARD, ok(cardBody())]])
    await expect(getCardRecord(card.transceive)).resolves.toMatchObject({ format: 4 })
  })

  it("SET_CARD's record: unit, no refund key, 65 bytes not read, the mint's length and the mint", () => {
    const value = cardRecordValue({ mint: "https://m.test" })
    expect(value).toHaveLength(100 + 14)
    expect(value.slice(0, 99).every((b) => b === 0)).toBe(true)
    expect(value[99]).toBe(14)
    expect(String.fromCharCode(...value.slice(100))).toBe("https://m.test")
    expect(() => cardRecordValue({ mint: "x".repeat(78) })).toThrow(CardProtocolError)
    expect(() => cardRecordValue({ mint: "" })).toThrow(CardProtocolError)
  })
})

describe("SET_HEADER and TELL_TIME", () => {
  it("SET_HEADER sends the 80-byte header with Le 4 and reads the card's clock", async () => {
    const header = new Array(80).fill(0x22)
    const card = scriptedCard([
      [[0xb0, 0x36, 0x00, 0x00, 0x50, ...header, 0x04], ok(uint32(1791814824))],
    ])
    await expect(setHeader(card.transceive, header)).resolves.toBe(1791814824)
  })

  it("refuses a header that is not 80 bytes before anything is sent", async () => {
    const card = echoCard(ok(uint32(0)))
    await expect(setHeader(card.transceive, new Array(79).fill(0))).rejects.toThrow(
      CardProtocolError,
    )
    expect(card.sent).toEqual([])
  })

  it("TELL_TIME sends the phone's clock, 4 bytes, and nothing else", async () => {
    const card = scriptedCard([
      [[0xb0, 0x37, 0x00, 0x00, 0x04, ...uint32(1791814824)], ok([])],
    ])
    await expect(tellTime(card.transceive, 1791814824.9)).resolves.toBeUndefined()
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

  const loadedCard = () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234" })
    card.slots[0] = proofSlot(1, 500)
    card.slots[1] = proofSlot(2, 4, { nonceByte: 1 })
    return card
  }

  it("selects, reads info, the key, the balance, proves the key (AUTH), reads the record and the slots, in that order and nothing else (ENG-707)", async () => {
    const card = loadedCard()
    const info = await readCashuCard(card.transceive)
    expect(info).toMatchObject({
      version: "2.0",
      pinState: "set",
      hasOwner: true,
      pubkey: card.pubkey,
      balance: 500,
      keysets: [{ keysetId: KEYSET_HEX, amount: 500 }],
      pieces: [500],
      record: { mint: "https://mint.test", rollBudget: 7 },
    })
    expect(info?.spentSlots?.map((slot) => slot.slot)).toEqual([1])
    expect(card.ins()).toEqual([
      0xa4,
      INS.GET_INFO,
      INS.GET_PUBKEY,
      INS.GET_BALANCE,
      INS.AUTH,
      INS.GET_CARD,
      INS.GET_PIECES,
      INS.GET_PROOF,
    ])
  })

  it("a card that cannot prove its key returns nothing: CardAuthError, and nothing after AUTH", async () => {
    const card = createFakeCard(MAX_SLOTS, { badAuth: true })
    card.slots[0] = proofSlot(1, 500)
    await expect(readCashuCard(card.transceive)).rejects.toBeInstanceOf(CardAuthError)
    expect(card.ins()).toEqual([
      0xa4,
      INS.GET_INFO,
      INS.GET_PUBKEY,
      INS.GET_BALANCE,
      INS.AUTH,
    ])
  })

  // The security gate (ENG-707): GET_BALANCE is the one read allowed ahead of
  // AUTH. Whatever the tap work does after AUTH, nothing else may cross it.
  const tapWork: [string, ReadChanges][] = [
    ["changed nothing", {}],
    ["moved the clock", { clockMoved: true }],
    ["refreshed the card", { refreshed: true }],
    ["took the owner's grant", { granted: true }],
  ]
  for (const [what, changes] of tapWork) {
    it(`sends nothing but SELECT, GET_INFO, GET_PUBKEY and GET_BALANCE before AUTH when the tap work ${what}`, async () => {
      const card = loadedCard()
      await readCashuCard(card.transceive, { afterAuth: async () => changes })
      const ins = card.ins()
      const authAt = ins.indexOf(INS.AUTH)
      expect(authAt).toBeGreaterThan(-1)
      expect(ins.slice(0, authAt)).toEqual([
        0xa4,
        INS.GET_INFO,
        INS.GET_PUBKEY,
        INS.GET_BALANCE,
      ])
      // And GET_BALANCE is not asked again after it: the figure returned is
      // the one read before AUTH, which nothing in this tap can change.
      expect(ins.slice(authAt + 1)).not.toContain(INS.GET_BALANCE)
    })
  }

  it("hands onUnverified the card's info, key and balance once, before AUTH is sent", async () => {
    const card = loadedCard()
    let insAtCall: number[] = []
    const onUnverified = jest.fn(() => {
      insAtCall = card.ins()
    })
    const info = await readCashuCard(card.transceive, { onUnverified })
    expect(onUnverified).toHaveBeenCalledTimes(1)
    expect(onUnverified).toHaveBeenCalledWith(
      expect.objectContaining({
        pubkey: card.pubkey,
        balance: 500,
        version: "2.0",
        hasOwner: true,
        unspent: 1,
      }),
    )
    expect(insAtCall).toEqual([0xa4, INS.GET_INFO, INS.GET_PUBKEY, INS.GET_BALANCE])
    expect(info?.balance).toBe(500)
  })

  it("a clone's figure reaches onUnverified only, then the read throws CardAuthError and sends nothing after AUTH", async () => {
    const card = createFakeCard(MAX_SLOTS, { badAuth: true })
    card.slots[0] = proofSlot(1, 1_000_000)
    const onUnverified = jest.fn()
    await expect(readCashuCard(card.transceive, { onUnverified })).rejects.toBeInstanceOf(
      CardAuthError,
    )
    expect(onUnverified).toHaveBeenCalledTimes(1)
    expect(onUnverified).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 1_000_000 }),
    )
    expect(card.ins()[card.ins().length - 1]).toBe(INS.AUTH)
  })

  it("a throwing onUnverified does not fail the read", async () => {
    const card = loadedCard()
    const onUnverified = jest.fn(() => {
      throw new Error("screen gone")
    })
    await expect(readCashuCard(card.transceive, { onUnverified })).resolves.toMatchObject(
      { balance: 500, pubkey: card.pubkey },
    )
    expect(warn).toHaveBeenCalledWith(
      "readCashuCard: onUnverified threw",
      expect.any(Error),
    )
  })

  it("runs the clock's tap work after AUTH and the record, before the slots, and re-reads nothing when it changed nothing", async () => {
    const card = loadedCard()
    const afterAuth = jest.fn(async () => ({ clockMoved: false, refreshed: false }))
    await readCashuCard(card.transceive, { afterAuth })
    expect(afterAuth).toHaveBeenCalledWith({
      transceive: card.transceive,
      info: expect.objectContaining({ hasOwner: true }),
      pubkey: card.pubkey,
      record: expect.objectContaining({ mint: "https://mint.test" }),
    })
    expect(card.ins().slice(0, 7)).toEqual([
      0xa4,
      INS.GET_INFO,
      INS.GET_PUBKEY,
      INS.GET_BALANCE,
      INS.AUTH,
      INS.GET_CARD,
      INS.GET_PIECES,
    ])
  })

  it("asks GET_INFO and GET_CARD again once the tap work moved the card's clock, and returns what they say", async () => {
    const card = loadedCard()
    const [, , newest] = HEADER_VECTORS
    const afterAuth = jest.fn(async ({ transceive }: AuthenticatedTap) => {
      await setHeader(transceive, headerBytes(newest))
      return { clockMoved: true }
    })
    const info = await readCashuCard(card.transceive, { afterAuth })
    expect(info?.now).toBe(newest.time)
    expect(card.ins().slice(5, 10)).toEqual([
      INS.GET_CARD,
      INS.SET_HEADER,
      INS.GET_INFO,
      INS.GET_CARD,
      INS.GET_PIECES,
    ])
  })

  it("asks GET_INFO again once the tap holds the owner's grant, so the payment limit it returns is the one the card says only under the grant", async () => {
    const card = loadedCard()
    const afterAuth = jest.fn(async () => ({ granted: true }))
    await readCashuCard(card.transceive, { afterAuth })
    const ins = card.ins()
    const authAt = ins.indexOf(INS.GET_CARD)
    expect(ins.slice(authAt + 1).filter((i) => i === INS.GET_INFO)).toHaveLength(1)
  })

  it("asks GET_CARD again once the tap work refreshed the card, so the roll count it returns is the card's 0, not the 7 it read before", async () => {
    const card = createFakeCard(MAX_SLOTS, { rolls: 7 })
    const [, , newest] = HEADER_VECTORS
    const afterAuth = jest.fn(async ({ transceive }: AuthenticatedTap) => {
      await refreshCard(transceive, ownerSigner(FAKE_OWNER_KEY), headerBytes(newest))
      return { refreshed: true }
    })
    const info = await readCashuCard(card.transceive, { afterAuth })
    expect(afterAuth).toHaveBeenCalledWith(
      expect.objectContaining({ record: expect.objectContaining({ rolls: 7 }) }),
    )
    expect(card.rolls()).toBe(0)
    expect(info?.record.rolls).toBe(0)
    expect(card.ins().filter((ins) => ins === INS.GET_CARD)).toHaveLength(2)
  })

  it("reads a 2.0 card installed opener first in full: the applet AID reaches the applet, the package AID is never sent (ENG-681)", async () => {
    const card = createFakeCard(MAX_SLOTS, { pin: "1234", opener: true })
    card.slots[0] = proofSlot(1, 500)
    const info = await readCashuCard(card.transceive)
    expect(info).toMatchObject({
      version: "2.0",
      pinState: "set",
      hasOwner: true,
      pubkey: card.pubkey,
      balance: 500,
    })
    expect(card.transceive.mock.calls[0][0]).toEqual(SELECT_APPLET)
    expect(card.transceive.mock.calls.map(([apdu]) => apdu)).not.toContainEqual(
      SELECT_PACKAGE,
    )
  })

  it("a card that needs an update throws, and nothing but the SELECT commands is sent", async () => {
    const card = createFakeCard(MAX_SLOTS, { legacy: "0.x" })
    await expect(readCashuCard(card.transceive)).rejects.toBeInstanceOf(
      CardNeedsUpdateError,
    )
    expect(card.ins()).toEqual([0xa4, 0xa4, 0xa4])
  })

  // ENG-708: the slots are read only when the caller says something needs them.
  it("with needsPieces false, sends no GET_PIECES and no GET_PROOF, and returns the balance with no split", async () => {
    const card = loadedCard()
    const info = await readCashuCard(card.transceive, { needsPieces: () => false })
    expect(info).toMatchObject({ balance: 500, pubkey: card.pubkey, unspent: 1 })
    expect(info?.keysets).toBeUndefined()
    expect(info?.pieces).toBeUndefined()
    expect(info?.spentSlots).toBeUndefined()
    expect(info?.unspentSlots).toBeUndefined()
    expect(card.ins()).not.toContain(INS.GET_PIECES)
    expect(card.ins()).not.toContain(INS.GET_PROOF)
    expect(card.ins()).toEqual([
      0xa4,
      INS.GET_INFO,
      INS.GET_PUBKEY,
      INS.GET_BALANCE,
      INS.AUTH,
      INS.GET_CARD,
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it("asks needsPieces once, after afterAuth resolves and after GET_BALANCE, so it can read what afterAuth learned", async () => {
    const card = loadedCard()
    let learned = false
    let insAtCall: number[] = []
    const afterAuth = jest.fn(async () => {
      // Resolves on a later tick: the predicate must wait for it.
      await Promise.resolve()
      learned = true
      return {}
    })
    const needsPieces = jest.fn(() => {
      insAtCall = card.ins()
      return !learned
    })
    const info = await readCashuCard(card.transceive, { afterAuth, needsPieces })
    expect(needsPieces).toHaveBeenCalledTimes(1)
    expect(insAtCall).toEqual([
      0xa4,
      INS.GET_INFO,
      INS.GET_PUBKEY,
      INS.GET_BALANCE,
      INS.AUTH,
      INS.GET_CARD,
    ])
    // `afterAuth` set the flag before the predicate ran, and its false held.
    expect(card.ins()).not.toContain(INS.GET_PIECES)
    expect(info?.keysets).toBeUndefined()
  })

  it("with needsPieces true, reads the slots as without it", async () => {
    const card = loadedCard()
    const info = await readCashuCard(card.transceive, { needsPieces: () => true })
    expect(info).toMatchObject({
      keysets: [{ keysetId: KEYSET_HEX, amount: 500 }],
      pieces: [500],
    })
    expect(info?.spentSlots?.map((slot) => slot.slot)).toEqual([1])
    expect(card.ins().slice(-2)).toEqual([INS.GET_PIECES, INS.GET_PROOF])
  })

  it("keeps an empty card's split, which costs no APDU, whatever needsPieces says, and does not ask it", async () => {
    const card = createFakeCard()
    const needsPieces = jest.fn(() => false)
    await expect(readCashuCard(card.transceive, { needsPieces })).resolves.toMatchObject({
      balance: 0,
      keysets: [],
      pieces: [],
      spentSlots: [],
      unspentSlots: [],
    })
    expect(needsPieces).not.toHaveBeenCalled()
    expect(card.ins()).not.toContain(INS.GET_PIECES)
  })

  it("reads no slots on an empty card", async () => {
    const card = createFakeCard()
    await expect(readCashuCard(card.transceive)).resolves.toMatchObject({
      balance: 0,
      keysets: [],
      pieces: [],
      spentSlots: [],
    })
    expect(card.ins()).not.toContain(INS.GET_PIECES)
  })

  it("a tag without the Cashu applet resolves null after every SELECT fails, quietly", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_FILE_NOT_FOUND],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
      [SELECT_LEGACY, SW_FILE_NOT_FOUND],
      [SELECT_FOXY, SW_FILE_NOT_FOUND],
    ])
    await expect(readCashuCard(card.transceive)).resolves.toBeNull()
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE, SELECT_LEGACY, SELECT_FOXY])
    expect(warn).not.toHaveBeenCalled()
  })

  it("a card that refuses the 2.0 AID with anything but 6A82 needs an update: not null, so it is never read as a BoltCard", async () => {
    const card = scriptedCard([
      [SELECT_PACKAGE, SW_APPLET_SELECT_FAILED],
      [SELECT_APPLET, SW_FILE_NOT_FOUND],
    ])
    await expect(readCashuCard(card.transceive)).rejects.toBeInstanceOf(
      CardNeedsUpdateError,
    )
    expect(card.sent).toEqual([SELECT_APPLET, SELECT_PACKAGE])
  })

  it("a transport failure on SELECT propagates instead of reading as not-a-Cashu-card", async () => {
    const transceive = async () => {
      throw new Error("Tag was lost")
    }
    await expect(readCashuCard(transceive)).rejects.toThrow("Tag was lost")
  })

  it("genuine status failures before the balance throw a CardError naming the command", async () => {
    const infoFails = scriptedCard([
      [SELECT_APPLET, ok([2, 0])],
      [GET_INFO, SW_UNKNOWN],
    ])
    await expect(readCashuCard(infoFails.transceive)).rejects.toThrow(
      "GET_INFO failed: the card failed to sign (0x6F00)",
    )
    const pubkeyFails = scriptedCard([
      [SELECT_APPLET, ok([2, 0])],
      [GET_INFO, ok(INFO_BODY)],
      [GET_PUBKEY, SW_UNKNOWN],
    ])
    await expect(readCashuCard(pubkeyFails.transceive)).rejects.toThrow(
      "GET_PUBKEY failed: the card failed to sign (0x6F00)",
    )
  })

  it("a card pulled away midway through the pages still reads: balance and key, no split", async () => {
    const card = loadedCard()
    for (let slot = 2; slot < 10; slot += 1)
      card.slots[slot] = proofSlot(1, 1, { nonceByte: slot })
    const answer = card.transceive.getMockImplementation()!
    let pages = 0
    card.transceive.mockImplementation(async (apdu) => {
      if (apdu[1] === INS.GET_PIECES && (pages += 1) === 2)
        throw new Error("Tag was lost")
      return answer(apdu)
    })
    const info = await readCashuCard(card.transceive)
    expect(info).toMatchObject({ balance: 508, pubkey: card.pubkey })
    expect(info?.keysets).toBeUndefined()
    expect(info?.spentSlots).toBeUndefined()
    expect(info?.pieces).toBeUndefined()
    expect(warn).toHaveBeenCalledWith("Cashu card keyset split skipped: Error")
  })

  it("loads, clears and writes nothing — a read never sends LOAD_PROOF, CLEAR_SPENT or a PIN or owner command", async () => {
    const card = loadedCard()
    await readCashuCard(card.transceive)
    const writes = [
      0x30, 0x31, 0x32, 0x34, 0x36, 0x37, 0x40, 0x41, 0x42, 0x43, 0x45, 0x53,
    ]
    expect(card.ins().filter((ins) => writes.includes(ins))).toEqual([])
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
