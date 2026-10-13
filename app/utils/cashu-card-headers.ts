/* eslint-disable no-bitwise -- a block header is little-endian fields and a compact target */
/**
 * The card's clock, fed with Bitcoin block headers (ENG-675, card protocol
 * 2.0; architect's decision 7).
 *
 * A 2.0 card keeps its day's limits against a clock that is the time in the
 * newest block header it has been shown, believed for its proof of work. The
 * phone fetches the tip header off the tap: mempool.space first,
 * blockstream.info as the fallback (a development build's card bridge can
 * name another, for the e2e stub), checks its work, and keeps the newest for
 * ten minutes. In a tap, `feedHeader` tells the card the phone's time
 * (TELL_TIME, a note for its log) and shows it the kept header (SET_HEADER)
 * only when that is newer than the card's clock.
 *
 * Best effort, always: a tap never waits on the network for a header, and a
 * card that refuses one (or a phone that has none) keeps the clock it had.
 * Nothing here fails a tap. Ported from getfoxy/iOS `08a-flashcard.js`
 * `cardClock` (MIT).
 */
// @noble/hashes comes in through @noble/curves, as app/utils/crypto.ts takes it.
// eslint-disable-next-line import/no-extraneous-dependencies
import { sha256 } from "@noble/hashes/sha256"

import { HEADER_SIZE, Transceiver, setHeader, tellTime, toHex } from "./cashu-card"
import { getCardBridge } from "./cashu-card-bridge"

/** Where the tip header comes from, in order (decision 7). Esplora's API on both. */
export const HEADER_SOURCES = [
  "https://mempool.space/api",
  "https://blockstream.info/api",
]

/** How long a fetched tip is kept before it is asked for again. */
export const HEADER_CACHE_MS = 10 * 60_000

/** How long one source may take to answer before the next is asked. */
const FETCH_TIMEOUT_MS = 8_000

/**
 * The applet's floor (`FLOOR_BITS`, D24): a quarter of the network's work at
 * height 971,100. A header under it is refused by the card (6A93), so the
 * phone never keeps one: a testnet or forged header has far less.
 */
export const FLOOR_BITS = 0x17087bc0

/** A block header the phone has checked. */
export type CheckedHeader = {
  /** The 80 bytes, as the network carries them. */
  bytes: number[]
  /** The block hash, as Bitcoin shows one (byte-reversed double SHA-256). */
  hash: string
  /** The header's time, seconds. */
  time: number
  bits: number
}

export class HeaderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HeaderError"
  }
}

const readU32LE = (bytes: number[], at: number) =>
  (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0

/** The target a compact `bits` names, or undefined for bits no header could carry. */
export const targetOf = (bits: number): bigint | undefined => {
  const exponent = bits >>> 24
  const mantissa = bits & 0x00ffffff
  if (mantissa & 0x00800000 || mantissa === 0 || exponent > 32) return undefined
  return exponent <= 3
    ? BigInt(mantissa >>> (8 * (3 - exponent)))
    : BigInt(mantissa) << BigInt(8 * (exponent - 3))
}

const FLOOR_TARGET = targetOf(FLOOR_BITS) as bigint

/**
 * An 80-byte header checked for its own work: its double SHA-256, read
 * little-endian, is at or under the target its `bits` name, and that target
 * is at or under the applet's floor. `expectedHash` (as a source names the
 * tip) must be the header's own. Throws `HeaderError` otherwise.
 */
export const checkHeader = (bytes: number[], expectedHash?: string): CheckedHeader => {
  if (bytes.length !== HEADER_SIZE) throw new HeaderError("a header is 80 bytes")
  const digest = Array.from(sha256(sha256(Uint8Array.from(bytes))))
  const hash = toHex([...digest].reverse())
  if (expectedHash !== undefined && hash !== expectedHash.toLowerCase()) {
    throw new HeaderError("the header is not the block it was named as")
  }
  const bits = readU32LE(bytes, 72)
  const target = targetOf(bits)
  if (target === undefined || target > FLOOR_TARGET) {
    throw new HeaderError("the header names too little work")
  }
  if (BigInt(`0x${hash}`) > target) throw new HeaderError("the header lacks its work")
  return { bytes, hash, time: readU32LE(bytes, 68), bits }
}

type Fetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

const fetchText = async (fetcher: Fetch, url: string): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(url, { signal: controller.signal })
    if (!response.ok) throw new HeaderError(`${url} answered ${response.status}`)
    return (await response.text()).trim()
  } finally {
    clearTimeout(timer)
  }
}

