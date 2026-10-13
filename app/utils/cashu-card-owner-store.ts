/**
 * Where this phone keeps its cards' owner keys, and how it finds one
 * (ENG-675, architect's decision 14).
 *
 * The owner key of a card this phone set up is derived from the app's BIP-39
 * seed (the Keychain's `mnemonic_key`, the wallet seed the Backup screens show
 * and verify) when the phone has one: restoring the seed on another phone
 * restores ownership. With no seed it is a random key, which lives only on
 * this phone, and setup says so. Either way the key is saved here, in the
 * Keychain (this device only), BEFORE SET_OWNER goes out: a card whose owner
 * was set to a key the phone then lost is orphaned for good. A saved key is
 * never deleted while the card reports an owner; nothing here deletes one.
 *
 * Reads are strict, as the top-up store's are (`cashu-card-topup/store.ts`): a
 * Keychain failure or an unreadable value throws rather than reading as "no
 * keys", because the next write would otherwise replace every key with one.
 */
import * as bip39 from "bip39"
import * as Keychain from "react-native-keychain"

import {
  CardInfo,
  PinForm,
  Transceiver,
  setCardPin,
  setOpenCardRecord,
  verifyCardPin,
} from "./cashu-card"
import { getCardBridge } from "./cashu-card-bridge"
import { deriveOwnerKey, randomOwnerKey, setOwner } from "./cashu-card-owner"

const SERVER = "flashcard-v2-owner"
const USERNAME = "owners"
const FORMAT = 1
/** The wallet seed's Keychain entry (`app/utils/breez-sdk/spark.ts`). */
export const SEED_SERVER = "mnemonic_key"

/** Where an owner key came from. */
export type OwnerKeySource =
  /** Derived from the app's seed: restoring the seed restores it. */
  | "seed"
  /** Random: it lives only on this phone. */
  | "device"
  /** The public TEST key a development build's card bridge carries: never saved. */
  | "dev"

export type OwnerKeyEntry = {
  /** The P-256 private key, 64 hex chars. */
  privateKey: string
  source: Exclude<OwnerKeySource, "dev">
  createdAt: number
}

/** An owner key as this phone has it for one card. */
export type OwnerKey = {
  privateKey: string
  source: OwnerKeySource
  /** Saved in this store: this phone set the card up, or proved it owns it since. */
  saved: boolean
}

export class OwnerKeyStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OwnerKeyStoreError"
  }
}

type Stored = { format: typeof FORMAT; keys: Record<string, OwnerKeyEntry> }

const isEntry = (value: unknown): value is OwnerKeyEntry => {
  const entry = value as Partial<OwnerKeyEntry> | null
  return (
    typeof entry?.privateKey === "string" &&
    /^[0-9a-f]{64}$/.test(entry.privateKey) &&
    (entry.source === "seed" || entry.source === "device") &&
    typeof entry.createdAt === "number"
  )
}

const readAll = async (): Promise<Record<string, OwnerKeyEntry>> => {
  const credentials = await Keychain.getInternetCredentials(SERVER)
  if (!credentials) return {}
  let stored: Partial<Stored>
  try {
    stored = JSON.parse(credentials.password)
  } catch {
    throw new OwnerKeyStoreError("the saved owner keys cannot be read")
  }
  if (
    stored?.format !== FORMAT ||
    !stored.keys ||
    typeof stored.keys !== "object" ||
    Array.isArray(stored.keys) ||
    !Object.values(stored.keys).every(isEntry)
  ) {
    throw new OwnerKeyStoreError(
      `the saved owner keys are in an unknown format (${stored?.format})`,
    )
  }
  return stored.keys
}

