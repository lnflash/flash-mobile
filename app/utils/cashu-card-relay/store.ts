import * as Keychain from "react-native-keychain"

import type { RelayJournal } from "./relay"

/**
 * The assisted-settlement relay's journals (ENG-820), in the Keychain under a
 * service of their own: the top-up store (`cashu-card-topup/store.ts`) and its
 * format gating are not touched.
 *
 * A journal is what keeps a relay from swapping twice: it is saved before
 * every page is read and before the swap goes out, and the next tap observes
 * the mint before any swap. So reads are strict, as the top-up store's are:
 * a Keychain failure or an unreadable value throws, never reads as "nothing
 * saved", which would let the next tap start over.
 *
 * Terminal entries are kept, so a second tap of the same record is answered
 * from here with no page read and no mint call, up to `KEEP_TERMINAL` of them,
 * the newest first. An entry is terminal once settled (`outputs-confirmed`)
 * or once refused (`refused`): a refusal that would repeat on every attempt
 * (a non-sat keyset, the mint's fee policy, a swap the mint answered with a
 * refusal). A refused entry is never retried, and it no longer hides the
 * card's newer records. `refused` is optional, so entries saved before it
 * read as they did: the format is unchanged.
 */
const SERVER = "flashcard-v2-relay"
const USERNAME = "relay"
const FORMAT = 1
export const KEEP_TERMINAL = 20

export type RelayEntry = {
  /** The tapped card's key (GET_PUBKEY), hex. */
  cardPubkey: string
  /** The record's 45-byte scope, hex: one entry per scope. */
  scopeHex: string
  /** The packet's mint, exactly as the packet spells it (`policy.mint`). */
  mintUrl: string
  /** The packet's installation (its header, offset 40), hex. */
  installation: string
  journal: RelayJournal
  /** How many `/v1/swap` calls this phone has sent for the entry. */
  swaps: number
  /**
   * The engine's refusal code (`RelayFailure.code`) when the relay stopped on
   * a refusal that repeats on every attempt; the entry is then terminal and
   * never retried. Absent for every other entry.
   */
  refused?: string
  updatedAt: number
}

export class RelayStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RelayStoreError"
  }
}

export const isTerminal = (entry: RelayEntry): boolean =>
  entry.journal.state === "outputs-confirmed" || entry.refused !== undefined

const readAll = async (): Promise<RelayEntry[]> => {
  const credentials = await Keychain.getInternetCredentials(SERVER)
  if (!credentials) return []
  let stored: { format?: unknown; entries?: unknown }
  try {
    stored = JSON.parse(credentials.password)
  } catch {
    throw new RelayStoreError("the saved relays cannot be read")
  }
  if (stored?.format !== FORMAT || !Array.isArray(stored.entries)) {
    throw new RelayStoreError(
      `the saved relays are in an unknown format (${stored?.format})`,
    )
  }
  return stored.entries as RelayEntry[]
}

const writeAll = async (entries: RelayEntry[]): Promise<void> => {
  const dropped = entries
    .filter(isTerminal)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(KEEP_TERMINAL)
  const kept = entries.filter((entry) => !dropped.includes(entry))
  await Keychain.setInternetCredentials(
    SERVER,
    USERNAME,
    JSON.stringify({ format: FORMAT, entries: kept }),
  )
}

// One write queue: every read-modify-write runs after the one before it.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

const sameEntry = (a: Pick<RelayEntry, "cardPubkey" | "scopeHex">, b: RelayEntry) =>
  a.cardPubkey === b.cardPubkey && a.scopeHex === b.scopeHex

export type RelayStore = {
  /** Every entry of `cardPubkey`, newest first. */
  forCard: (cardPubkey: string) => Promise<RelayEntry[]>
  /** Saves `entry` in place of the one with its card and scope, `updatedAt` now. */
  put: (entry: Omit<RelayEntry, "updatedAt">) => Promise<RelayEntry>
  /** Drops the entry with this card and scope (a partial capture a newer record replaced). */
  remove: (cardPubkey: string, scopeHex: string) => Promise<void>
}

export const createRelayStore = (now: () => number = Date.now): RelayStore => ({
  forCard: (cardPubkey) =>
    serialized(async () =>
      (await readAll())
        .filter((entry) => entry.cardPubkey === cardPubkey)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    ),
  put: (entry) =>
    serialized(async () => {
      const entries = await readAll()
      const next: RelayEntry = { ...entry, updatedAt: now() }
      await writeAll([...entries.filter((e) => !sameEntry(entry, e)), next])
      return next
    }),
  remove: (cardPubkey, scopeHex) =>
    serialized(async () => {
      const entries = await readAll()
      await writeAll(entries.filter((e) => !sameEntry({ cardPubkey, scopeHex }, e)))
    }),
})
