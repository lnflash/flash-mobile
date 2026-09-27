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
 * Ported from flash-pos `src/services/cashuCard.ts` so both apps speak
 * byte-identical APDUs to the same card. Command reference: cashu-javacard
 * `spec/APDU.md`; reference host driver `tools/cardctl/cardctl.py`.
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
  VERIFY_PIN: 0x40,
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
 * response, a wrong-length body.
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
  if (data && data.length > 0) {
    // Short-form Lc is a single byte. Without this guard a 300-byte payload
    // pushes `300`, which the native bridge truncates to 0x2c — a silently
    // corrupt length on the wire, on exactly the commands that move money.
    if (data.length > 255) {
      throw new CardProtocolError(
        `APDU data too long for short Lc: ${data.length} bytes (max 255)`,
      )
    }
    apdu.push(data.length, ...data)
  }
  if (le !== undefined) {
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
   * GET_INFO byte 7. There is no capability bit for "PIN-gated spend"; this is
   * how a reader learns whether SPEND/LOAD will demand VERIFY_PIN (D13).
   * `blocked` is terminal today — no unblock path exists (ENG-617).
   */
  pinState: CardPinState
}

/**
 * SELECT the applet: 7-byte package AID first (prefix match, what cardctl
 * does), then the full applet AID for runtimes that decline partial matches.
 * Resolves to the body SELECT returns (the 2-byte applet version).
 */
export async function selectApplet(transceive: Transceiver): Promise<number[]> {
  let lastError: unknown
  for (const aid of [CASHU_AID, CASHU_APPLET_AID]) {
    try {
      return parseResponse(await transceive(buildSelectApdu(aid)), "SELECT")
    } catch (error) {
      // Only "applet not found" earns a second attempt. A transport failure —
      // the card left the field mid-SELECT — must surface as itself; retrying
      // on a dead handle would report a card that moved as a card running the
      // wrong software.
      if (!(error instanceof CardError) || error.sw !== SW_FILE_NOT_FOUND) {
        throw error
      }
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new CardError(SW_FILE_NOT_FOUND, "SELECT")
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
 * Sum of unspent proof amounts on the card, in the unit of the keyset the
 * proofs were minted under — the card does not know the unit. Advisory only:
 * SIGN_ARBITRARY can witness a proof without burning its slot, so reconcile
 * against the mint (NUT-07) before trusting it for money decisions.
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
 * VERIFY_PIN within the current session. Resolves on success; a wrong PIN
 * rejects with the card's `63CX` (tries remaining), a blocked PIN with `6983`,
 * an unset PIN with `6984`. The session flag clears on deselect — every tap
 * that spends or loads re-verifies.
 */
export async function verifyCardPin(transceive: Transceiver, pin: string): Promise<void> {
  const data = Array.from(pin).map((c) => c.charCodeAt(0))
  await send(transceive, INS.VERIFY_PIN, { data, context: "VERIFY_PIN" })
}

const hexToBytes = (hex: string): number[] =>
  (hex.match(/../g) ?? []).map((h) => parseInt(h, 16))

/**
 * LOAD_PROOF: store a proof (keyset + amount + nonce + C) into the next free
 * slot; resolves to that slot's index. Wire format mirrors cardctl: 8-byte
 * keyset id (raw, never ASCII — ASCII stores half an id and strands the funds),
 * 4-byte big-endian amount, 32-byte nonce, 33-byte C. PIN-gated when set.
 */
export async function loadProof(
  transceive: Transceiver,
  proof: { keysetId: string; amount: number; nonce: string; C: string },
): Promise<number> {
  if (proof.keysetId.length !== 16) {
    throw new CardProtocolError(
      `LOAD_PROOF: keyset id must be 16 hex chars, got ${proof.keysetId.length}`,
    )
  }
  const nonceBytes = hexToBytes(proof.nonce)
  const cBytes = hexToBytes(proof.C)
  if (nonceBytes.length !== 32 || cBytes.length !== 33) {
    throw new CardProtocolError(
      `LOAD_PROOF: expected 32-byte nonce and 33-byte C, got ${nonceBytes.length}/${cBytes.length}`,
    )
  }
  const { amount } = proof
  const data = [
    ...hexToBytes(proof.keysetId),
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

export const toHex = (bytes: number[]): string =>
  bytes.map((b) => b.toString(16).padStart(2, "0")).join("")

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
  /** Sum of unspent proofs, in the proofs' keyset unit. See `getBalance`. */
  balance: number
}

/**
 * The read-only round-trip over an open IsoDep channel:
 * SELECT → GET_INFO → GET_PUBKEY → GET_BALANCE.
 *
 * Resolves null when the tag refuses both SELECT forms so the caller can fall
 * back to other card types: quietly for 6A82 (no such applet — an NTAG 424
 * BoltCard says this), with a warning for any other status word (6999: the
 * applet's select() failed; 6283/6A81: a locked instance), which a silent null
 * would misreport as "not a Cashu card". A status word carries no secret, so
 * it can be logged. Throws on genuine failures once the applet is selected.
 */
export const readCashuCard = async (
  transceive: Transceiver,
): Promise<CashuCardInfo | null> => {
  const packageSw = statusWordOf(await transceive(buildSelectApdu(CASHU_AID)))
  const appletSw =
    packageSw === SW_OK
      ? SW_OK
      : statusWordOf(await transceive(buildSelectApdu(CASHU_APPLET_AID)))
  if (appletSw !== SW_OK) {
    if (packageSw !== SW_FILE_NOT_FOUND || appletSw !== SW_FILE_NOT_FOUND) {
      const refused = `package AID ${hex16(packageSw)}, applet AID ${hex16(appletSw)}`
      console.warn(`Cashu applet SELECT refused: ${refused}`)
    }
    return null
  }
  const info = await getInfo(transceive)
  const pubkey = toHex(await getPubkey(transceive))
  const balance = await getBalance(transceive)
  return { ...info, pubkey, balance }
}