const writeAll = async (keys: Record<string, OwnerKeyEntry>): Promise<void> => {
  const stored: Stored = { format: FORMAT, keys }
  const saved = await Keychain.setInternetCredentials(
    SERVER,
    USERNAME,
    JSON.stringify(stored),
    { accessible: Keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  )
  if (saved === false) throw new OwnerKeyStoreError("the owner key was not saved")
}

// Every read-modify-write runs after the previous one.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T>(work: () => Promise<T>): Promise<T> => {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

const keyOf = (cardPubkey: string) => cardPubkey.toLowerCase()

export const ownerKeyStore = {
  get: (cardPubkey: string): Promise<OwnerKeyEntry | undefined> =>
    serialized(async () => (await readAll())[keyOf(cardPubkey)]),
  /**
   * Saves the card's key. A different key already saved for the card is never
   * replaced: the card may hold it as its owner.
   */
  put: (cardPubkey: string, entry: OwnerKeyEntry): Promise<OwnerKeyEntry> =>
    serialized(async () => {
      const keys = await readAll()
      const existing = keys[keyOf(cardPubkey)]
      if (existing) {
        if (existing.privateKey !== entry.privateKey) {
          throw new OwnerKeyStoreError("another owner key is saved for this card")
        }
        return existing
      }
      await writeAll({ ...keys, [keyOf(cardPubkey)]: entry })
      return entry
    }),
}

/**
 * The app's BIP-39 seed (64 bytes), or undefined when the phone has none.
 * Read only: a seed is never made here. Run it before a tap, never inside
 * one: the seed's PBKDF2 takes a moment.
 */
export const loadSeed = async (): Promise<Uint8Array | undefined> => {
  const credentials = await Keychain.getInternetCredentials(SEED_SERVER)
  if (!credentials || !bip39.validateMnemonic(credentials.password)) return undefined
  return Uint8Array.from(bip39.mnemonicToSeedSync(credentials.password))
}

/** The development bridge's owner key (`cashu-card-bridge.ts`); undefined in a release build. */
const devOwnerKey = (): OwnerKey | undefined => {
  const privateKey = getCardBridge()?.ownerKey
  return privateKey ? { privateKey, source: "dev", saved: false } : undefined
}

/**
 * The key this phone would prove ownership of `cardPubkey` with: the dev
 * bridge's in a development build, else the one saved for the card, else the
 * one the seed derives (a phone restored from the seed that set the card up).
 * Undefined when the phone has none. Whether the card takes it is the card's
 * to say (`6A91`).
 */
export const ownerKeyFor = async (cardPubkey: string): Promise<OwnerKey | undefined> => {
  const dev = devOwnerKey()
  if (dev) return dev
  const saved = await ownerKeyStore.get(cardPubkey)
  if (saved) return { privateKey: saved.privateKey, source: saved.source, saved: true }
  const seed = await loadSeed()
  if (!seed) return undefined
  return { privateKey: deriveOwnerKey(seed, cardPubkey), source: "seed", saved: false }
}

/**
 * The key this phone has already shown the card it owns (saved here), or the
 * dev bridge's: what an unprompted owner's command in a read tap (REFRESH)
 * signs with. Never derives from the seed, which takes a moment.
 */
export const savedOwnerKeyFor = async (
  cardPubkey: string,
): Promise<OwnerKey | undefined> => {
  const dev = devOwnerKey()
  if (dev) return dev
  const saved = await ownerKeyStore.get(cardPubkey)
  return saved
    ? { privateKey: saved.privateKey, source: saved.source, saved: true }
    : undefined
}

/**
 * A key to set a new card up with: the dev bridge's in a development build,
 * else the one the seed derives, else a random one that lives only on this
 * phone. Nothing is saved yet: `setUpCard` saves it before SET_OWNER.
 */
export const newOwnerKey = async (cardPubkey: string): Promise<OwnerKey> => {
  const dev = devOwnerKey()
  if (dev) return dev
  const seed = await loadSeed()
  if (seed) {
    return { privateKey: deriveOwnerKey(seed, cardPubkey), source: "seed", saved: false }
  }
  return { privateKey: randomOwnerKey(), source: "device", saved: false }
}

/**
 * Saves `key` for the card, unless it is the dev bridge's (never saved) or
 * saved already. A card that just took a proof by a seed-derived key the store
 * did not hold (a restored phone) is saved the same way.
 */
export const saveOwnerKey = async (
  cardPubkey: string,
  key: OwnerKey,
  now: () => number = Date.now,
): Promise<void> => {
  if (key.source === "dev" || key.saved) return
  await ownerKeyStore.put(cardPubkey, {
    privateKey: key.privateKey,
    source: key.source,
    createdAt: now(),
  })
}

export type SetUpArgs = {
  cardPubkey: string
  /** The card as this tap's read found it: open (no owner) and empty. */
  info: Pick<CardInfo, "hasOwner" | "unspent" | "pinState" | "sealed">
  /** A PIN to set on the card, or none: a 2.0 card may have none. */
  pin?: string
  /** The mint the card's pieces come from (its record). */
  mint: string
  /** The tip block header, when the phone has one: the clock's anchor. */
  anchor?: number[]
  key: OwnerKey
}

/** The card already has an owner, or holds value: setup is not for it. */
export class CardNotOpenError extends Error {
  constructor(readonly reason: "owned" | "in-use" | "pin-needed") {
    super(`this card cannot be set up (${reason})`)
    this.name = "CardNotOpenError"
  }
}

/**
 * Personalisation, one tap, owner last (spec/APDU.md, Personalisation), so a
 * setup cut short is finished by the next: SET_PIN and VERIFY_PIN (when a PIN
 * is chosen), SET_CARD (the mint), then the key saved here, then SET_OWNER
 * with the tip header as its anchor. An open card with a PIN set by someone
 * else must be given a new one: without it SET_CARD would need a PIN nobody
 * here knows.
 *
 * The key is saved BEFORE SET_OWNER is sent (the torn-write rule): a SET_OWNER
 * whose answer is lost may have landed, and a card owned by a key this phone
 * no longer has is orphaned for good. A lost answer is settled on the next
 * tap by the card's owner flag.
 */
export async function setUpCard(
  transceive: Transceiver,
  { cardPubkey, info, pin, mint, anchor, key }: SetUpArgs,
  save: typeof saveOwnerKey = saveOwnerKey,
): Promise<void> {
  if (info.hasOwner) throw new CardNotOpenError("owned")
  if (info.unspent > 0) throw new CardNotOpenError("in-use")
  if (!pin && info.pinState !== "unset") throw new CardNotOpenError("pin-needed")
  const form: PinForm = { sealed: info.sealed, cardPubkey }
  if (pin) {
    await setCardPin(transceive, pin, form)
    await verifyCardPin(transceive, pin, form)
  }
  await setOpenCardRecord(transceive, { mint })
  await save(cardPubkey, key)
  await setOwner(transceive, key.privateKey, anchor)
}
