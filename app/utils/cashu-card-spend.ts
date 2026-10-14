/* eslint-disable no-bitwise -- a byte-level APDU codec, as cashu-card.ts is. */
/**
 * The card's spend commands (cashu-javacard spec/APDU.md, "Category 0x2x —
 * Spend", and GET_CHANGE), as a card tidy (ENG-702) sends them: one SIG_ALL
 * signature over pieces the card names and change the card makes for itself.
 *
 * Ported from flash-pos `src/services/cashuCard.ts` (`spendAllBegin`,
 * `spendAllChange`, `spendAllSign`, `spendAllAgain`, `getChange`) and
 * `src/services/cashuMint.ts` (`sigAllMessage`, `verifyCardSignature`), which
 * already run against the real applet. This app sends no SPEND_ALL_OUTPUTS: a
 * tidy's every output is the card's own change, so only the mint's fee leaves
 * the card (the applet counts the pieces less the change against its limits).
 *
 * Transport-agnostic, like `cashu-card.ts`: it builds and parses APDUs.
 */
import { schnorr } from "@noble/curves/secp256k1"
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import {
  CardError,
  CardProtocolError,
  INS,
  MAX_SLOTS,
  Transceiver,
  hexBytes,
  parseResponse,
  readU32,
  toHex,
  u32,
  buildApdu,
} from "./cashu-card"

/** Openings the card keeps for its own change: one payment makes at most this many (`CHANGE_MOST`). */
export const CHANGE_MOST = 8
/** One opening in GET_CHANGE: amount (4), keyset (8), date (4), nonce (32), r (32). */
const OPENING_SIZE = 80
/** Openings to one GET_CHANGE page. */
const OPENINGS_PER_PAGE = 3
/** GET_CHANGE pages: three hold the eight openings. */
const MAX_CHANGE_PAGES = Math.ceil(CHANGE_MOST / OPENINGS_PER_PAGE)
/** "Not yet": SPEND_ALL_SIGN's answer while a payment waits out the limit on one payment. */
const NOT_YET = [0x00, 0x01]
/**
 * How many "not yet"s a payment may take before the phone gives up: a bound
 * on a misbehaving card, not on a real limit, as flash-pos and cardsim's own
 * client bound it.
 */
export const MAX_SIGN_WAITS = 1100

/** Why the card refused a spend command, by its status word (spec/APDU.md). */
export type SpendRefusal =
  /** `6A94` from SPEND_ALL_SIGN: a PIN is set, it was not given, and the no-PIN allowance does not cover the payment. */
  | "pin-needed"
  /** `6A8F`: over the card's daily limit. */
  | "over-limit"
  /** `6A84` from SPEND_ALL_CHANGE: every opening is held. */
  | "no-opening"
  /** `6A80`: a slot named twice or of another date, or change past the pieces. */
  | "wrong-data"
  /** `6985`: a spent slot named (BEGIN), or no payment begun. */
  | "not-satisfied"

const REFUSALS: Record<number, SpendRefusal> = {
  0x6a94: "pin-needed",
  0x6a8f: "over-limit",
  0x6a84: "no-opening",
  0x6a80: "wrong-data",
  0x6985: "not-satisfied",
}

/**
 * The card refused a spend command with a status word this module names
 * (`SpendRefusal`). Still a `CardError`, so a caller that only asks "did the
 * card refuse?" reads it as one. Nothing is burned on any refusal: the burn
 * is the commit SIGN makes last, and only a 9000 with a signature follows it.
 */
export class CardSpendError extends CardError {
  constructor(readonly reason: SpendRefusal, sw: number, context: string) {
    super(sw, context)
    this.name = "CardSpendError"
  }
}

