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
 *
 * Beside the entries, `unknownMints` notes the records whose packet named a
 * mint this app does not know (ENG-822), by card and scope, so the tap that
 * met one says so and the next taps of the same record are quiet. A note is
 * not an entry and not a refusal: nothing was captured, and once the mint is
 * known the next tap captures the record as usual (its entry replaces the
 * note). The newest `KEEP_TERMINAL` notes are kept. The field is optional,
 * so a value saved without it reads as it did: the format is unchanged.
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

/** A record whose packet named a mint this app does not know: its card and scope. */
export type UnknownMintNote = {
  cardPubkey: string
  scopeHex: string
  updatedAt: number
}

export const isTerminal = (entry: RelayEntry): boolean =>
  entry.journal.state === "outputs-confirmed" || entry.refused !== undefined

type Saved = { entries: RelayEntry[]; unknownMints: UnknownMintNote[] }

const readAll = async (): Promise<Saved> => {
  const credentials = await Keychain.getInternetCredentials(SERVER)
  if (!credentials) return { entries: [], unknownMints: [] }
  let stored: { format?: unknown; entries?: unknown; unknownMints?: unknown }
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
  if (stored.unknownMints !== undefined && !Array.isArray(stored.unknownMints)) {
    throw new RelayStoreError("the saved relays' unknown-mint notes cannot be read")
  }
  return {
    entries: stored.entries as RelayEntry[],
    unknownMints: (stored.unknownMints ?? []) as UnknownMintNote[],
  }
}

const writeAll = async ({ entries, unknownMints }: Saved): Promise<void> => {
  const dropped = entries
    .filter(isTerminal)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(KEEP_TERMINAL)
  const kept = entries.filter((entry) => !dropped.includes(entry))
  const notes = [...unknownMints]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, KEEP_TERMINAL)
  await Keychain.setInternetCredentials(
    SERVER,
    USERNAME,
    JSON.stringify({
      format: FORMAT,
      entries: kept,
      ...(notes.length ? { unknownMints: notes } : {}),
    }),
  )
}

// One write queue: every read-modify-write runs after the one before it.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

type Key = Pick<RelayEntry, "cardPubkey" | "scopeHex">

const sameEntry = (a: Key, b: Key) =>
  a.cardPubkey === b.cardPubkey && a.scopeHex === b.scopeHex

export type RelayStore = {
  /** Every entry of `cardPubkey`, newest first. */
  forCard: (cardPubkey: string) => Promise<RelayEntry[]>
  /** Saves `entry` in place of the one with its card and scope, `updatedAt` now. */
  put: (entry: Omit<RelayEntry, "updatedAt">) => Promise<RelayEntry>
  /** Drops the entry with this card and scope (a partial capture a newer record replaced). */
  remove: (cardPubkey: string, scopeHex: string) => Promise<void>
  /**
   * Notes that this card's record (`scopeHex`) named a mint this app does not
   * know. Resolves `true` if it was noted already (a later tap of the same
   * record), `false` if this call noted it.
   */
  noteUnknownMint: (cardPubkey: string, scopeHex: string) => Promise<boolean>
}

export const createRelayStore = (now: () => number = Date.now): RelayStore => ({
  forCard: (cardPubkey) =>
    serialized(async () =>
      (await readAll()).entries
        .filter((entry) => entry.cardPubkey === cardPubkey)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    ),
  put: (entry) =>
    serialized(async () => {
      const { entries, unknownMints } = await readAll()
      const next: RelayEntry = { ...entry, updatedAt: now() }
      // An entry for the record supersedes its note: its mint is known now.
      await writeAll({
        entries: [...entries.filter((e) => !sameEntry(entry, e)), next],
        unknownMints: unknownMints.filter((n) => !sameEntry(entry, n)),
      })
      return next
    }),
  remove: (cardPubkey, scopeHex) =>
    serialized(async () => {
      const { entries, unknownMints } = await readAll()
      await writeAll({
        entries: entries.filter((e) => !sameEntry({ cardPubkey, scopeHex }, e)),
        unknownMints,
      })
    }),
  noteUnknownMint: (cardPubkey, scopeHex) =>
    serialized(async () => {
      const saved = await readAll()
      const key = { cardPubkey, scopeHex }
      if (saved.unknownMints.some((n) => sameEntry(key, n))) return true
      await writeAll({
        entries: saved.entries,
        unknownMints: [...saved.unknownMints, { ...key, updatedAt: now() }],
      })
      return false
    }),
})
