import * as Keychain from "react-native-keychain"

import type { TidyRecord, TopUpRecord } from "./types"

/**
 * Top-ups in progress, in the Keychain.
 *
 * A paid top-up that is not on the card yet is money only this record can
 * finish delivering: the quote's lock key, the blinding factors and, once
 * minted, the proofs themselves. So it lives in the Keychain, not in
 * redux-persist, and survives sign-out (the value belongs to the card, not to
 * the account that paid for it).
 *
 * Reads are strict. A Keychain failure or an unreadable value throws rather
 * than reading as "no top-ups": the next write would otherwise replace every
 * pending record with an empty list.
 *
 * The store trims only loaded records. A quote is dropped by the engine
 * (`advanceTopUps`, `cancelTopUp`), which asks the mint first: whether an
 * expired quote can still be paid is the mint's to say, not the store's.
 */
const SERVER = "flashcard-v2-topups"
const USERNAME = "topups"
/**
 * 2: records of card protocol 2.0 (ENG-675), each with its `cardFormat`.
 * A format-1 store, saved before 2.0, is still read, never thrown away: its
 * records are money only they can deliver. They read as `cardFormat` 0 (a 0.x
 * card's pieces, `needs-update`), and the next write saves them in format 2
 * unchanged otherwise.
 *
 * 3: format 2 with card tidies (ENG-702) among the records (`kind: "tidy"`;
 * a record with no `kind` is a top-up). Written only while a tidy is saved,
 * format 2 otherwise: a build from before tidies reads a format-3 store as
 * an unknown format and throws (strict reads), so it never reads a tidy as a
 * top-up, and never writes over one, which only this record can finish.
 */
const FORMAT = 2
const FORMAT_1 = 1
const FORMAT_TIDY = 3

/**
 * Tidies kept for a human (`needs-card`) that the owner dismissed: out of the
 * shared list, so the card screen stops showing them and the list can go back
 * to format 2, but never thrown away, the card's signature with them. A list
 * of its own, read as strictly as the top-ups.
 */
const ARCHIVE_SERVER = "flashcard-v2-tidy-archive"
const ARCHIVE_USERNAME = "tidies"
const ARCHIVE_FORMAT = 1

/** Loaded top-ups kept for the card screen's recent activity; older ones go. */
const KEEP_LOADED = 20

export class TopUpStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TopUpStoreError"
  }
}

/** One saved record: a top-up, or a card tidy. */
export type StoredRecord = TopUpRecord | TidyRecord

export const isTidy = (record: StoredRecord): record is TidyRecord =>
  (record as Partial<TidyRecord>).kind === "tidy"

const isTopUp = (record: StoredRecord): record is TopUpRecord => !isTidy(record)

type Stored = {
  format: typeof FORMAT | typeof FORMAT_TIDY
  records: StoredRecord[]
}

/** A format-1 record as it was saved: no `cardFormat`, `version` 1. */
type RecordV1 = Omit<TopUpRecord, "version" | "cardFormat"> & { version: 1 }

/**
 * A record saved before card protocol 2.0, read as a 2.0 record whose pieces
 * no 2.0 card can hold (`cardFormat` 0): kept, never loaded.
 */
export const fromFormat1 = (record: RecordV1): TopUpRecord => ({
  ...record,
  version: 2,
  cardFormat: 0,
})

const readAll = async (): Promise<StoredRecord[]> => {
  const credentials = await Keychain.getInternetCredentials(SERVER)
  if (!credentials) return []
  let stored: { format?: unknown; records?: unknown }
  try {
    stored = JSON.parse(credentials.password)
  } catch {
    throw new TopUpStoreError("the saved top-ups cannot be read")
  }
  if (!Array.isArray(stored?.records)) {
    throw new TopUpStoreError(
      `the saved top-ups are in an unknown format (${stored?.format})`,
    )
  }
  if (stored.format === FORMAT_1) {
    return (stored.records as RecordV1[]).map(fromFormat1)
  }
  if (stored.format !== FORMAT && stored.format !== FORMAT_TIDY) {
    throw new TopUpStoreError(
      `the saved top-ups are in an unknown format (${stored.format})`,
    )
  }
  return stored.records as StoredRecord[]
}

/** A tidy with nothing left owed: its pieces are on the card, or nothing was burned. */
const tidyFinished = (record: TidyRecord): boolean =>
  record.state === "loaded" || record.state === "abandoned"

const writeAll = async (records: StoredRecord[]): Promise<void> => {
  const loaded = records
    .filter(isTopUp)
    .filter((r) => r.state === "loaded")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(KEEP_LOADED)
  const pruned = records.filter(
    (r) => !loaded.includes(r as TopUpRecord) && !(isTidy(r) && tidyFinished(r)),
  )
  const stored: Stored = {
    format: pruned.some(isTidy) ? FORMAT_TIDY : FORMAT,
    records: pruned,
  }
  await Keychain.setInternetCredentials(SERVER, USERNAME, JSON.stringify(stored))
}