/** One spend command; a named refusal as `CardSpendError`, any other as `CardError`. */
const sendSpend = async (
  transceive: Transceiver,
  ins: number,
  opts: Parameters<typeof buildApdu>[1] & { context: string },
): Promise<number[]> => {
  const { context, ...apduOpts } = opts
  try {
    return parseResponse(await transceive(buildApdu(ins, apduOpts)), context)
  } catch (err) {
    if (err instanceof CardError && REFUSALS[err.sw]) {
      throw new CardSpendError(REFUSALS[err.sw], err.sw, context)
    }
    throw err
  }
}

/**
 * SPEND_ALL_BEGIN: the payment's places, in the order their pieces go into the
 * message. Resolves what they are worth together. Any command other than
 * SPEND_ALL_OUTPUTS, SPEND_ALL_CHANGE and SPEND_ALL_SIGN after it gives the
 * payment up.
 */
export async function spendAllBegin(
  transceive: Transceiver,
  slots: number[],
): Promise<number> {
  if (slots.length < 1 || slots.length > MAX_SLOTS) {
    throw new CardProtocolError(
      `SPEND_ALL_BEGIN: a payment names 1 to ${MAX_SLOTS} slots, got ${slots.length}`,
    )
  }
  slots.forEach((slot) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) {
      throw new CardProtocolError(`SPEND_ALL_BEGIN: no slot ${slot}`)
    }
  })
  const body = await sendSpend(transceive, INS.SPEND_ALL_BEGIN, {
    data: slots,
    le: 0x04,
    context: "SPEND_ALL_BEGIN",
  })
  if (body.length !== 4) {
    throw new CardProtocolError(`SPEND_ALL_BEGIN: expected 4 bytes, got ${body.length}`)
  }
  return readU32(body, 0)
}

/**
 * SPEND_ALL_CHANGE: one change output the card makes for itself, a fresh
 * nonce and r, its own key, the payment's keyset and date. Resolves the
 * blinded message B_, hex. The card keeps the opening (`getChange`) until the
 * piece is back on it.
 */
export async function spendAllChange(
  transceive: Transceiver,
  amount: number,
): Promise<string> {
  if (!Number.isInteger(amount) || amount < 1 || amount > 0xffffffff) {
    throw new CardProtocolError(`SPEND_ALL_CHANGE: change of ${amount}`)
  }
  const body = await sendSpend(transceive, INS.SPEND_ALL_CHANGE, {
    data: u32(amount, "SPEND_ALL_CHANGE"),
    le: 0x21,
    context: "SPEND_ALL_CHANGE",
  })
  if (body.length !== 33) {
    throw new CardProtocolError(`SPEND_ALL_CHANGE: expected 33 bytes, got ${body.length}`)
  }
  return toHex(body)
}

const assertSignature = (sig: number[], command: string): number[] => {
  if (sig.length !== 64) {
    throw new CardProtocolError(
      `${command}: expected a 64-byte signature, got ${sig.length}`,
    )
  }
  return sig
}

/**
 * SPEND_ALL_SIGN: the one signature over the whole payment.
 *
 * ⚠️ Irreversible. Every place named at BEGIN is burned in the commit that
 * releases the signature. A card lifted while it signs has burned nothing; one
 * lifted after the commit and before the answer has burned every place, and
 * `spendAllAgain` gives the signature again. While the payment is over the
 * limit on one payment the card answers "not yet" (`00 01`) and is asked again.
 */
export async function spendAllSign(transceive: Transceiver): Promise<number[]> {
  for (let waits = 0; waits <= MAX_SIGN_WAITS; waits += 1) {
    // One APDU at a time: an IsoDep channel carries a single exchange.
    const body = await sendSpend(transceive, INS.SPEND_ALL_SIGN, {
      le: 0x40,
      context: "SPEND_ALL_SIGN",
    })
    const notYet = body.length === 2 && body[0] === NOT_YET[0] && body[1] === NOT_YET[1]
    if (!notYet) return assertSignature(body, "SPEND_ALL_SIGN")
  }
  throw new CardProtocolError(
    `SPEND_ALL_SIGN: the card made the payment wait more than ${MAX_SIGN_WAITS} times`,
  )
}

