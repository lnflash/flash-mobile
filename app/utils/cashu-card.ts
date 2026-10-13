/* eslint-disable no-bitwise -- this module is a byte-level APDU codec; masking
   and shifting is the work, not an accident. */
/**
 * Cashu NFC card — APDU protocol layer, card protocol 2.0 (ENG-675).
 *
 * Talks to the shared Cashu card applet (lnflash/cashu-javacard, protocol 2.0:
 * the Foxy wallet project's software 1.20 under a neutral identity): an
 * offline bearer card that holds format-4 ecash pieces locked to a key it made
 * itself, signs one BIP-340 signature for a whole payment (NUT-11 SIG_ALL),
 * keeps the mint's DLEQ proof beside each piece, and is administered by an
 * owner key on the holder's phone. This app never spends from a card: it
 * reads it, sets it up, loads it and administers it.
 *
 * Deliberately transport-agnostic: it builds and parses APDUs and knows nothing
 * about NFC, so the whole protocol is unit-testable without a card. The
 * IsoDep transport is the one shared session in `app/contexts/Flashcard.tsx`.
 *
 * Command reference: cashu-javacard `spec/APDU.md` at the ref
 * `.github/workflows/ios-e2e-card.yml` pins (`CASHU_JAVACARD_REF`). Where the
 * owner's proof is needed, `cashu-card-owner.ts` signs it; where the PIN is
 * sealed, `cashu-card-seal.ts` builds the envelope.
 */
import { schnorr, secp256k1 } from "@noble/curves/secp256k1"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { cardPinBlock, cardSeal, parseCardPinKey } from "./cashu-card-seal"

/**
 * The 2.0 package AID: "CASHUCARD" after the proprietary RID byte F0. Sent
 * only after the applet AID fails (ENG-681): on a card installed as
 * cashu-javacard documents it, the opener (`F0 CASHUCARD 4D`) goes on first,
 * and a SELECT by this partial name reaches the opener, not the applet. It
 * answers 9000 with no version, and the next command 6D00.
 */
export const CASHU_AID = [0xf0, 0x43, 0x41, 0x53, 0x48, 0x55, 0x43, 0x41, 0x52, 0x44]
/**
 * The applet instance AID: the package AID and 01. The only name that
 * reaches the applet on every 2.0 card, opener or not, so it is the one
 * sent first, as Foxy's wallet does.
 */
export const CASHU_APPLET_AID = [...CASHU_AID, 0x01]
/**
 * The withdrawn 0.x AID (NFC Forum RID). Sent only to tell a card that needs
 * an update from a tag with no Cashu applet: nothing else is ever sent to it.
 */
export const LEGACY_CASHU_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]
/** Foxy's 1.x package AID ("FOXYCARD"): a card that needs an update too. */
export const FOXY_LEGACY_AID = [0xf0, 0x46, 0x4f, 0x58, 0x59, 0x43, 0x41, 0x52, 0x44]

/** The protocol major version this app speaks. */
export const PROTOCOL_MAJOR = 2

const CLA = 0xb0
const SW_OK = 0x9000
/** ISO 7816-4 "file or application not found": the tag has no such applet. */
const SW_FILE_NOT_FOUND = 0x6a82
/** LOAD_PROOF: the piece's nonce is already in a slot, spent or not. */
export const SW_ALREADY_ON_CARD = 0x6a94
/** The owner's proof is missing, wrong or used, or the command is not open to an owned card. */
export const SW_OWNER_PROOF = 0x6a91
/** The card has no owner. */
export const SW_NO_OWNER = 0x6a90

/**
 * One proof slot as GET_PROOF answers it: status[1] + keyset_id[8] +
 * amount[4] + nonce[32] + C[33] + date[4] (spec/APDU.md, Proof Slot Layout).
 */
export const PROOF_SIZE = 82
/** One piece as LOAD_PROOF takes it: the slot without its status byte. */
export const PIECE_SIZE = 81
/** The mint's NUT-12 proof as the card keeps it: e ‖ s ‖ r. */
export const DLEQ_SIZE = 96
/** A Bitcoin block header as the network carries it. */
export const HEADER_SIZE = 80
/** GET_INFO with P1 = 1. */
export const INFO_SIZE = 42
/** Every 2.0 card has 128 places. */
export const MAX_SLOTS = 128
/** The card's record holds a mint address of at most this many characters. */
export const RECORD_MINT_MAX = 77

export const INS = {
  GET_INFO: 0x01,
  GET_PUBKEY: 0x10,
  GET_BALANCE: 0x11,
  GET_PROOF_COUNT: 0x12,
  GET_PROOF: 0x13,
  GET_SLOT_STATUS: 0x14,
  AUTH: 0x15,
  GET_CARD: 0x16,
  GET_PIECES: 0x17,
  GET_DLEQ: 0x1a,
  LOAD_PROOF: 0x30,
  CLEAR_SPENT: 0x31,
  SET_CARD: 0x32,
  SET_LIMIT: 0x34,
  SET_HEADER: 0x36,
  TELL_TIME: 0x37,
  VERIFY_PIN: 0x40,
  SET_PIN: 0x41,
  CHANGE_PIN: 0x42,
  SET_OWNER: 0x43,
  GET_NONCE: 0x44,
  ALLOW_LOAD: 0x45,
  REFRESH: 0x53,
} as const

/** Sends a raw APDU and resolves to the full response: data bytes + SW1 + SW2. */
export type Transceiver = (apdu: number[]) => Promise<number[]>

/** A command reached the card and the card refused it. `sw` is the status word. */
export class CardError extends Error {
  constructor(readonly sw: number, readonly context: string) {
    super(`${context} failed: ${describeStatusWord(sw)} (0x${hex16(sw)})`)
    this.name = "CardError"
  }
}

/**
 * The card accepted the command (0x9000) but the framing was wrong — a short
 * response, a wrong-length body — or the caller asked for bytes that cannot go
 * on the wire.
 *
 * Deliberately *not* a `CardError`: there is no status word to report, and
 * pretending `sw === 0` would let retry logic misread a framing bug as a card
 * refusal.
 */
export class CardProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CardProtocolError"
  }
}

/**
 * The tapped card holds a Cashu applet of another protocol: the 0.x applet
 * under its withdrawn AID (`0.x`), Foxy's 1.x (`1.x`), a card under the 2.0
 * AID reporting another major version (`older`, `newer`), or one that answered
 * a 2.0 SELECT with anything but `9000` or `6A82` (`refused`: jCardSim's
 * `6999` or `6E00`, a locked instance's `6283`). "This card needs an update"
 * (cashu-javacard tools/cardsim/README.md, Old cards: any SELECT answer that
 * is not `02xx 9000`): nothing is written to it and nothing is spent from it,
 * and nothing further is sent in this tap.
 */
export class CardNeedsUpdateError extends Error {
  constructor(readonly found: "0.x" | "1.x" | "older" | "newer" | "refused") {
    super(`this card needs an update (${found})`)
    this.name = "CardNeedsUpdateError"
  }
}

/**
 * The card did not prove it holds the key it reported (AUTH): a refused or
 * malformed answer, or a signature that is not the card key's over this
 * tap's two nonces. Nothing it said in this tap is shown or stored.
 */
export class CardAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CardAuthError"
  }
}

const hex16 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0")

/** A status word for a log line; -1 (see `statusWordOf`) has none to show. */
const swLabel = (sw: number) => (sw < 0 ? "none" : hex16(sw))

/**
 * Known status words (spec/APDU.md, Error Code Summary). A bare hex code is
 * close to useless in a log, so name the ones we can. `63CX` carries the PIN
 * tries remaining in its low nibble.
 */
