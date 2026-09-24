/* eslint-disable no-bitwise -- APDU assembly and big-endian parsing are
 * bitwise by nature; this file is the only place in the app that speaks
 * raw card bytes. */

/**
 * Minimal client for the Cashu NFC card applet (lnflash/cashu-javacard,
 * spec/APDU.md Profile B). Read-only: select the applet, GET_INFO,
 * GET_BALANCE — enough to show a card's balance from the consumer app.
 *
 * Wire notes (verified against cardctl, the reference driver):
 *   SELECT  : 00 A4 04 00 07 + applet AID  → 9000 + 2-byte version
 *   GET_INFO: B0 01 00 00 (Le 256)         → 8-byte body
 *   GET_BAL : B0 11 00 00 (Le 4)           → 4-byte big-endian sat
 *
 * The applet must be selected before any command: IsoDep channels address the
 * card's currently-active application, and the Cashu applet is not the
 * default one.
 */
export const CASHU_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x02]
const SW_OK = 0x9000

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

export const buildSelectApdu = (): number[] => [
  0x00,
  0xa4,
  0x04,
  0x00,
  CASHU_AID.length,
  ...CASHU_AID,
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
  return (body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]
}

export type IsoDepTransceive = (bytes: number[]) => Promise<number[]>

/**
 * Read a Cashu card over an open IsoDep channel. Resolves null when the tag
 * is not a Cashu card (the applet SELECT fails) so the caller can fall back
 * to other card types; throws on genuine transport errors.
 */
export const readCashuCardBalance = async (
  transceive: IsoDepTransceive,
): Promise<CashuCardInfo | null> => {
  const select = await transceive(buildSelectApdu())
  if (sw(select) !== SW_OK) {
    return null
  }
  const info = await transceive([0xb0, 0x01, 0x00, 0x00])
  if (sw(info) !== SW_OK) {
    throw new Error(`GET_INFO failed: ${sw(info).toString(16)}`)
  }
  const balance = await transceive([0xb0, 0x11, 0x00, 0x00, 0x04])
  if (sw(balance) !== SW_OK) {
    throw new Error(`GET_BALANCE failed: ${sw(balance).toString(16)}`)
  }
  return {
    ...parseInfo(info.slice(0, -2)),
    balanceSat: parseBalance(balance.slice(0, -2)),
  }
}