/** The tip header from one Esplora source: its tip hash, then that block's header. */
const tipFrom = async (fetcher: Fetch, base: string): Promise<CheckedHeader> => {
  const hash = (await fetchText(fetcher, `${base}/blocks/tip/hash`)).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new HeaderError("not a block hash")
  const hex = await fetchText(fetcher, `${base}/block/${hash}/header`)
  if (!/^[0-9a-fA-F]{160}$/.test(hex)) throw new HeaderError("not a block header")
  return checkHeader(
    (hex.match(/../g) ?? []).map((h) => parseInt(h, 16)),
    hash,
  )
}

/** The sources a header is asked of: the dev bridge's stub, or decision 7's two. */
export const headerSources = (): string[] => {
  const stub = getCardBridge()?.headersUrl
  return stub ? [stub] : HEADER_SOURCES
}

let kept: { header: CheckedHeader; fetchedAt: number } | undefined
let inFlight: Promise<CheckedHeader | undefined> | undefined

/** The newest checked header the phone holds, however old; undefined when it has none. */
export const keptHeader = (): CheckedHeader | undefined => kept?.header

/** Forget the kept header (tests). */
export const resetKeptHeader = () => {
  kept = undefined
  inFlight = undefined
}

/**
 * Fetch the tip, off any tap: resolves the newest header the phone holds
 * once the sources have answered or failed. A tip fetched in the last ten
 * minutes is not asked for again. A source that fails or answers a header
 * without its work is passed over for the next; when every one fails, the
 * header kept before (if any) stands, and the card is shown nothing newer.
 * Never rejects.
 */
export const refreshTipHeader = ({
  fetcher = fetch as unknown as Fetch,
  now = Date.now,
}: { fetcher?: Fetch; now?: () => number } = {}): Promise<CheckedHeader | undefined> => {
  if (kept && now() - kept.fetchedAt < HEADER_CACHE_MS)
    return Promise.resolve(kept.header)
  if (inFlight) return inFlight
  const run = (async () => {
    for (const base of headerSources()) {
      try {
        const header = await tipFrom(fetcher, base)
        if (!kept || header.time >= kept.header.time) {
          kept = { header, fetchedAt: now() }
        } else {
          kept = { ...kept, fetchedAt: now() }
        }
        return kept.header
      } catch (err) {
        console.warn(
          `Card clock: no tip header from ${base} (${
            err instanceof Error ? err.name : typeof err
          })`,
        )
      }
    }
    return kept?.header
  })().finally(() => {
    inFlight = undefined
  })
  inFlight = run
  return run
}

/** What a tap did for the card's clock. Nothing in it is secret. */
export type ClockReport = {
  /** The card took TELL_TIME. */
  told: boolean
  /** SET_HEADER went out. */
  sent: boolean
  /** The card's clock after the tap, as far as it said. */
  now: number
  /** SET_HEADER's refusal, when it refused (`6A93`, say), as a label. */
  refused?: string
}

/**
 * In a tap, after the card's GET_INFO (`cardNow` is its clock): TELL_TIME with
 * the phone's own time, then SET_HEADER with the kept header when it is newer
 * than the card's clock. Never touches the network and never throws: a card
 * that refuses either, or leaves, keeps the clock it had, and the report says
 * so.
 */
export const feedHeader = async (
  transceive: Transceiver,
  cardNow: number,
  { now = Date.now }: { now?: () => number } = {},
): Promise<ClockReport> => {
  const report: ClockReport = { told: false, sent: false, now: cardNow }
  try {
    await tellTime(transceive, Math.floor(now() / 1000))
    report.told = true
  } catch (err) {
    report.refused = err instanceof Error ? err.name : typeof err
  }
  const header = keptHeader()
  if (!header || header.time <= cardNow) return report
  report.sent = true
  try {
    report.now = await setHeader(transceive, header.bytes)
  } catch (err) {
    report.refused = err instanceof Error ? err.name : typeof err
    console.warn(`Card clock: the card took no header (${report.refused})`)
  }
  return report
}