export function describeStatusWord(sw: number): string {
  if ((sw & 0xfff0) === 0x63c0) {
    return `wrong PIN, ${sw & 0x0f} tries left`
  }
  switch (sw) {
    case 0x9000:
      return "OK"
    case 0x6982:
      return "PIN or owner's grant required"
    case 0x6983:
      return "PIN blocked"
    case 0x6984:
      return "no PIN set"
    case 0x6985:
      return "conditions not satisfied"
    case 0x6986:
      return "card is locked against writes"
    case 0x6a80:
      return "wrong data"
    case 0x6a82:
      return "applet not found"
    case 0x6a83:
      return "slot index out of range"
    case 0x6a84:
      return "no free slot"
    case 0x6a86:
      return "invalid P1/P2"
    case 0x6a88:
      return "slot is empty"
    case 0x6a8c:
      return "no card record"
    case 0x6a8d:
      return "card holds value"
    case 0x6a8e:
      return "a dated piece on a card with no refund key"
    case 0x6a8f:
      return "over the day's limit"
    case 0x6a90:
      return "no owner"
    case 0x6a91:
      return "owner's proof refused"
    case 0x6a93:
      return "too little work in the block header"
    case 0x6a94:
      return "already on the card"
    case 0x6a96:
      return "too many places for one signature"
    case 0x6b00:
      return "wrong P1/P2"
    case 0x6f00:
      return "the card failed to sign"
    case 0x6700:
      return "wrong length"
    case 0x6d00:
      return "unsupported command"
    case 0x6e00:
      return "wrong CLA — is this a Cashu card?"
    default:
      return "unexpected status word"
  }
}

/**
 * Every value handed to the native bridge must already be a byte. Both bridges
 * keep only the low 8 bits of what they get (react-native-nfc-manager 3.17.2:
 * Android `NfcManager.java:1501`, iOS `Util.m:36`) and read NaN as 0, so a
 * slot index of 256 or a NaN from a bad hex digit would otherwise reach the
 * card as a different, valid-looking byte.
 */
const assertBytes = (values: number[], what: string) => {
  values.forEach((value) => {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new CardProtocolError(`${what}: ${value} is not a byte`)
    }
  })
}

export function buildApdu(
  ins: number,
  {
    cla = CLA,
    p1 = 0x00,
    p2 = 0x00,
    data,
    le,
  }: {
    cla?: number
    p1?: number
    p2?: number
    data?: number[]
    le?: number
  } = {},
): number[] {
  const apdu = [cla, ins, p1, p2]
  assertBytes(apdu, "APDU header")
  if (data && data.length > 0) {
    // Short-form Lc is a single byte. Without this guard a 300-byte payload
    // pushes `300`, which the native bridge truncates to 0x2c — a silently
    // corrupt length on the wire, on exactly the commands that move money.
    if (data.length > 255) {
      throw new CardProtocolError(
        `APDU data too long for short Lc: ${data.length} bytes (max 255)`,
      )
    }
    assertBytes(data, "APDU data")
    apdu.push(data.length, ...data)
  }
  if (le !== undefined) {
    assertBytes([le], "APDU Le")
    apdu.push(le)
  }
  return apdu
}

/**
 * SELECT by AID. The trailing 0x00 is Le, making this a Case-4 SELECT. It is
 * load-bearing on iOS: `NFCISO7816APDU initWithData:` parses a Case-3 command
 * (no Le) as expectedResponseLength -1, CoreNFC then sends no Le, and the card
 * answers with a status word only — the applet version would come back empty.
 * Every AID here is also listed in ios/LNFlash/Info.plist
 * (`iso7816.select-identifiers`): CoreNFC connects only to those. With no
 * AID given it selects by the applet AID, the one `selectApplet` sends first.
 */
export const buildSelectApdu = (aid: number[] = CASHU_APPLET_AID): number[] => [
  0x00,
  0xa4,
  0x04,
  0x00,
  aid.length,
  ...aid,
  0x00,
]

/** The status word of a raw response, or -1 when it is too short to carry one. */
export const statusWordOf = (response: number[]): number =>
  response.length < 2
    ? -1
    : (response[response.length - 2] << 8) | response[response.length - 1]

/**
 * Splits a card response into body and status word, throwing on anything but
 * 0x9000. Both platforms hand back `[...data, sw1, sw2]`.
 */
export function parseResponse(response: number[], context: string): number[] {
  if (response.length < 2) {
    throw new CardProtocolError(
      `${context}: truncated response (${response.length} bytes)`,
    )
  }
  const sw = statusWordOf(response)
  if (sw !== SW_OK) {
    throw new CardError(sw, context)
  }
  return response.slice(0, -2)
}

/** One command, refused or framed wrongly as a thrown error, the body otherwise. */
export async function sendCommand(
  transceive: Transceiver,
  ins: number,
  opts: Parameters<typeof buildApdu>[1] & { context: string },
): Promise<number[]> {
  const { context, ...apduOpts } = opts
  return parseResponse(await transceive(buildApdu(ins, apduOpts)), context)
}

const send = sendCommand

const u32 = (value: number, what: string): number[] => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new CardProtocolError(`${what} must be a whole number from 0 to 2^32-1`)
  }
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

const readU32 = (bytes: number[], at: number): number =>
  ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0

/**
 * Neither 2.0 SELECT form selected the applet and no withdrawn Cashu AID
 * selected either: a tag with no Cashu applet on it, an NTAG 424 BoltCard
 * among them. The applet AID answered `6A82` (the card's runtime: no such
 * application), and the package AID `6A82` too, or 9000 with no `02 xx`
 * version (a cashu-javacard opener, or whatever else answers to the partial
 * name). The caller may read it as another kind of card. A 2.0 SELECT
 * answered with any other status word is a card that knows the AID and still
 * refused, and is `CardNeedsUpdateError` instead (`selectApplet`). `sw` is
 * the applet-AID answer.
 */
export class AppletNotSelectedError extends CardError {
  constructor(readonly packageSw: number, readonly appletSw: number) {
    super(appletSw, "SELECT")
    this.name = "AppletNotSelectedError"
    this.message = `SELECT failed: package AID ${swLabel(
      packageSw,
    )}, applet AID ${swLabel(appletSw)}`
  }
}

/**
 * A 2.0 SELECT's answer: the applet version, `02 xx`. Any other major needs
 * an update: an older card speaks another wire, and a newer one is not the
 * wire this app speaks (cashu-javacard tools/cardsim/README.md, Old cards).
 */
const checkVersion = (body: number[]): number[] => {
  if (body.length < 2) {
    throw new CardProtocolError(`SELECT: expected a 2-byte version, got ${body.length}`)
  }
  if (body[0] < PROTOCOL_MAJOR) throw new CardNeedsUpdateError("older")
  if (body[0] !== PROTOCOL_MAJOR) throw new CardNeedsUpdateError("newer")
  return body
}

/** A version body this app speaks: exactly `02 xx`. */
const isProtocolVersion = (body: number[]): boolean =>
  body.length === 2 && body[0] === PROTOCOL_MAJOR

