/* eslint-disable no-bitwise -- the card's bytes, big-endian, as the applet lays them out */
/**
 * GET_OUTBOX (INS 1B, card protocol 2.2, ENG-819 / D175): the card's side of
 * the assisted-settlement relay, and the only file in the app that knows its
 * bytes (cashucard spec/APDU.md, GET_OUTBOX).
 *
 * - P1 = 00: the scope, 45 bytes (the index 1, the payment id 8, the
 *   generation 4, SHA-256 of the packet's body 32). No data.
 * - P1 = 01: a page, data = the offset (2, big-endian) and a count (1,
 *   01-FF); the answer is min(count, total - offset) bytes of body ‖
 *   descriptor. The count is in the data, not in Le.
 * - 6A88: no record. 6A83: an offset at or past the end. 6700: a bad Lc.
 *   6A86: a bad P1/P2. A 2.1 card answers 6D00.
 *
 * Public: no PIN and no owner grant. Nothing here is sent to a card that
 * does not say 2.2 or later at SELECT (`supportsOutbox`), so a 2.1 card
 * never sees INS 1B.
 *
 * How a packet is bound to the tapped card: the engine (`relay.js`
 * decodePacket) refuses a packet whose card key, installation or mint is
 * not the policy's. The card key is the tap's own GET_PUBKEY answer (the
 * caller's), never the packet's. The installation (32 random bytes drawn
 * when the applet was installed) is read from the packet's own header,
 * offset 40, before decodePacket: there is no other source for it, and the
 * packet's two BIP-340 signatures by the tapped card's key (the witness and
 * the descriptor over the whole body, installation included) are what bind
 * it. The mint is the packet's own string, admitted only when it is a mint
 * this app already knows (`knownRelayMint`).
 */
import {
  CardError,
  CardProtocolError,
  INS,
  PROTOCOL_MAJOR,
  Transceiver,
  buildApdu,
  statusWordOf,
  toHex,
} from "../cashu-card"

/** The first minor of major 2 that answers GET_OUTBOX. */
export const OUTBOX_MIN_MINOR = 2
/** GET_OUTBOX P1 = 00's answer. */
export const OUTBOX_SCOPE_SIZE = 45
/** The most a page can carry: a one-byte count. */
export const OUTBOX_PAGE_MAX = 255

const SW_OK = 0x9000
const SW_NO_RECORD = 0x6a88
/** Answers that mean "this card has no GET_OUTBOX": nothing to settle, not a failure. */
const SW_UNSUPPORTED = [0x6d00, 0x6e00, 0x6a86]

/** The card holds no payment record (6A88): nothing to settle. */
export class OutboxEmpty extends Error {
  constructor() {
    super("GET_OUTBOX: the card holds no payment record")
    this.name = "OutboxEmpty"
  }
}

/** The card does not answer GET_OUTBOX (6D00, 6E00, 6A86): nothing to settle, not an error. */
export class OutboxUnsupported extends Error {
  constructor(readonly sw: number) {
    super(`GET_OUTBOX: not supported by this card (0x${sw.toString(16).toUpperCase()})`)
    this.name = "OutboxUnsupported"
  }
}

/** Whether a card that says `major.minor` at SELECT answers GET_OUTBOX: 2.2 or later. */
export const supportsOutbox = (major: number, minor: number): boolean =>
  major === PROTOCOL_MAJOR && minor >= OUTBOX_MIN_MINOR

/** The same, from SELECT's version body (`selectApplet`'s answer). */
export const versionSupportsOutbox = (version: number[]): boolean =>
  version.length >= 2 && supportsOutbox(version[0], version[1])

const send = async (
  transceive: Transceiver,
  { p1, data, context }: { p1: number; data?: number[]; context: string },
): Promise<number[]> => {
  const response = await transceive(buildApdu(INS.GET_OUTBOX, { p1, data, le: 0x00 }))
  if (response.length < 2) {
    throw new CardProtocolError(
      `${context}: truncated response (${response.length} bytes)`,
    )
  }
  const sw = statusWordOf(response)
  if (sw === SW_NO_RECORD) throw new OutboxEmpty()
  if (SW_UNSUPPORTED.includes(sw)) throw new OutboxUnsupported(sw)
  if (sw !== SW_OK) throw new CardError(sw, context)
  return response.slice(0, -2)
}

/** GET_OUTBOX P1 = 00: the record's 45-byte scope. */
export async function readOutboxScope(transceive: Transceiver): Promise<number[]> {
  const body = await send(transceive, { p1: 0x00, context: "GET_OUTBOX scope" })
  if (body.length !== OUTBOX_SCOPE_SIZE) {
    throw new CardProtocolError(
      `GET_OUTBOX scope: expected ${OUTBOX_SCOPE_SIZE} bytes, got ${body.length}`,
    )
  }
  return body
}

/** GET_OUTBOX P1 = 01: up to `count` (1-255) bytes of the packet from `offset`. */
export async function readOutboxPage(
  transceive: Transceiver,
  offset: number,
  count: number,
): Promise<number[]> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 0xffff) {
    throw new CardProtocolError(`GET_OUTBOX page: offset ${offset} does not fit 2 bytes`)
  }
  if (!Number.isInteger(count) || count < 1 || count > OUTBOX_PAGE_MAX) {
    throw new CardProtocolError(`GET_OUTBOX page: count ${count} is not 1 to 255`)
  }
  const body = await send(transceive, {
    p1: 0x01,
    data: [(offset >> 8) & 0xff, offset & 0xff, count],
    context: "GET_OUTBOX page",
  })
  if (body.length > count) {
    throw new CardProtocolError(
      `GET_OUTBOX page: asked for ${count} bytes, got ${body.length}`,
    )
  }
  return body
}

/** The packet's header (cashucard spec/APDU.md, The packet): the fields the policy is read from. */
export type OutboxHeader = {
  /** The card key the packet names, compressed, hex. Must be the tap's GET_PUBKEY. */
  cardKey: string
  /** Offset 40, 32 bytes, hex. */
  installation: string
  /** The packet's mint, exactly as the packet spells it. */
  mint: string
}

const MAGIC = [0x43, 0x43, 0x50, 0x2d, 0x41, 0x53, 0x01] // "CCP-AS" ‖ 01
const CARD_KEY_AT = 7
const INSTALLATION_AT = 40
const MINT_LENGTH_AT = 86
const MINT_AT = 88

/**
 * The header of a packet's first page: format, card key, installation and
 * mint. Only reads them; the engine verifies the whole packet against the
 * policy built from them (decodePacket).
 */
export function parseOutboxHeader(page: number[]): OutboxHeader {
  if (page.length < MINT_AT || MAGIC.some((byte, i) => page[i] !== byte)) {
    throw new CardProtocolError("GET_OUTBOX: the packet does not start with CCP-AS 01")
  }
  const mintLength = (page[MINT_LENGTH_AT] << 8) | page[MINT_LENGTH_AT + 1]
  if (mintLength === 0 || page.length < MINT_AT + mintLength) {
    throw new CardProtocolError(
      "GET_OUTBOX: the packet's mint does not fit its first page",
    )
  }
  return {
    cardKey: toHex(page.slice(CARD_KEY_AT, INSTALLATION_AT)),
    installation: toHex(page.slice(INSTALLATION_AT, INSTALLATION_AT + 32)),
    mint: String.fromCharCode(...page.slice(MINT_AT, MINT_AT + mintLength)),
  }
}
