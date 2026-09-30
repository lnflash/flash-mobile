/* eslint-disable no-bitwise -- this module is a byte-level APDU codec; masking
   and shifting is the work, not an accident. */
/**
 * Cashu NFC card — APDU protocol layer (ENG-616).
 *
 * Talks to the cashu-javacard applet (https://github.com/lnflash/cashu-javacard),
 * NUT-XX Profile B: an offline bearer card that holds ecash proofs and signs
 * BIP-340 Schnorr witnesses to unlock them.
 *
 * Deliberately transport-agnostic: it builds and parses APDUs and knows nothing
 * about NFC, so the whole protocol is unit-testable without a card. The
 * IsoDep transport is the one shared session in `app/contexts/Flashcard.tsx`.
 *
 * Ported from flash-pos `src/services/cashuCard.ts`. Every command the two
 * share is built byte for byte the same (GET_PROOF_COUNT, which flash-pos never
 * sends, follows spec/APDU.md). The one deliberate divergence is when the
 * fallback SELECT goes out: see `selectApplet`. Command reference:
 * cashu-javacard `spec/APDU.md`; reference host driver `tools/cardctl/cardctl.py`.
 */

/** 7-byte package AID. SELECT does prefix matching, so this also finds the applet. */
export const CASHU_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]
/** 8-byte applet-instance AID, the fallback when prefix selection is unsupported. */
export const CASHU_APPLET_AID = [...CASHU_AID, 0x01]

const CLA = 0xb0
const SW_OK = 0x9000
/** ISO 7816-4 "file or application not found": the tag has no such applet. */
const SW_FILE_NOT_FOUND = 0x6a82

/**
 * One proof slot, in bytes: status[1] + keyset_id[8] + amount[4] + nonce[32]
 * + C[33]. See spec/APDU.md in lnflash/cashu-javacard.
 */
export const PROOF_SIZE = 78