/**
 * SELECT the 2.0 applet: the instance AID first, then the package AID after
 * any refusal of the first (ENG-681). Resolves the version body (`02 00`).
 *
 * The instance AID goes first because the package AID is a partial name: on
 * a card installed as cashu-javacard documents it (the opener `F0 CASHUCARD
 * 4D`, then the applet `F0 CASHUCARD 01`, then the tag), a SELECT by it
 * reaches the opener, which answers 9000 with no version body and 6D00 to
 * what follows. Foxy's wallet selects the full AID only.
 *
 * - The instance AID answers 9000: the card is 2.0 when the body is `02 xx`,
 *   and needs an update for any other version (`CardNeedsUpdateError`
 *   "older", "newer"; a body too short is `CardProtocolError`).
 * - Otherwise the package AID: 9000 with exactly `02 xx` is the applet (a
 *   reader or card that takes the partial name only). 9000 with any other
 *   body is not the applet (the opener, say): it is not a refusal and does
 *   not mean an update; the read goes on as if the package AID said `6A82`.
 *
 * The cardsim contract (cashu-javacard tools/cardsim/README.md, Old cards;
 * spec/NUT-XX.md, AID assignment; spec/APDU.md, the AID) treats any SELECT
 * answer that is not `02xx 9000` as "This card needs an update". So when
 * neither 2.0 form selects:
 * - either one refused with anything but `6A82` (`6999`, `6E00`, `6283`,
 *   `6A81`, a response too short to carry a status word): `CardNeedsUpdateError`,
 *   with nothing further sent;
 * - both answered `6A82` (or the package AID the 9000 above): the withdrawn
 *   AIDs are tried, the 0.x one and then Foxy's 1.x. A card that answers
 *   either with 9000 needs an update too. Anything else rejects with
 *   `AppletNotSelectedError`, and the caller may read the tag as another kind
 *   of card (a BoltCard says `6A82`).
 *
 * A transport failure (the card left the field) is not a refusal: it
 * propagates at once, with no further SELECT on a dead handle.
 */
export async function selectApplet(transceive: Transceiver): Promise<number[]> {
  const appletResponse = await transceive(buildSelectApdu(CASHU_APPLET_AID))
  const appletSw = statusWordOf(appletResponse)
  if (appletSw === SW_OK) return checkVersion(appletResponse.slice(0, -2))
  const packageResponse = await transceive(buildSelectApdu(CASHU_AID))
  const packageSw = statusWordOf(packageResponse)
  if (packageSw === SW_OK) {
    const body = packageResponse.slice(0, -2)
    if (isProtocolVersion(body)) return body
  }
  const packageRefused = packageSw !== SW_OK && packageSw !== SW_FILE_NOT_FOUND
  if (appletSw !== SW_FILE_NOT_FOUND || packageRefused) {
    throw new CardNeedsUpdateError("refused")
  }
  if (statusWordOf(await transceive(buildSelectApdu(LEGACY_CASHU_AID))) === SW_OK) {
    throw new CardNeedsUpdateError("0.x")
  }
  if (statusWordOf(await transceive(buildSelectApdu(FOXY_LEGACY_AID))) === SW_OK) {
    throw new CardNeedsUpdateError("1.x")
  }
  throw new AppletNotSelectedError(packageSw, appletSw)
}

export type CardPinState = "unset" | "set" | "blocked" | "unknown"

/** GET_INFO with P1 = 1 (spec/APDU.md, GET_INFO): 42 bytes. */
export interface CardInfo {
  /** "major.minor", e.g. "2.0". */
  version: string
  major: number
  minor: number
  maxSlots: number
  unspent: number
  spent: number
  empty: number
  /** Capability bit 0: the card made its secp256k1 key itself. */
  secp256k1Native: boolean
  /** Capability bit 1: BIP-340 signing. */
  schnorr: boolean
  /** Capability bit 7: the card takes its PIN sealed (`cashu-card-seal.ts`), and is sent it no other way. */
  sealed: boolean
  /** Byte 7: 0 unset, 1 set, 2 blocked; `unknown` for any other value. */
  pinState: CardPinState
  /** Byte 8: the pieces' format, 4 (SIG_ALL) on 2.0. */
  format: number
  /** Byte 9: PIN tries left, 0 to 3. */
  tries: number
  /** Byte 10: LOCK_CARD was run; nothing more is written. */
  locked: boolean
  /** Byte 11: SET_CARD has written the record (the mint). */
  recordSet: boolean
  /** Bytes 12-15: the daily limit, sats; 0 is none. */
  dailyLimit: number
  /** Byte 16: SET_OWNER has given the card an owner. */
  hasOwner: boolean
  /** Bytes 17-20: the card's clock, the newest block header's time; 0 before any. */
  now: number
  /** Bytes 21-24: when the day's window began. */
  windowStart: number
  /** Bytes 25-28: sats signed for in the window. */
  spentToday: number
  /** Byte 29: this tap may load the change of the last payment with no PIN. */
  changeGrant: boolean
  /** Bytes 30-33: the limit on one payment, shown only under the owner's grant in this tap (0 otherwise). */
  paymentLimit: number
  /** Bytes 34-37: what the card signs for a day without its PIN. */
  allowance: number
  /** Bytes 38-41: what has been signed for without the PIN in the window. */
  nopinSpent: number
}

const PIN_STATES: Record<number, CardPinState> = { 0: "unset", 1: "set", 2: "blocked" }

/**
 * GET_INFO P1 = 1's 42 bytes. Any other length is a `CardProtocolError`: a 30-
 * or 43-byte answer is a card asked another question, and a 0.x card's eight
 * bytes never get this far (`selectApplet`).
 */
export function parseInfo(body: number[]): CardInfo {
  if (body.length !== INFO_SIZE) {
    throw new CardProtocolError(
      `GET_INFO: expected ${INFO_SIZE} bytes, got ${body.length}`,
    )
  }
  const caps = body[6]
  return {
    version: `${body[0]}.${body[1]}`,
    major: body[0],
    minor: body[1],
    maxSlots: body[2],
    unspent: body[3],
    spent: body[4],
    empty: body[5],
    secp256k1Native: (caps & 0x01) !== 0,
    schnorr: (caps & 0x02) !== 0,
    sealed: (caps & 0x80) !== 0,
    pinState: PIN_STATES[body[7]] ?? "unknown",
    format: body[8],
    tries: body[9],
    locked: body[10] === 1,
    recordSet: body[11] === 1,
    dailyLimit: readU32(body, 12),
    hasOwner: body[16] === 1,
    now: readU32(body, 17),
    windowStart: readU32(body, 21),
    spentToday: readU32(body, 25),
    changeGrant: body[29] === 1,
    paymentLimit: readU32(body, 30),
    allowance: readU32(body, 34),
    nopinSpent: readU32(body, 38),
  }
}

/** GET_INFO with P1 = 1: the long answer, with the limits. */
export async function getInfo(transceive: Transceiver): Promise<CardInfo> {
  return parseInfo(
    await send(transceive, INS.GET_INFO, { p1: 0x01, le: 0x00, context: "GET_INFO" }),
  )
}

/** The card's compressed secp256k1 public key (33 bytes) — its P2PK identity. */
export async function getPubkey(transceive: Transceiver): Promise<number[]> {
  const body = await send(transceive, INS.GET_PUBKEY, { le: 0x21, context: "GET_PUBKEY" })
  if (body.length !== 33) {
    throw new CardProtocolError(`GET_PUBKEY: expected 33 bytes, got ${body.length}`)
  }
  return body
}

export function parseBalance(body: number[]): number {
  if (body.length !== 4) {
    throw new CardProtocolError(`GET_BALANCE: expected 4 bytes, got ${body.length}`)
  }
  return readU32(body, 0)
}

/**
 * Sum of unspent piece amounts on the card, whatever keyset each was minted
 * under: the card knows no units, so on its own this number has none. Pair it
 * with `getUnspentByKeyset` and the mint's keyset units before showing it.
 * Advisory only: reconcile against the mint (NUT-07) before trusting it for
 * money decisions.
 */