const readArchive = async (): Promise<TidyRecord[]> => {
  const credentials = await Keychain.getInternetCredentials(ARCHIVE_SERVER)
  if (!credentials) return []
  let stored: { format?: unknown; records?: unknown }
  try {
    stored = JSON.parse(credentials.password)
  } catch {
    throw new TopUpStoreError("the archived tidies cannot be read")
  }
  if (stored?.format !== ARCHIVE_FORMAT || !Array.isArray(stored.records)) {
    throw new TopUpStoreError(
      `the archived tidies are in an unknown format (${stored?.format})`,
    )
  }
  return stored.records as TidyRecord[]
}

const writeArchive = async (records: TidyRecord[]): Promise<void> => {
  await Keychain.setInternetCredentials(
    ARCHIVE_SERVER,
    ARCHIVE_USERNAME,
    JSON.stringify({ format: ARCHIVE_FORMAT, records }),
  )
}

// Every read-modify-write runs after the previous one: two flows saving at
// once must not each write their own copy of the list over the other's.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

export type TopUpStore = {
  list: () => Promise<TopUpRecord[]>
  get: (id: string) => Promise<TopUpRecord | undefined>
  put: (record: TopUpRecord) => Promise<TopUpRecord>
  update: (
    id: string,
    change: (record: TopUpRecord) => TopUpRecord,
  ) => Promise<TopUpRecord>
  remove: (id: string) => Promise<void>
  /**
   * Remove the record only if it still passes `test` when its turn in the
   * write queue comes: a decision to drop a record, made from an earlier
   * read, must not drop one that changed since (a payment sent in between).
   * Resolves whether it was removed.
   */
  removeIf: (id: string, test: (record: TopUpRecord) => boolean) => Promise<boolean>
  /**
   * Card tidies (ENG-702), in the same list as the top-ups, so the slots
   * both will take are counted together (`cardCommitments`). A tidy that is
   * `loaded` or `abandoned` owes nothing and is dropped on the next write.
   */
  tidies: {
    list: () => Promise<TidyRecord[]>
    get: (id: string) => Promise<TidyRecord | undefined>
    put: (record: TidyRecord) => Promise<TidyRecord>
    update: (
      id: string,
      change: (record: TidyRecord) => TidyRecord,
    ) => Promise<TidyRecord>
    /**
     * The owner's "Dismiss" on a tidy kept for a human (`needs-card`): moved
     * to the tidy archive, copied there before it leaves the list, so a cut
     * in between leaves it in both, never in neither. Refuses any other
     * state: a tidy still owed is money only its record can finish. Resolves
     * whether it was moved (false when it is not in the list).
     */
    archive: (id: string) => Promise<boolean>
    /** The dismissed tidies, kept for support. */
    archived: () => Promise<TidyRecord[]>
  }
}

/** One kind of record's operations over the one shared list. */
const recordsOf = <R extends StoredRecord>(
  is: (record: StoredRecord) => record is R,
  now: () => number,
  what: string,
) => ({
  list: () => serialized(async () => (await readAll()).filter(is)),
  get: (id: string) =>
    serialized(async () => (await readAll()).filter(is).find((r) => r.id === id)),
  put: (record: R) =>
    serialized(async () => {
      const records = await readAll()
      if (records.some((r) => r.id === record.id)) {
        throw new TopUpStoreError(`${what} ${record.id} is already saved`)
      }
      await writeAll([...records, record])
      return record
    }),
  update: (id: string, change: (record: R) => R) =>
    serialized(async () => {
      const records = await readAll()
      const index = records.findIndex((r) => is(r) && r.id === id)
      if (index < 0) throw new TopUpStoreError(`${what} ${id} is not saved`)
      const next = { ...change(records[index] as R), id, updatedAt: now() }
      await writeAll(records.map((r, i) => (i === index ? next : r)))
      return next
    }),
})

export const createTopUpStore = (now: () => number = Date.now): TopUpStore => {
  const topUps = recordsOf(isTopUp, now, "top-up")
  return {
    ...topUps,
    remove: (id) =>
      serialized(async () => {
        const records = await readAll()
        await writeAll(records.filter((r) => !(isTopUp(r) && r.id === id)))
      }),
    removeIf: (id, test) =>
      serialized(async () => {
        const records = await readAll()
        const record = records.filter(isTopUp).find((r) => r.id === id)
        if (!record || !test(record)) return false
        await writeAll(records.filter((r) => r !== record))
        return true
      }),
    tidies: {
      ...recordsOf(isTidy, now, "tidy"),
      archive: (id) =>
        serialized(async () => {
          const records = await readAll()
          const record = records.filter(isTidy).find((r) => r.id === id)
          if (!record) return false
          if (record.state !== "needs-card") {
            throw new TopUpStoreError(
              `tidy ${id} is ${record.state}: only one kept for a human is dismissed`,
            )
          }
          const archived = await readArchive()
          if (!archived.some((r) => r.id === id)) {
            await writeArchive([...archived, { ...record, updatedAt: now() }])
          }
          await writeAll(records.filter((r) => r !== record))
          return true
        }),
      archived: () => serialized(readArchive),
    },
  }
}