/**
 * SPEND_ALL_AGAIN: the LAST signature SPEND_ALL_SIGN gave, again, for an
 * answer lost on the air. Good only for the payment it was made for: the
 * caller verifies it against that payment's message (`verifyCardSignature`)
 * before using it. Needs the PIN where one is set, unless that signature was
 * given with none. `6A88` from a card that has never signed.
 */
export async function spendAllAgain(transceive: Transceiver): Promise<number[]> {
  return assertSignature(
    await sendSpend(transceive, INS.SPEND_ALL_AGAIN, {
      le: 0x40,
      context: "SPEND_ALL_AGAIN",
    }),
    "SPEND_ALL_AGAIN",
  )
}

/**
 * The opening of a change output the card made for itself and has signed for,
 * not yet back on the card: with the mint's blind signature, it is the piece.
 */
export type ChangeOpening = {
  amount: number
  /** The payment's keyset, the card's 8 bytes, hex. */
  keysetId: string
  /** The payment's date (locktime), seconds; 0 for none. */
  date: number
  nonce: string
  /** The blinding factor, 32 bytes hex. */
  r: string
}

export function parseChangePage(body: number[]): ChangeOpening[] {
  if (body.length < 1) throw new CardProtocolError("GET_CHANGE: an empty answer")
  const count = body[0]
  if (count > OPENINGS_PER_PAGE || body.length !== 1 + count * OPENING_SIZE) {
    throw new CardProtocolError(`GET_CHANGE: ${count} openings in ${body.length} bytes`)
  }
  const openings: ChangeOpening[] = []
  for (let i = 0; i < count; i += 1) {
    const at = 1 + i * OPENING_SIZE
    openings.push({
      amount: readU32(body, at),
      keysetId: toHex(body.slice(at + 4, at + 12)),
      date: readU32(body, at + 12),
      nonce: toHex(body.slice(at + 16, at + 48)),
      r: toHex(body.slice(at + 48, at + 80)),
    })
  }
  return openings
}

/**
 * GET_CHANGE, every page: the openings of change the card has signed for and
 * that are not yet back on it. The card lets go of an opening whose piece is
 * on it before it answers. No PIN. A full page means another may follow.
 */
export async function getChange(transceive: Transceiver): Promise<ChangeOpening[]> {
  const openings: ChangeOpening[] = []
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const found = parseChangePage(
      parseResponse(
        await transceive(buildApdu(INS.GET_CHANGE, { p1: page, le: 0x00 })),
        `GET_CHANGE page ${page}`,
      ),
    )
    openings.push(...found)
    if (found.length < OPENINGS_PER_PAGE) break
  }
  return openings
}

/**
 * The NUT-11 SIG_ALL message's SHA-256: every input's secret and C (hex),
 * then every output's amount (decimal) and B_ (hex), concatenated as text in
 * the order the card signs them. What the card's one signature is over.
 */
export function sigAllMessage(
  inputs: readonly { secret: string; C: string }[],
  outputs: readonly { amount: number; B_: string }[],
): Uint8Array {
  let text = ""
  inputs.forEach((input) => {
    text += input.secret + input.C.toLowerCase()
  })
  outputs.forEach((output) => {
    text += String(output.amount) + output.B_.toLowerCase()
  })
  return sha256(new TextEncoder().encode(text))
}

/** Whether `signature` (hex) is the card key's BIP-340 signature over `message`. */
export function verifyCardSignature(
  signature: string,
  message: Uint8Array,
  cardPubkey: string,
): boolean {
  try {
    return schnorr.verify(
      Uint8Array.from(hexBytes(signature, 64, "signature")),
      message,
      Uint8Array.from(hexBytes(cardPubkey, 33, "card key").slice(1)),
    )
  } catch {
    return false
  }
}