export async function getBalance(transceive: Transceiver): Promise<number> {
  return parseBalance(
    await send(transceive, INS.GET_BALANCE, { le: 0x04, context: "GET_BALANCE" }),
  )
}

/** Number of occupied (unspent + spent) slots. */
export async function getProofCount(transceive: Transceiver): Promise<number> {
  const body = await send(transceive, INS.GET_PROOF_COUNT, {
    le: 0x01,
    context: "GET_PROOF_COUNT",
  })
  if (body.length !== 1) {
    throw new CardProtocolError(`GET_PROOF_COUNT: expected 1 byte, got ${body.length}`)
  }
  return body[0]
}

/**
 * Lower-case hex. Takes a Uint8Array too; `Array.from` because a Uint8Array's
 * own `map` would coerce each hex string back into a byte.
 */
export const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** Exactly `length` bytes of hex, or a `CardProtocolError` naming the field. */
export const hexBytes = (hex: string, length: number, field: string): number[] => {
  if (!new RegExp(`^[0-9a-fA-F]{${length * 2}}$`).test(hex)) {
    throw new CardProtocolError(
      `${field} must be ${length * 2} hex chars (${length} bytes)`,
    )
  }
  return (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
}

// ── AUTH ─────────────────────────────────────────────────────────────────────

export const AUTH_TAG = "CashuCard/auth"
const AUTH_NONCE_SIZE = 16

/** SHA-256(T ‖ T ‖ reader (16) ‖ card (16) ‖ card key (33)), T = SHA-256("CashuCard/auth"). */
export const authMessage = (
  reader: number[],
  card: number[],
  cardKey: number[],
): Uint8Array => {
  const tag = sha256(new TextEncoder().encode(AUTH_TAG))
  return sha256(Uint8Array.from([...tag, ...tag, ...reader, ...card, ...cardKey]))
}

/**
 * AUTH: sixteen random bytes of the reader's, answered with sixteen of the
 * card's and a BIP-340 signature by the card key over both and the key
 * (`authMessage`). It proves the tapped card holds the key it reported, so a
 * read never shows, nor this phone stores, a balance a card that is not that
 * card made up. No PIN, and nothing is burned. Any failure, a refusal
 * included, is a `CardAuthError`; a transport failure propagates as it is.
 * `reader` is for a test that needs the same bytes twice.
 */
export async function authenticateCard(
  transceive: Transceiver,
  cardPubkey: number[],
  reader: number[] = Array.from(secureRandom(AUTH_NONCE_SIZE)),
): Promise<void> {
  if (reader.length !== AUTH_NONCE_SIZE) {
    throw new CardProtocolError("AUTH: the reader's nonce is 16 bytes")
  }
  const response = await transceive(buildApdu(INS.AUTH, { data: reader, le: 0x50 }))
  const sw = statusWordOf(response)
  if (sw !== SW_OK) throw new CardAuthError(`AUTH refused (${swLabel(sw)})`)
  const body = response.slice(0, -2)
  if (body.length !== AUTH_NONCE_SIZE + 64) {
    throw new CardAuthError(`AUTH: expected 80 bytes, got ${body.length}`)
  }
  let good = false
  try {
    good = schnorr.verify(
      Uint8Array.from(body.slice(AUTH_NONCE_SIZE)),
      authMessage(reader, body.slice(0, AUTH_NONCE_SIZE), cardPubkey),
      Uint8Array.from(cardPubkey.slice(1)),
    )
  } catch {
    good = false
  }
  if (!good) throw new CardAuthError("AUTH: the card's signature does not verify")
}

type Crypto = { getRandomValues: (bytes: Uint8Array) => Uint8Array }

/**
 * Cryptographically random bytes from the platform (react-native-get-random-values
 * installs it on device; Node has it natively). There is no fallback: a
 * predictable nonce would let a recorded answer be replayed.
 */
export const secureRandom = (length: number): Uint8Array => {
  const crypto = (globalThis as { crypto?: Partial<Crypto> }).crypto
  if (!crypto?.getRandomValues) {
    throw new Error("No secure random source (crypto.getRandomValues)")
  }
  return crypto.getRandomValues(new Uint8Array(length))
}

// ── the PIN ──────────────────────────────────────────────────────────────────

/** The applet's bounds on a PIN: 4–8 bytes (spec/APDU.md, VERIFY_PIN). */
export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 8

/**
 * 4–8 ASCII digits. The applet accepts any 4–8 bytes, but a PIN is typed, and
 * a keypad can emit digits outside ASCII (an Arabic-Indic "٣" is U+0663; the
 * app ships `ar`). The bridge keeps only the low byte of each char code
 * (see `assertBytes`), so such a PIN would go out as unrelated bytes, fail, and
 * spend one of the card's three tries. Refusing locally costs nothing.
 */
export const isValidCardPin = (pin: string): boolean =>
  new RegExp(`^[0-9]{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin)

export const pinBytes = (pin: string, command: string): number[] => {
  if (!isValidCardPin(pin)) {
    // Never put the PIN itself in the message: errors reach the console.
    throw new CardProtocolError(
      `${command}: a PIN is ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} ASCII digits`,
    )
  }
  return Array.from(pin).map((c) => c.charCodeAt(0))
}

/** The tries left encoded in a 63CX status word, or undefined for any other. */
export const triesLeft = (sw: number): number | undefined =>
  (sw & 0xfff0) === 0x63c0 ? sw & 0x0f : undefined

/** A tap reached a card that is not the one the screen is showing. */
export class WrongCardError extends Error {
  constructor(readonly pubkey: string) {
    super("a different card was tapped")
    this.name = "WrongCardError"
  }
}

/** How a PIN goes to this card: sealed to its PIN key, or clear on a card that takes no other way. */
export type PinForm = {
  /** `CardInfo.sealed`: the card takes its PIN sealed, and is sent it no other way. */
  sealed: boolean
  /** The card key, hex: the PIN key's signature is checked against it before anything is sealed. */
  cardPubkey: string
}

/**
 * GET_NONCE with P1 = 1: sixteen fresh bytes, the card's PIN key and the card
 * key's signature over it, checked (`parseCardPinKey`). The nonce is good for
 * one sealed command.
 */
export async function getCardPinKey(transceive: Transceiver, cardPubkey: string) {
  const body = await send(transceive, INS.GET_NONCE, {
    p1: 0x01,
    le: 0x71,
    context: "GET_NONCE (PIN key)",
  })
  return parseCardPinKey(body, cardPubkey)
}

/** A PIN command sent sealed (P1 = 1) or clear (P1 = 0), as `form` says the card takes it. */
const sendPin = async (
  transceive: Transceiver,
  {
    ins,
    pin,
    form,
    context,
  }: { ins: number; pin: number[]; form: PinForm; context: string },
) => {
  if (!form.sealed) {
    await send(transceive, ins, { data: pin, context })
    return
  }
  const key = await getCardPinKey(transceive, form.cardPubkey)
  await send(transceive, ins, {
    p1: 0x01,
    data: cardSeal(key, { ins, clear: cardPinBlock(pin) }),
    context,
  })
}

/**
 * SET_PIN: on an open card (no owner) with nothing unspent, or on an owned card
 * with no PIN under the owner's grant in this tap (ALLOW_LOAD first: ADD PIN).
 * `6A91` otherwise on an owned card, `6A8D` with anything unspent.
 */
export async function setCardPin(
  transceive: Transceiver,
  pin: string,
  form: PinForm,
): Promise<void> {
  await sendPin(transceive, {
    ins: INS.SET_PIN,
    pin: pinBytes(pin, "SET_PIN"),
    form,
    context: "SET_PIN",
  })
}

/**
 * VERIFY_PIN within the current session. Resolves on success; a wrong PIN
 * rejects with the card's `63CX` (tries remaining), a blocked PIN with `6983`,
 * an unset PIN with `6984`. A PIN that is not 4–8 ASCII digits is refused with
 * a `CardProtocolError` before any APDU is built, so it costs no try. The
 * session flag clears on deselect: every tap that loads re-verifies.
 */
export async function verifyCardPin(
  transceive: Transceiver,
  pin: string,
  form: PinForm,
): Promise<void> {
  await sendPin(transceive, {
    ins: INS.VERIFY_PIN,
    pin: pinBytes(pin, "VERIFY_PIN"),
    form,
    context: "VERIFY_PIN",
  })
}

// ── the owner's proof ────────────────────────────────────────────────────────

/**
 * Signs an owner's proof: an ECDSA signature (P-256, SHA-256, DER) by the
 * owner key over `label ‖ nonce ‖ value` (spec/APDU.md, The owner's proof).
 * `cashu-card-owner.ts` makes one from the key this phone holds for a card.
 */
export type OwnerSigner = (
  label: string,
  nonce: number[],
  value: number[],
) => Promise<number[]>

export const OWNER_LABEL = {
  CHANGE_PIN: "CashuCard/change-pin",
  SET_LIMIT: "CashuCard/set-limit",
  SET_OWNER: "CashuCard/set-owner",
  SET_CARD: "CashuCard/set-card",
  LOAD: "CashuCard/load",
  REFRESH: "CashuCard/refresh",
} as const

/** GET_NONCE (P1 = 0): sixteen fresh bytes for one owner's proof. `6A90` with no owner. */
export async function getOwnerNonce(transceive: Transceiver): Promise<number[]> {
  const body = await send(transceive, INS.GET_NONCE, { le: 0x10, context: "GET_NONCE" })
  if (body.length !== 16) {
    throw new CardProtocolError(`GET_NONCE: expected 16 bytes, got ${body.length}`)
  }
  return body
}

/** An owner's command's data: the proof's length (1), the proof (DER, at most 72), the value. */
export const ownerData = (proof: number[], value: number[]): number[] => {
  if (proof.length < 8 || proof.length > 72) {
    throw new CardProtocolError(`an owner's proof is 8 to 72 bytes, got ${proof.length}`)
  }
  return [proof.length, ...proof, ...value]
}