export const INS = {
  GET_INFO: 0x01,
  GET_PUBKEY: 0x10,
  GET_BALANCE: 0x11,
  GET_PROOF_COUNT: 0x12,
  GET_PROOF: 0x13,
  GET_SLOT_STATUS: 0x14,
  SPEND_PROOF: 0x20,
  LOAD_PROOF: 0x30,
  CLEAR_SPENT: 0x31,
  VERIFY_PIN: 0x40,
  SET_PIN: 0x41,
  CHANGE_PIN: 0x42,
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

const hex16 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0")

/** A status word for a log line; -1 (see `statusWordOf`) has none to show. */
const swLabel = (sw: number) => (sw < 0 ? "none" : hex16(sw))

/**
 * Known status words. The applet reuses the ISO 7816 space, so a bare hex code
 * is close to useless in a log — name the ones we can. `63CX` carries the PIN
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
      return "PIN required"
    case 0x6983:
      return "PIN blocked"
    case 0x6984:
      return "no PIN set"
    case 0x6985:
      return "proof already spent"
    case 0x6986:
      return "card is locked against writes"
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
 */
export const buildSelectApdu = (aid: number[] = CASHU_AID): number[] => [
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

async function send(
  transceive: Transceiver,
  ins: number,
  opts: Parameters<typeof buildApdu>[1] & { context: string },
): Promise<number[]> {
  const { context, ...apduOpts } = opts
  return parseResponse(await transceive(buildApdu(ins, apduOpts)), context)
}

export type CardPinState = "unset" | "set" | "blocked" | "unknown"

export interface CardInfo {
  version: string
  maxSlots: number
  unspent: number
  spent: number
  empty: number
  secp256k1Native: boolean
  schnorr: boolean
  /**
   * GET_INFO byte 7: 0 unset, 1 set, 2 blocked (spec/APDU.md:58); `unknown`
   * for any other value.
   *
   * It names the PIN's state; it does NOT tell a reader whether SPEND will
   * demand VERIFY_PIN (ENG-615). On applet v0.2.0 the gate fires only for
   * state 1 (`requirePinIfSet`, CashuApplet.java@v0.2.0:587-591), and the
   * third wrong VERIFY_PIN moves the card to state 2 (:517-521). From then on
   * SPEND_PROOF and SIGN_ARBITRARY (:419, :446), LOAD_PROOF and CLEAR_SPENT all
   * run with no PIN: a `blocked` card spends for whoever holds it, and a `set`
   * PIN is three wrong guesses away from off. `blockedPinGatesSpend` says which
   * versions are known to behave; none yet. Nothing unblocks a PIN (ENG-617).
   * A screen must not present either state as protection on any other version.
   */
  pinState: CardPinState
}

/**
 * Applet versions confirmed to keep refusing SPEND_PROOF and SIGN_ARBITRARY
 * once the PIN is blocked, i.e. versions carrying cashu-javacard#25 (ENG-615).
 * Empty on purpose: v0.2.0 does not, and the fix is not in a released,
 * silicon-verified applet yet. It is a list of confirmed versions rather than
 * a "newer than 0.2" comparison because a version this app has never seen is
 * exactly the case it cannot vouch for.
 */
const VERSIONS_WHERE_BLOCKED_PIN_GATES_SPEND: readonly string[] = []

/**
 * True only when `version` (GET_INFO's "major.minor") is confirmed to keep a
 * blocked card from spending. That is also the only case in which a set PIN
 * protects the balance: three wrong guesses then freeze the card instead of
 * switching the PIN check off. False means: treat a blocked card as spendable
 * by anyone holding it, and a set PIN as no obstacle to whoever holds the card.
 */
export const blockedPinGatesSpend = (version: string): boolean =>
  VERSIONS_WHERE_BLOCKED_PIN_GATES_SPEND.includes(version)

/**
 * Neither SELECT form selected the applet. Carries both status words (-1: the
 * response was too short to hold one): 6A82 to both is what a tag without the
 * applet says, an NTAG 424 BoltCard among them; anything else is a card that
 * knows the AID and still refused (6999: the applet's select() failed;
 * 6283/6A81: a locked instance). `sw` is the applet-AID answer, the last word
 * the card said.
 */
export class AppletNotSelectedError extends CardError {
  constructor(readonly packageSw: number, readonly appletSw: number) {
    super(appletSw, "SELECT")
    this.name = "AppletNotSelectedError"
    this.message = `SELECT failed: package AID ${swLabel(
      packageSw,
    )}, applet AID ${swLabel(appletSw)}`
  }

  /** Both forms answered 6A82: no Cashu applet on this tag at all. */
  get noSuchApplet(): boolean {
    return this.packageSw === SW_FILE_NOT_FOUND && this.appletSw === SW_FILE_NOT_FOUND
  }
}

/**
 * SELECT the applet: the 7-byte package AID first (prefix match), then the full
 * 8-byte applet AID after ANY refusal of the first. That is the spec's policy,
 * spec/APDU.md:26-27 ("the 7-byte form first, the 8-byte form as a fallback on
 * any error"), and what cardctl's `select()` does. flash-pos falls back only on
 * 6A82 (`src/services/cashuCard.ts:196-216`), so on a card that refuses the
 * package AID with any other status word this app sends one APDU more than the
 * terminal does: the applet-AID SELECT that flash-pos never tries.
 *
 * A transport failure (the card left the field) is not a refusal: it
 * propagates at once, with no second SELECT on a dead handle. A response too
 * short to carry a status word is treated like any other non-9000 answer.
 *
 * Resolves to the body SELECT returns (the 2-byte applet version); rejects
 * with `AppletNotSelectedError` when both forms are refused.
 */
export async function selectApplet(transceive: Transceiver): Promise<number[]> {
  const packageResponse = await transceive(buildSelectApdu(CASHU_AID))
  const packageSw = statusWordOf(packageResponse)
  if (packageSw === SW_OK) {
    return packageResponse.slice(0, -2)
  }
  const appletResponse = await transceive(buildSelectApdu(CASHU_APPLET_AID))
  const appletSw = statusWordOf(appletResponse)
  if (appletSw === SW_OK) {
    return appletResponse.slice(0, -2)
  }
  throw new AppletNotSelectedError(packageSw, appletSw)
}

export function parseInfo(body: number[]): CardInfo {
  if (body.length < 8) {
    throw new CardProtocolError(`GET_INFO: expected 8 bytes, got ${body.length}`)
  }
  const caps = body[6]
  const pinStates: Record<number, CardPinState> = { 0: "unset", 1: "set", 2: "blocked" }
  return {
    version: `${body[0]}.${body[1]}`,
    maxSlots: body[2],
    unspent: body[3],
    spent: body[4],
    empty: body[5],
    secp256k1Native: (caps & 0x01) !== 0,
    schnorr: (caps & 0x02) !== 0,
    pinState: pinStates[body[7]] ?? "unknown",
  }
}

export async function getInfo(transceive: Transceiver): Promise<CardInfo> {
  return parseInfo(
    await send(transceive, INS.GET_INFO, { le: 0x00, context: "GET_INFO" }),
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
  // uint32 big-endian. `|` yields a signed 32-bit int; `>>> 0` reinterprets it
  // as the uint32 the card sends, so a full card never reads negative.
  return ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]) >>> 0
}

/**
 * Sum of unspent proof amounts on the card, whatever keyset each proof was
 * minted under: the applet adds every unspent slot (CashuApplet.java@v0.2.0:
 * 364-377) and knows no units, so on its own this number has none. Pair it
 * with `getUnspentByKeyset` and the mint's keyset units before showing it.
 * Advisory only: SIGN_ARBITRARY can witness a proof without burning its slot,
 * so reconcile against the mint (NUT-07) before trusting it for money
 * decisions.
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

/** The applet's bounds on a PIN: VERIFY_PIN takes Lc 04–08 (spec/APDU.md). */
export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 8

/**
 * 4–8 ASCII digits. The applet accepts any 4–8 bytes, but a PIN is typed, and
 * a keypad can emit digits outside ASCII (an Arabic-Indic "٣" is U+0663; the
 * app ships `ar`). The bridge keeps only the low byte of each char code
 * (see `assertBytes`), so such a PIN would go out as unrelated bytes, fail, and
 * spend one of the card's three tries — the third blocks it, and on v0.2.0 a
 * blocked card spends for anyone (`CardInfo.pinState`). Refusing locally costs
 * nothing.
 */
export const isValidCardPin = (pin: string): boolean =>
  new RegExp(`^[0-9]{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin)

const pinBytes = (pin: string, command: string): number[] => {
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

/**
 * SET_PIN: once per card lifetime. Needs no authentication — the card ships
 * with no PIN, which is why setting one is the holder's first job — and
 * answers 6985 if one is already set. There is no way back to "no PIN".
 */
export async function setCardPin(transceive: Transceiver, pin: string): Promise<void> {
  await send(transceive, INS.SET_PIN, {
    data: pinBytes(pin, "SET_PIN"),
    context: "SET_PIN",
  })
}

/**
 * CHANGE_PIN: `oldLen ‖ old ‖ new`. The applet requires VERIFY_PIN in the same
 * session (6982 otherwise) and checks the old PIN again itself (63CX), so the
 * caller verifies first and both PINs travel in one tap.
 */
export async function changeCardPin(
  transceive: Transceiver,
  oldPin: string,
  newPin: string,
): Promise<void> {
  const oldBytes = pinBytes(oldPin, "CHANGE_PIN")
  const newBytes = pinBytes(newPin, "CHANGE_PIN")
  await send(transceive, INS.CHANGE_PIN, {
    data: [oldBytes.length, ...oldBytes, ...newBytes],
    context: "CHANGE_PIN",
  })
}

/**
 * VERIFY_PIN within the current session. Resolves on success; a wrong PIN
 * rejects with the card's `63CX` (tries remaining), a blocked PIN with `6983`,
 * an unset PIN with `6984`. A PIN that is not 4–8 ASCII digits is refused with
 * a `CardProtocolError` before any APDU is built, so it costs no try. The
 * session flag clears on deselect — every tap that spends or loads re-verifies.
 */
export async function verifyCardPin(transceive: Transceiver, pin: string): Promise<void> {
  await send(transceive, INS.VERIFY_PIN, {
    data: pinBytes(pin, "VERIFY_PIN"),
    context: "VERIFY_PIN",
  })
}

/** Exactly `length` bytes of hex, or a `CardProtocolError` naming the field. */
const hexField = (hex: string, length: number, field: string): number[] => {
  if (!new RegExp(`^[0-9a-fA-F]{${length * 2}}$`).test(hex)) {
    throw new CardProtocolError(
      `LOAD_PROOF: ${field} must be ${length * 2} hex chars (${length} bytes)`,
    )
  }
  return (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))
}

/** A proof amount the 4-byte slot field can hold: a whole number, 1..2^32-1. */
const MAX_PROOF_AMOUNT = 0xffffffff

/**
 * LOAD_PROOF: store a proof (keyset + amount + nonce + C) into the next free
 * slot; resolves to that slot's index. Wire format mirrors cardctl: 8-byte
 * keyset id (raw, never ASCII — ASCII stores half an id and strands the funds),
 * 4-byte big-endian amount, 32-byte nonce, 33-byte C. PIN-gated when set.
 *
 * Every field is checked before an APDU is built: `>>>` would wrap an amount
 * past 2^32 without a word, and a non-hex digit parses as NaN, which reaches
 * the card as 0x00. Either way the slot would hold a proof the mint rejects.
 */
export async function loadProof(
  transceive: Transceiver,
  proof: { keysetId: string; amount: number; nonce: string; C: string },
): Promise<number> {
  const { amount } = proof
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PROOF_AMOUNT) {
    throw new CardProtocolError(
      `LOAD_PROOF: amount must be a whole number from 1 to ${MAX_PROOF_AMOUNT}, got ${amount}`,
    )
  }
  const keysetBytes = hexField(proof.keysetId, 8, "keyset id")
  const nonceBytes = hexField(proof.nonce, 32, "nonce")
  const cBytes = hexField(proof.C, 33, "C")
  const data = [
    ...keysetBytes,
    (amount >>> 24) & 0xff,
    (amount >>> 16) & 0xff,
    (amount >>> 8) & 0xff,
    amount & 0xff,
    ...nonceBytes,
    ...cBytes,
  ]
  const body = await send(transceive, INS.LOAD_PROOF, {
    data,
    le: 0x01,
    context: "LOAD_PROOF",
  })
  if (body.length !== 1) {
    throw new CardProtocolError(`LOAD_PROOF: expected 1-byte slot, got ${body.length}`)
  }
  return body[0]
}

/**
 * CLEAR_SPENT: empty every spent slot so LOAD_PROOF can reuse it, and return
 * how many were freed. Gated like LOAD_PROOF (VERIFY_PIN first when a PIN is
 * set; 6982 otherwise); 6986 on a card locked by LOCK_CARD. A spent slot holds
 * nothing of value (the card burned it before it signed), so clearing one
 * loses nothing.
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

export type SlotStatus = "empty" | "unspent" | "spent"

/**
 * Bulk status read: one byte per slot (0=empty, 1=unspent, 2=spent), so a
 * reader can find spendable slots without pulling all 32 proofs. `count` is
 * also the Le — the card returns exactly one byte per slot.
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
  return body.map((b) => {
    if (b === 0x00) return "empty"
    if (b === 0x01) return "unspent"
    if (b === 0x02) return "spent"
    throw new CardProtocolError(
      `GET_SLOT_STATUS: unknown status byte 0x${b.toString(16)}`,
    )
  })
}

/**
 * Lower-case hex. Takes a Uint8Array too; `Array.from` because a Uint8Array's
 * own `map` would coerce each hex string back into a byte.
 */
export const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** One proof slot as the card returns it, hex-encoded. */
export interface CardProofSlot {
  slot: number
  status: "unspent" | "spent"
  /** NUT-02 keyset id — 16 hex chars, decoded from 8 RAW bytes, never ASCII. */
  keysetId: string
  amount: number
  /**
   * The 32-byte P2PK nonce. NOT the secret — the secret is ~150 bytes of JSON
   * rebuilt from nonce + card pubkey + fixed tags, and the card never returns
   * it. Whatever loaded the proof must keep the secret.
   */
  nonce: string
  /** The mint's unblinded signature, 33 bytes compressed. */
  C: string
}

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
  const status = body[0]
  if (status !== 0x01 && status !== 0x02) {
    throw new CardProtocolError(
      `GET_PROOF slot ${slot}: unknown status byte 0x${status.toString(16)}`,
    )
  }
  return {
    slot,
    status: status === 0x01 ? "unspent" : "spent",
    keysetId: toHex(body.slice(1, 9)),
    amount: ((body[9] << 24) | (body[10] << 16) | (body[11] << 8) | body[12]) >>> 0,
    nonce: toHex(body.slice(13, 45)),
    C: toHex(body.slice(45, 78)),
  }
}

/** The unspent value on a card under one mint keyset. */
export type CardKeysetTotal = {
  /** NUT-02 keyset id, 16 hex chars, as the slot stores it. */
  keysetId: string
  /** Sum of the unspent proofs minted under it, in that keyset's unit. */
  amount: number
}

/**
 * What the card holds, keyset by keyset: GET_SLOT_STATUS, then GET_PROOF for
 * each unspent slot — the same reads flash-pos plans a charge from. The card
 * stores a keyset id per proof and no unit at all, and its GET_BALANCE adds
 * every keyset together; the mint's keyset list is what turns these into
 * amounts in a unit (`app/utils/cashu-mint.ts`). Reads only; nothing is spent.
 * Keysets come back in the order their first proof sits on the card.
 */
export async function getUnspentByKeyset(
  transceive: Transceiver,
  slotCount: number,
): Promise<CardKeysetTotal[]> {
  const statuses = await getSlotStatuses(transceive, slotCount)
  const totals = new Map<string, number>()
  // One APDU at a time: an IsoDep channel carries a single exchange.
  for (const [slot, status] of statuses.entries()) {
    if (status === "unspent") {
      const proof = await getProof(transceive, slot)
      if (proof.status === "unspent") {
        totals.set(proof.keysetId, (totals.get(proof.keysetId) ?? 0) + proof.amount)
      }
    }
  }
  return [...totals].map(([keysetId, amount]) => ({ keysetId, amount }))
}

/**
 * Mark a slot spent and return the BIP-340 witness over `message`
 * (sha256 of the UTF-8 P2PK secret).
 *
 * ⚠️ Irreversible, and it burns the slot BEFORE it signs: if this throws,
 * assume the proof may already be spent. The card commits the flag first on
 * purpose, so yanking it mid-response cannot hand out a free witness. Callers
 * must durably record the intent before telling anyone the spend succeeded.
 * PIN-gated when set.
 */
export async function spendProof(
  transceive: Transceiver,
  slot: number,
  message: number[],
): Promise<number[]> {
  if (message.length !== 32) {
    throw new CardProtocolError(
      `SPEND_PROOF: message must be 32 bytes, got ${message.length}`,
    )
  }
  const sig = await send(transceive, INS.SPEND_PROOF, {
    p1: slot,
    data: message,
    le: 0x40,
    context: `SPEND_PROOF slot ${slot}`,
  })
  if (sig.length !== 64) {
    throw new CardProtocolError(
      `SPEND_PROOF: expected a 64-byte signature, got ${sig.length}`,
    )
  }
  return sig
}

/** What a tap learns about a Cashu card without changing anything on it. */
export interface CashuCardInfo extends CardInfo {
  /** Hex, 33-byte compressed — the card's P2PK identity and its stable id. */
  pubkey: string
  /** GET_BALANCE: every unspent proof, whatever its keyset. See `getBalance`. */
  balance: number
  /**
   * The same unspent value split by keyset; empty for an empty card.
   * Undefined when the split could not be read this tap (the card left the
   * field partway through, or refused a slot read): `balance` still stands,
   * it just cannot be put in a unit, so a screen shows it as "unit unknown".
   */
  keysets?: CardKeysetTotal[]
}

/** An error's class name, plus the status word when the card refused. */
const failureLabel = (error: unknown): string => {
  if (error instanceof CardError) return `${error.name} ${swLabel(error.sw)}`
  return error instanceof Error ? error.name : typeof error
}

/**
 * The balance split by keyset, best effort. It exists only to name units, and
 * it costs GET_SLOT_STATUS plus a GET_PROOF per unspent slot: up to 33 more
 * APDUs, each a chance for the card to leave the field. Once GET_BALANCE has
 * answered, losing the split must not lose the read, so any failure here
 * resolves undefined and the caller shows the total as "unit unknown". Only an
 * error name and a status word are logged.
 */
export const readKeysetSplit = async (
  transceive: Transceiver,
  info: CardInfo,
): Promise<CardKeysetTotal[] | undefined> => {
  if (info.unspent === 0) return []
  try {
    return await getUnspentByKeyset(transceive, info.maxSlots)
  } catch (error) {
    console.warn(`Cashu card keyset split skipped: ${failureLabel(error)}`)
    return undefined
  }
}

/**
 * The read-only round-trip over an open IsoDep channel:
 * SELECT → GET_INFO → GET_PUBKEY → GET_BALANCE, then GET_SLOT_STATUS and a
 * GET_PROOF per unspent slot when the card holds anything.
 *
 * Resolves null when the tag refuses both SELECT forms so the caller can fall
 * back to other card types: quietly when both say 6A82 (no such applet — an
 * NTAG 424 BoltCard says this), with a warning for any other status word
 * (6999: the applet's select() failed; 6283/6A81: a locked instance), which a
 * silent null would misreport as "not a Cashu card". A status word carries no
 * secret, so it can be logged. Throws on a transport failure during SELECT,
 * and when GET_INFO, GET_PUBKEY or GET_BALANCE fails, refused or dropped: the
 * same four reads, and the same failure surface, as flash-pos `readCard`
 * (src/services/cashuCard.ts:393-405). The keyset split after them is best
 * effort (`readKeysetSplit`): its failure leaves `keysets` undefined.
 */
export const readCashuCard = async (
  transceive: Transceiver,
): Promise<CashuCardInfo | null> => {
  try {
    await selectApplet(transceive)
  } catch (error) {
    if (!(error instanceof AppletNotSelectedError)) {
      throw error
    }
    if (!error.noSuchApplet) {
      const refused = `package AID ${swLabel(error.packageSw)}, applet AID ${swLabel(
        error.appletSw,
      )}`
      console.warn(`Cashu applet SELECT refused: ${refused}`)
    }
    return null
  }
  const info = await getInfo(transceive)
  const pubkey = toHex(await getPubkey(transceive))
  const balance = await getBalance(transceive)
  const keysets = await readKeysetSplit(transceive, info)
  return { ...info, pubkey, balance, keysets }
}
