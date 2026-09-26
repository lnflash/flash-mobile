/* eslint-disable no-bitwise -- APDU assembly and big-endian parsing are
 * bitwise by nature; this file is the only place in the app that speaks
 * raw card bytes. */

/**
 * Minimal client for the Cashu NFC card applet (lnflash/cashu-javacard,
 * spec/APDU.md Profile B). Read-only: select the applet, GET_INFO,
 * GET_BALANCE — enough to show a card's balance from the consumer app.
 *
 * Wire notes (mirrors cardctl, the reference driver):
 *   SELECT  : 00 A4 04 00 07 + package AID   → 9000 + 2-byte version
 *             retried as 00 A4 04 00 08 + applet AID when the card declines
 *             the 7-byte prefix match (spec/APDU.md "SELECT")
 *   GET_INFO: B0 01 00 00 00 (Le 00 = 256)   → 8-byte body
 *   GET_BAL : B0 11 00 00 04 (Le 4)          → 4-byte big-endian uint32
 *
 * The applet must be selected before any command: IsoDep channels address the
 * card's currently-active application, and the Cashu applet is not the
 * default one.
 */
export const CASHU_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]
/** Full applet-instance AID: the package AID plus the 0x01 instance suffix. */
export const CASHU_APPLET_AID = [...CASHU_AID, 0x01]
const SW_OK = 0x9000
/** ISO 7816-4 "file or application not found": the tag has no such applet. */
const SW_FILE_NOT_FOUND = 0x6a82

const GET_INFO_APDU = [0xb0, 0x01, 0x00, 0x00, 0x00]
const GET_BALANCE_APDU = [0xb0, 0x11, 0x00, 0x00, 0x04]

export interface CashuCardInfo {
  version: string
  maxSlots: number
  unspent: number
  spent: number
  /** sats */
  balanceSat: number
}

const sw = (response: number[]): number =>
  (response[response.length - 2] << 8) | response[response.length - 1]

const hexSw = (status: number): string => status.toString(16).padStart(4, "0")

export const buildSelectApdu = (aid: number[] = CASHU_AID): number[] => [
  0x00,
  0xa4,
  0x04,
  0x00,
  aid.length,
  ...aid,
]

export const parseInfo = (body: number[]): Omit<CashuCardInfo, "balanceSat"> => {
  if (body.length < 8) {
    throw new Error(`GET_INFO: expected 8 bytes, got ${body.length}`)
  }
  return {
    version: `${body[0]}.${body[1]}`,
    maxSlots: body[2],
    unspent: body[3],
    spent: body[4],
  }
}

export const parseBalance = (body: number[]): number => {
  if (body.length !== 4) {
    throw new Error(`GET_BALANCE: expected 4 bytes, got ${body.length}`)
  }
  // `|` yields a signed 32-bit int; `>>> 0` reinterprets it as the uint32 the
  // card sends, so balances >= 0x80000000 don't come back negative.
  return ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]) >>> 0
}

export type IsoDepTransceive = (bytes: number[]) => Promise<number[]>

/**
 * Read a Cashu card over an open IsoDep channel. Resolves null when the tag
 * refuses both applet SELECT forms so the caller can fall back to other card
 * types: quietly for 6A82 (no such applet), with a warning for any other
 * status word. Throws on genuine transport errors once the applet is selected.
 */
export const readCashuCardBalance = async (
  transceive: IsoDepTransceive,
): Promise<CashuCardInfo | null> => {
  // ISO 7816-4 SELECT does prefix matching, so the 7-byte package AID normally
  // selects the applet instance. Runtimes that decline partial matches need the
  // full 8-byte applet AID; cardctl retries the same way.
  const packageSw = sw(await transceive(buildSelectApdu(CASHU_AID)))
  const appletSw =
    packageSw === SW_OK ? SW_OK : sw(await transceive(buildSelectApdu(CASHU_APPLET_AID)))
  if (appletSw !== SW_OK) {
    // 6A82 to both forms is what a tag without the applet says (an NTAG 424
    // BoltCard among them); the caller falls through to NDEF on null, so that
    // case stays quiet. Any other status is a card that knows the AID and
    // still refused (6999: the applet's select() failed; 6283/6A81: a locked
    // instance), and a silent null would misreport it as "not a Cashu card".
    // A status word carries no secret, so it can be logged.
    if (packageSw !== SW_FILE_NOT_FOUND || appletSw !== SW_FILE_NOT_FOUND) {
      const refused = `package AID ${hexSw(packageSw)}, applet AID ${hexSw(appletSw)}`
      console.warn(`Cashu applet SELECT refused: ${refused}`)
    }
    return null
  }
  const info = await transceive(GET_INFO_APDU)
  if (sw(info) !== SW_OK) {
    throw new Error(`GET_INFO failed: ${hexSw(sw(info))}`)
  }
  const balance = await transceive(GET_BALANCE_APDU)
  if (sw(balance) !== SW_OK) {
    throw new Error(`GET_BALANCE failed: ${hexSw(sw(balance))}`)
  }
  return {
    ...parseInfo(info.slice(0, -2)),
    balanceSat: parseBalance(balance.slice(0, -2)),
  }
}