/**
 * GET_NONCE, then the proof over `label ‖ nonce ‖ value`, then the command.
 * Each nonce is good for one proof, right or wrong: a refused proof (`6A91`)
 * is never sent again.
 */
export async function sendOwnerCommand(
  transceive: Transceiver,
  ins: number,
  {
    label,
    value,
    sign,
    le,
    context,
  }: {
    label: string
    value: number[]
    sign: OwnerSigner
    le?: number
    context: string
  },
): Promise<number[]> {
  const nonce = await getOwnerNonce(transceive)
  const proof = await sign(label, nonce, value)
  return send(transceive, ins, { data: ownerData(proof, value), le, context })
}

/**
 * CHANGE_PIN, the owner's form: the owner's proof over the new PIN, and no old
 * PIN, no session, any PIN state, any funds. It sets the PIN, refills the
 * tries, unblocks a blocked PIN and ends any verified session. On a sealed card
 * the proof is over the PIN and the sixteen bytes GET_NONCE P1 = 1 gave, and
 * the same bytes seal the command that carries both.
 */
export async function changeCardPin(
  transceive: Transceiver,
  newPin: string,
  { sign, ...form }: PinForm & { sign: OwnerSigner },
): Promise<void> {
  const pin = pinBytes(newPin, "CHANGE_PIN")
  if (!form.sealed) {
    await sendOwnerCommand(transceive, INS.CHANGE_PIN, {
      label: OWNER_LABEL.CHANGE_PIN,
      value: pin,
      sign,
      context: "CHANGE_PIN",
    })
    return
  }
  const key = await getCardPinKey(transceive, form.cardPubkey)
  const proof = await sign(OWNER_LABEL.CHANGE_PIN, key.nonce, pin)
  const clear = [proof.length, ...proof, ...cardPinBlock(pin)]
  await send(transceive, INS.CHANGE_PIN, {
    p1: 0x01,
    data: cardSeal(key, { ins: INS.CHANGE_PIN, clear }),
    context: "CHANGE_PIN",
  })
}

// ── loading ──────────────────────────────────────────────────────────────────

/** A proof amount the 4-byte slot field can hold: a whole number, 1..2^32-1. */
const MAX_PROOF_AMOUNT = 0xffffffff

/** What LOAD_PROOF writes: the piece, its date and, when present, the mint's DLEQ proof. */
export type LoadablePiece = {
  keysetId: string
  amount: number
  nonce: string
  C: string
  /** Locktime, seconds; 0 for none (the app's pieces are never dated). */
  date?: number
  /** NUT-12: e and s from the mint, r the blinding factor. All 32 bytes, hex. */
  dleq?: { e: string; s: string; r: string }
}

export type LoadResult =
  /** Stored in `slot`; `dleqKept` when the card kept the mint's proof beside it. */
  | { slot: number; dleqKept: boolean; alreadyOnCard?: false }
  /**
   * 6A94: a piece with this nonce is already in a slot, spent or not. Not an
   * error: a LOAD_PROOF whose answer was lost landed, and the next load finds
   * it this way.
   */
  | { alreadyOnCard: true }

/**
 * LOAD_PROOF: one piece, keyset (8 raw bytes, never ASCII) ‖ amount (4) ‖
 * nonce (32) ‖ C (33) ‖ date (4): 81 bytes. With the mint's DLEQ proof, P1 = 1
 * and e ‖ s ‖ r after it: 177 bytes, and the card answers the slot and whether
 * it kept the proof. Needs the PIN verified in this tap, or the owner's grant
 * (ALLOW_LOAD), or a card with no PIN; an owner; and a record.
 *
 * Every field is checked before an APDU is built: `>>>` would wrap an amount
 * past 2^32 without a word, and a non-hex digit parses as NaN, which reaches
 * the card as 0x00. Either way the slot would hold a proof the mint rejects.
 * Never retried: a replay of one that landed answers 6A94, which is how the
 * next tap learns it landed (`alreadyOnCard`).
 */
export async function loadProof(
  transceive: Transceiver,
  piece: LoadablePiece,
): Promise<LoadResult> {
  const { amount, date = 0, dleq } = piece
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PROOF_AMOUNT) {
    throw new CardProtocolError(
      `LOAD_PROOF: amount must be a whole number from 1 to ${MAX_PROOF_AMOUNT}, got ${amount}`,
    )
  }
  const data = [
    ...hexBytes(piece.keysetId, 8, "LOAD_PROOF: keyset id"),
    ...u32(amount, "LOAD_PROOF: amount"),
    ...hexBytes(piece.nonce, 32, "LOAD_PROOF: nonce"),
    ...hexBytes(piece.C, 33, "LOAD_PROOF: C"),
    ...u32(date, "LOAD_PROOF: date"),
  ]
  if (dleq) {
    data.push(
      ...hexBytes(dleq.e, 32, "LOAD_PROOF: dleq e"),
      ...hexBytes(dleq.s, 32, "LOAD_PROOF: dleq s"),
      ...hexBytes(dleq.r, 32, "LOAD_PROOF: dleq r"),
    )
  }
  const response = await transceive(
    buildApdu(INS.LOAD_PROOF, {
      p1: dleq ? 0x01 : 0x00,
      data,
      le: dleq ? 0x02 : 0x01,
    }),
  )
  if (statusWordOf(response) === SW_ALREADY_ON_CARD) return { alreadyOnCard: true }
  const body = parseResponse(response, "LOAD_PROOF")
  if (body.length !== (dleq ? 2 : 1)) {
    throw new CardProtocolError(
      `LOAD_PROOF: expected ${dleq ? 2 : 1} bytes, got ${body.length}`,
    )
  }
  return { slot: body[0], dleqKept: dleq ? body[1] === 1 : false }
}

