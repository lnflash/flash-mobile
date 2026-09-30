import * as Keychain from "react-native-keychain"

import type { TopUpRecord } from "./types"

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
const FORMAT = 1

/** Loaded top-ups kept for the card screen's recent activity; older ones go. */
const KEEP_LOADED = 20

export class TopUpStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TopUpStoreError"
  }
}

type Stored = { format: typeof FORMAT; records: TopUpRecord[] }

const readAll = async (): Promise<TopUpRecord[]> => {
  const credentials = await Keychain.getInternetCredentials(SERVER)
  if (!credentials) return []
  let stored: Partial<Stored>
  try {
    stored = JSON.parse(credentials.password)
  } catch {
    throw new TopUpStoreError("the saved top-ups cannot be read")
  }
  if (stored.format !== FORMAT || !Array.isArray(stored.records)) {
    throw new TopUpStoreError(
      `the saved top-ups are in an unknown format (${stored.format})`,
    )
  }
  return stored.records
}

const writeAll = async (records: TopUpRecord[]): Promise<void> => {
  const loaded = records
    .filter((r) => r.state === "loaded")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(KEEP_LOADED)
  const pruned = records.filter((r) => !loaded.includes(r))
  const stored: Stored = { format: FORMAT, records: pruned }
  await Keychain.setInternetCredentials(SERVER, USERNAME, JSON.stringify(stored))
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
}

export const createTopUpStore = (now: () => number = Date.now): TopUpStore => ({
  list: () => serialized(readAll),
  get: (id) => serialized(async () => (await readAll()).find((r) => r.id === id)),
  put: (record) =>
    serialized(async () => {
      const records = await readAll()
      if (records.some((r) => r.id === record.id)) {
        throw new TopUpStoreError(`top-up ${record.id} is already saved`)
      }
      await writeAll([...records, record])
      return record
    }),
  update: (id, change) =>
    serialized(async () => {
      const records = await readAll()
      const index = records.findIndex((r) => r.id === id)
      if (index < 0) throw new TopUpStoreError(`top-up ${id} is not saved`)
      const next = { ...change(records[index]), id, updatedAt: now() }
      await writeAll(records.map((r, i) => (i === index ? next : r)))
      return next
    }),
  remove: (id) =>
    serialized(async () => {
      const records = await readAll()
      await writeAll(records.filter((r) => r.id !== id))
    }),
  removeIf: (id, test) =>
    serialized(async () => {
      const records = await readAll()
      const record = records.find((r) => r.id === id)
      if (!record || !test(record)) return false
      await writeAll(records.filter((r) => r !== record))
      return true
    }),
})