/**
 * CLEAR_SPENT: free every spent slot on the card, resolving to how many the
 * card freed. On the wire `B0 31 00 00 01`. The PIN if one is set, or a grant.
 *
 * ⚠️ A spent slot is owed until it settles at the mint: clearing it before
 * then destroys the only record of a burn whose signature never left the
 * card. This sends the command and nothing more; deciding that every spent
 * slot may go is `reclaimSpentSlots` (cashu-card-topup/engine), which asks the
 * mint (NUT-07) about each one first. Nothing else in this app sends it.
 *
 * The applet zeroes a slot's data before it marks the slot empty (D14), so a
 * tap cut short here leaves a slot still `02` with some fields zeroed:
 * `isProofShaped` tells such a remnant from a proof.
 */
export async function clearSpent(transceive: Transceiver): Promise<number> {
  const body = await send(transceive, INS.CLEAR_SPENT, {
    le: 0x01,
    context: "CLEAR_SPENT",
  })
  if (body.length !== 1) {
    throw new CardProtocolError(
      `CLEAR_SPENT: expected a 1-byte count, got ${body.length}`,
    )
  }
  return body[0]
}

// ── reading slots ────────────────────────────────────────────────────────────

export type SlotStatus = "empty" | "unspent" | "spent"

const statusOf = (b: number, command: string): SlotStatus => {
  if (b === 0x00) return "empty"
  if (b === 0x01) return "unspent"
  if (b === 0x02) return "spent"
  throw new CardProtocolError(`${command}: unknown status byte 0x${b.toString(16)}`)
}

/**
 * Bulk status read: one byte per slot (0=empty, 1=unspent, 2=spent), so a
 * reader can find what to read without pulling all 128 proofs. `count` is
 * also the Le: the card returns exactly one byte per slot, 128 on 2.0.
 */
export async function getSlotStatuses(
  transceive: Transceiver,
  count: number,
): Promise<SlotStatus[]> {
  if (count <= 0 || count > 0xff) {
    throw new CardProtocolError(`GET_SLOT_STATUS: invalid count ${count}`)
  }
  const body = await send(transceive, INS.GET_SLOT_STATUS, {
    le: count,
    context: `GET_SLOT_STATUS (${count} slots)`,
  })
  if (body.length !== count) {
    throw new CardProtocolError(
      `GET_SLOT_STATUS: expected ${count} bytes, got ${body.length}`,
    )
  }
  return body.map((b) => statusOf(b, "GET_SLOT_STATUS"))
}

/** One proof slot as the card returns it, hex-encoded. */
export interface CardProofSlot {
  slot: number
  status: "unspent" | "spent"
  /** NUT-02 keyset id's first 8 bytes — 16 hex chars, decoded from RAW bytes, never ASCII. */
  keysetId: string
  amount: number
  /**
   * The 32-byte P2PK nonce. NOT the secret — the secret is the format-4 text
   * rebuilt from nonce + card pubkey + date (`buildCardP2PKSecret`), and the
   * card never returns it.
   */
  nonce: string
  /** The mint's unblinded signature, 33 bytes compressed. */
  C: string
  /** The piece's locktime, seconds; 0 for none. */
  date: number
}

/** The 81 bytes after a slot's status (GET_PROOF from byte 1, GET_PIECES entries). */
const slotFields = (
  slot: number,
  status: CardProofSlot["status"],
  data: number[],
): CardProofSlot => ({
  slot,
  status,
  keysetId: toHex(data.slice(0, 8)),
  amount: readU32(data, 8),
  nonce: toHex(data.slice(12, 44)),
  C: toHex(data.slice(44, 77)),
  date: readU32(data, 77),
})

/**
 * Read one proof slot. Spent slots are still readable — only an empty slot is
 * refused — which is what makes a failed settlement recoverable.
 */
export async function getProof(
  transceive: Transceiver,
  slot: number,
): Promise<CardProofSlot> {
  const body = await send(transceive, INS.GET_PROOF, {
    p1: slot,
    le: PROOF_SIZE,
    context: `GET_PROOF slot ${slot}`,
  })
  if (body.length !== PROOF_SIZE) {
    throw new CardProtocolError(
      `GET_PROOF slot ${slot}: expected ${PROOF_SIZE} bytes, got ${body.length}`,
    )
  }
  const status = statusOf(body[0], `GET_PROOF slot ${slot}`)
  if (status === "empty") {
    throw new CardProtocolError(`GET_PROOF slot ${slot}: unknown status byte 0x0`)
  }
  return slotFields(slot, status, body.slice(1))
}

/** One GET_PIECES page: the occupied slots it covers, and the first slot it does not. */
export type PiecesPage = {
  /** The first slot this page does not cover; `MAX_SLOTS` at the end. */
  next: number
  /** Each unspent slot in range, whole. */
  unspent: CardProofSlot[]
  /** Each spent slot in range, by number only: GET_PIECES carries no data for one. */
  spent: number[]
}

/**
 * GET_PIECES, P2 = 00: one page from slot `first`, at most 255 bytes. The
 * first byte is the first slot the page does not cover; then, for each
 * occupied slot in range, a tag (the slot, with 0x80 where it is spent) and,
 * for an unspent one, its 81 bytes after the status.
 */
export async function getPieces(
  transceive: Transceiver,
  first: number,
): Promise<PiecesPage> {
  const body = await send(transceive, INS.GET_PIECES, {
    p1: first,
    le: 0x00,
    context: `GET_PIECES from ${first}`,
  })
  if (body.length < 1) throw new CardProtocolError("GET_PIECES: an empty page")
  const next = body[0]
  if (next <= first || next > MAX_SLOTS) {
    throw new CardProtocolError(`GET_PIECES from ${first}: the page ends at ${next}`)
  }
  const unspent: CardProofSlot[] = []
  const spent: number[] = []
  let at = 1
  while (at < body.length) {
    const tag = body[at]
    const slot = tag & 0x7f
    if (slot < first || slot >= next) {
      throw new CardProtocolError(
        `GET_PIECES from ${first}: slot ${slot} out of the page`,
      )
    }
    at += 1
    if (tag & 0x80) {
      spent.push(slot)
    } else {
      if (at + PIECE_SIZE > body.length) {
        throw new CardProtocolError(`GET_PIECES from ${first}: slot ${slot} cut short`)
      }
      unspent.push(slotFields(slot, "unspent", body.slice(at, at + PIECE_SIZE)))
      at += PIECE_SIZE
    }
  }
  return { next, unspent, spent }
}

const ALL_ZERO_HEX = /^0+$/

/**
 * Whether a slot's data is a proof at all: the card file's slot checks
 * (cashu-javacard spec/CARD-FILE.md, "Slot"). The amount is a positive power
 * of two the 4-byte field can hold (a mint keyset has no key for 3), `C` is a
 * compressed point on secp256k1 (a prefix check alone passes half of all
 * random bytes), and neither the nonce nor the keyset id is all zero.
 *
 * What fails these is a CLEAR_SPENT remnant: the applet zeroes a spent slot's
 * data before it marks the slot empty, so a tap cut short there leaves a slot
 * still `02` whose data is not a proof. A remnant owes nothing at the mint. A
 * tear that zeroed only part of `C` whose x still lands on the curve passes;
 * the mint, asked about the Y such a slot rebuilds, has never seen it
 * (UNSPENT), which blocks a reclaim rather than clearing a slot the checks
 * cannot vouch for.
 */
export function isProofShaped(
  slot: Pick<CardProofSlot, "keysetId" | "amount" | "nonce" | "C">,
): boolean {
  const { amount } = slot
  // `n & (n - 1)` clears the lowest set bit: zero only for a power of two.
  // Bitwise ops work on int32, which still answers right up to 2^32 - 1.
  if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > MAX_PROOF_AMOUNT ||
    (amount & (amount - 1)) !== 0
  ) {
    return false
  }
  if (ALL_ZERO_HEX.test(slot.nonce) || ALL_ZERO_HEX.test(slot.keysetId)) return false
  try {
    secp256k1.ProjectivePoint.fromHex(slot.C)
  } catch {
    return false
  }
  return true
}

/** The unspent value on a card under one mint keyset. */
export type CardKeysetTotal = {
  /** The keyset id as the slot stores it: its first 8 bytes, 16 hex chars. */
  keysetId: string
  /** Sum of the unspent proofs minted under it, in that keyset's unit. */
  amount: number
}

/** Unspent proofs summed per keyset, in the order their first proof sits on the card. */
const totalsByKeyset = (proofs: readonly CardProofSlot[]): CardKeysetTotal[] => {
  const totals = new Map<string, number>()
  proofs.forEach((proof) => {
    if (proof.status === "unspent") {
      totals.set(proof.keysetId, (totals.get(proof.keysetId) ?? 0) + proof.amount)
    }
  })
  return [...totals].map(([keysetId, amount]) => ({ keysetId, amount }))
}

/** Every occupied slot on a card: the unspent value per keyset, and the spent slots as they are. */
export type CardSlotRead = {
  keysets: CardKeysetTotal[]
  /**
   * The spent slots, in slot order, data and all. A spent slot is owed until
   * the mint has settled it (NUT-07 SPENT), and only then may CLEAR_SPENT
   * free it: these are what the top-up asks the mint about before its load
   * tap (`reclaimVerdicts`). A CLEAR_SPENT remnant (`isProofShaped` false)
   * is listed too; it owes nothing.
   */
  spentSlots: CardProofSlot[]
}

/**
 * What the card holds, page by page: GET_PIECES from slot 0 until the page
 * that ends at 128, which carries every unspent piece whole (three to a page),
 * then GET_PROOF for each spent slot it names, whose data GET_PIECES leaves
 * out. Reads only; nothing is spent or cleared.
 */
export async function readCardSlots(transceive: Transceiver): Promise<CardSlotRead> {
  const unspent: CardProofSlot[] = []
  const spentNumbers: number[] = []
  let first = 0
  while (first < MAX_SLOTS) {
    // One APDU at a time: an IsoDep channel carries a single exchange.
    const page = await getPieces(transceive, first)
    unspent.push(...page.unspent)
    spentNumbers.push(...page.spent)
    first = page.next
  }
  const spentSlots: CardProofSlot[] = []
  for (const slot of spentNumbers) {
    const proof = await getProof(transceive, slot)
    // Read twice, by two commands: a slot the page called spent and the proof
    // another way is counted as neither.
    if (proof.status === "spent") spentSlots.push(proof)
  }
  return { keysets: totalsByKeyset(unspent), spentSlots }
}

/**
 * What the card holds, keyset by keyset: `readCardSlots`' unspent split. The
 * card stores a keyset id per proof and no unit at all, and its GET_BALANCE
 * adds every keyset together; the mint's keyset list is what turns these into
 * amounts in a unit (`app/utils/cashu-mint.ts`). Reads only.
 */
export async function getUnspentByKeyset(
  transceive: Transceiver,
): Promise<CardKeysetTotal[]> {
  return (await readCardSlots(transceive)).keysets
}

/** An error's class name, plus the status word when the card refused. */
const failureLabel = (error: unknown): string => {
  if (error instanceof CardError) return `${error.name} ${swLabel(error.sw)}`
  return error instanceof Error ? error.name : typeof error
}

/**
 * The balance split by keyset and the spent slots, best effort. The split
 * exists only to name units, and the spent slots only to be asked about at the
 * mint before a top-up's load tap; together they cost a GET_PIECES per page
 * plus a GET_PROOF per spent slot, each a chance for the card to leave the
 * field. Once GET_BALANCE has answered, losing them must not lose the read, so
 * any failure here resolves undefined and the caller shows the total as
 * "unit unknown". Only an error name and a status word are logged.
 */
export const readKeysetSplit = async (
  transceive: Transceiver,
  info: Pick<CardInfo, "unspent" | "spent">,
): Promise<CardSlotRead | undefined> => {
  if (info.unspent === 0 && info.spent === 0) return { keysets: [], spentSlots: [] }
  try {
    return await readCardSlots(transceive)
  } catch (error) {
    console.warn(`Cashu card keyset split skipped: ${failureLabel(error)}`)
    return undefined
  }
}

// ── the record and the clock ─────────────────────────────────────────────────

/** GET_CARD: the card's record and its clock's bookkeeping (spec/APDU.md, GET_CARD). */
export type CardRecord = {
  format: number
  recordSet: boolean
  /** The record's unit byte: 0 is sat. */
  unit: number
  dailyLimit: number
  /** The refund key, hex, or undefined for none (33 zeros). */
  refundKey?: string
  /** The hash of the last header taken, as Bitcoin shows a block hash. */
  lastHeader: string
  /** How often the day's window has rolled since the owner's last REFRESH. */
  rolls: number
  /** How often it may roll between REFRESHes: 1 to 30; the card's 0 is the default, 7. */
  rollBudget: number
  /** The no-PIN allowance may begin again at the next roll. */
  allowanceArmed: boolean
  /** The mint the card was set up for. */
  mint: string
}

/** The rollover budget a card holds until the owner sets another (D20). */
export const ROLL_BUDGET_DEFAULT = 7
export const ROLL_BUDGET_MOST = 30

export function parseCardRecord(body: number[]): CardRecord {
  if (body.length < 106) {
    throw new CardProtocolError(
      `GET_CARD: expected at least 106 bytes, got ${body.length}`,
    )
  }
  const mintLength = body[105]
  if (mintLength > RECORD_MINT_MAX || body.length < 106 + mintLength) {
    throw new CardProtocolError("GET_CARD: the mint runs past the answer")
  }
  const refund = body.slice(7, 40)
  return {
    format: body[0],
    recordSet: body[1] === 1,
    unit: body[2],
    dailyLimit: readU32(body, 3),
    refundKey: refund.every((b) => b === 0) ? undefined : toHex(refund),
    lastHeader: toHex(body.slice(44, 76)),
    rolls: body[76],
    rollBudget: body[77] || ROLL_BUDGET_DEFAULT,
    allowanceArmed: body[78] === 1,
    mint: String.fromCharCode(...body.slice(106, 106 + mintLength)),
  }
}

export async function getCardRecord(transceive: Transceiver): Promise<CardRecord> {
  return parseCardRecord(
    await send(transceive, INS.GET_CARD, { le: 0x00, context: "GET_CARD" }),
  )
}

/**
 * SET_CARD's record: unit (1) ‖ refund key (33, zeros for none) ‖ 65 bytes not
 * read ‖ mint length (1) ‖ mint. The app's pieces carry no date, so its cards
 * take no refund key.
 */
export const cardRecordValue = ({ mint }: { mint: string }): number[] => {
  if (mint.length < 1 || mint.length > RECORD_MINT_MAX || !/^[\x20-\x7e]+$/.test(mint)) {
    throw new CardProtocolError(
      `SET_CARD: a mint is 1 to ${RECORD_MINT_MAX} printable ASCII characters`,
    )
  }
  return [
    0x00,
    ...new Array(33).fill(0),
    ...new Array(65).fill(0),
    mint.length,
    ...Array.from(mint, (c) => c.charCodeAt(0)),
  ]
}

/**
 * SET_CARD on an open card (no owner): the record, with the PIN verified in
 * this tap when the card has one. An owned card takes it only with the
 * owner's proof (`cashu-card-owner.ts`). Only with nothing unspent (`6A8D`).
 */
export async function setOpenCardRecord(
  transceive: Transceiver,
  record: { mint: string },
): Promise<void> {
  await send(transceive, INS.SET_CARD, {
    data: cardRecordValue(record),
    context: "SET_CARD",
  })
}

/** The card's `now` as SET_HEADER and REFRESH answer it. */
const parseNow = (body: number[], context: string): number => {
  if (body.length !== 4) {
    throw new CardProtocolError(`${context}: expected 4 bytes, got ${body.length}`)
  }
  return readU32(body, 0)
}

/**
 * SET_HEADER: a Bitcoin block header (80 bytes, as the network carries it).
 * No PIN, no owner. Resolves the card's `now` after it: later when the
 * header's time is, the same when the header is older. `6A93` for too little
 * work.
 */
export async function setHeader(
  transceive: Transceiver,
  header: number[],
): Promise<number> {
  if (header.length !== HEADER_SIZE) {
    throw new CardProtocolError(`SET_HEADER: a header is ${HEADER_SIZE} bytes`)
  }
  return parseNow(
    await send(transceive, INS.SET_HEADER, {
      data: header,
      le: 0x04,
      context: "SET_HEADER",
    }),
    "SET_HEADER",
  )
}

/** TELL_TIME: the phone's clock, seconds, a note for this tap's log. Trusted for nothing. */
export async function tellTime(transceive: Transceiver, seconds: number): Promise<void> {
  await send(transceive, INS.TELL_TIME, {
    data: u32(Math.floor(seconds), "TELL_TIME"),
    context: "TELL_TIME",
  })
}

export const parseRefreshNow = (body: number[]) => parseNow(body, "REFRESH")

// ── a read ───────────────────────────────────────────────────────────────────

/** What a tap learns about a Cashu card without changing anything on it. */
export interface CashuCardInfo extends CardInfo {
  /** Hex, 33-byte compressed — the card's P2PK identity and its stable id. */
  pubkey: string
  /** GET_BALANCE: every unspent proof, whatever its keyset. See `getBalance`. */
  balance: number
  /** GET_CARD: the mint the card was set up for, and its clock's bookkeeping. */
  record: CardRecord
  /**
   * The same unspent value split by keyset; empty for an empty card.
   * Undefined when the split could not be read this tap (the card left the
   * field partway through, or refused a slot read): `balance` still stands,
   * it just cannot be put in a unit, so a screen shows it as "unit unknown".
   */
  keysets?: CardKeysetTotal[]
  /**
   * The card's spent slots, read with the split (`CardSlotRead.spentSlots`),
   * and undefined whenever `keysets` is: the next top-up asks the mint about
   * them before its load tap, and frees the settled ones.
   */
  spentSlots?: CardProofSlot[]
}

/**
 * The read round-trip over an open IsoDep channel:
 * SELECT → GET_INFO (P1 = 1) → GET_PUBKEY → AUTH → GET_CARD → [`afterAuth`:
 * the clock and the owner] → [GET_CARD, and GET_INFO, again when
 * `afterAuth` changed the card; GET_INFO again under the owner's grant] → GET_BALANCE, then the slots (GET_PIECES
 * pages, GET_PROOF per spent slot) when the card holds anything. Nothing but
 * `afterAuth` writes.
 *
 * AUTH runs before anything the card says about its value: a card that
 * cannot prove it holds the key it reported throws `CardAuthError`, and no
 * balance comes back. A card that needs an update throws
 * `CardNeedsUpdateError` from `selectApplet`, with nothing sent after it.
 *
 * Resolves null when the tag has no Cashu applet (6A82 to every Cashu
 * SELECT: an NTAG 424 BoltCard says this) so the caller can fall back to
 * other card types. Throws on a transport failure, and when GET_INFO,
 * GET_PUBKEY, GET_BALANCE or GET_CARD fails. The slot read after them is best
 * effort (`readKeysetSplit`): its failure leaves `keysets` and `spentSlots`
 * undefined.
 */
export type ReadOptions = {
  /**
   * Runs in the tap once the card has proved its key (AUTH) and said its
   * record (GET_CARD), before GET_BALANCE: the card's clock is fed here
   * (`feedHeader`), the owner's grant asked for, and an owner's phone
   * refreshes it. Best effort: it must not throw. Resolves what it changed,
   * so the read asks the card again rather than return what it said before.
   */
  afterAuth?: (tap: AuthenticatedTap) => Promise<ReadChanges | undefined>
}

/** What `ReadOptions.afterAuth` changed on the card. */
export type ReadChanges = {
  /**
   * The card's clock moved (SET_HEADER, or REFRESH, took a newer header):
   * GET_INFO (`now` and what it reports against it) and GET_CARD (the last
   * header taken) are read again, as Foxy's `cardClock` re-reads GET_INFO.
   */
  clockMoved?: boolean
  /** REFRESH succeeded: the roll count is 0 now. GET_CARD is read again. */
  refreshed?: boolean
  /**
   * The owner's grant (ALLOW_LOAD) is live for the rest of the tap: GET_INFO
   * is read again, so its `paymentLimit` is the card's own limit on one
   * payment, which the card says only under the grant (GET_INFO bytes 30-33).
   */
  granted?: boolean
}

/** What a read tap knows once the card has proved its key: `ReadOptions.afterAuth`. */
export type AuthenticatedTap = {
  transceive: Transceiver
  info: CardInfo
  pubkey: string
  record: CardRecord
}

export const readCashuCard = async (
  transceive: Transceiver,
  { afterAuth }: ReadOptions = {},
): Promise<CashuCardInfo | null> => {
  try {
    await selectApplet(transceive)
  } catch (error) {
    // Only a tag whose runtime said 6A82 to every Cashu AID gets here.
    if (error instanceof AppletNotSelectedError) return null
    throw error
  }
  const read = await getInfo(transceive)
  const pubkeyBytes = await getPubkey(transceive)
  const pubkey = toHex(pubkeyBytes)
  await authenticateCard(transceive, pubkeyBytes)
  const recordRead = await getCardRecord(transceive)
  const changes = afterAuth
    ? await afterAuth({ transceive, info: read, pubkey, record: recordRead })
    : undefined
  // What the card said before a write in this tap is stale after it
  // (cashu-javacard spec/APDU.md, SET_HEADER, REFRESH and GET_CARD): a
  // REFRESH set the roll count to 0, a header taken changed the record's last
  // header, and a clock that moved changed what GET_INFO reports against it.
  // Under the owner's grant GET_INFO also says the limit on one payment, as
  // Foxy asks it again once it knows the phone is the owner.
  const info = changes?.clockMoved || changes?.granted ? await getInfo(transceive) : read
  const record =
    changes?.clockMoved || changes?.refreshed
      ? await getCardRecord(transceive)
      : recordRead
  const balance = await getBalance(transceive)
  const slots = await readKeysetSplit(transceive, info)
  return {
    ...info,
    pubkey,
    balance,
    record,
    keysets: slots?.keysets,
    spentSlots: slots?.spentSlots,
  }
}
