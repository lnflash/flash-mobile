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
  CardError,
  CardInfo,
  CardNeedsUpdateError,
  CardProtocolError,
  CardRecord,
  CardTap,
  PinForm,
  SW_NO_OWNER,
  SW_OWNER_PROOF,
  Transceiver,
  WrongCardError,
  cardRecordValue,
  getCardRecord,
  getInfo,
  setCardPin,
  setOpenCardRecord,
  verifyCardPin,
} from "./cashu-card"
import { getCardBridge } from "./cashu-card-bridge"
import {
  CardLimits,
  NO_LIMITS,
  allowLoad,
  deriveOwnerKey,
  limitValue,
  ownerSigner,
  randomOwnerKey,
  refreshCard,
  setLimits,
  setOwner,
} from "./cashu-card-owner"
import { sameMint } from "./cashu-card-topup/mint-url"

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

// The seed the last mnemonic made: its PBKDF2 runs once per mnemonic per app
// session, so the per-card HMAC (`deriveOwnerKey`) is all a read tap pays.
let seedCache: { mnemonic: string; seed: Uint8Array } | undefined

/**
 * The app's BIP-39 seed (64 bytes), or undefined when the phone has none.
 * Read only: a seed is never made here. The seed's PBKDF2 takes a moment, so
 * it runs once per mnemonic and is kept for the session: warm it before a tap
 * (`readFlashcard` does), and a tap that needs it then pays only the
 * Keychain read. A different mnemonic (a restore, another account) is
 * derived afresh.
 */
export const loadSeed = async (): Promise<Uint8Array | undefined> => {
  const credentials = await Keychain.getInternetCredentials(SEED_SERVER)
  if (!credentials) return undefined
  const mnemonic = credentials.password
  if (seedCache?.mnemonic === mnemonic) return seedCache.seed
  if (!bip39.validateMnemonic(mnemonic)) return undefined
  const seed = Uint8Array.from(bip39.mnemonicToSeedSync(mnemonic))
  seedCache = { mnemonic, seed }
  return seed
}

/** Forgets the session's seed: for a spec that changes the phone's seed. */
export const resetSeedCache = () => {
  seedCache = undefined
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

/**
 * Whether this phone is the card's owner, asked of the card itself in a tap
 * that has selected it, as Foxy's `cardGrant` asks (08a-flashcard.js, the
 * grant to load, read as `card.mine`). Holding a key is not owning the card:
 * every phone with a seed derives a key for every card.
 *
 * Every key but the dev bridge's (the simulated card's owner, never saved)
 * is offered as ALLOW_LOAD's proof (GET_NONCE, ALLOW_LOAD), a saved one too.
 * A saved key is not always one the card took: `setUpCard` saves it before
 * SET_OWNER, so a setup cut short leaves a key saved here for a card still
 * open, which another phone may then set up (spec/APDU.md, Personalisation:
 * the first phone to set it up claims it). `9000` and the key is this phone's,
 * saved here (if it was not already) so REFRESH finds it; `6A91` (another
 * phone's card) or `6A90` (no owner) and it is not. Resolves the key the card
 * took, or undefined. Anything else, a Keychain that cannot be read or the
 * card leaving, rejects: the caller knows nothing either way. An accepted
 * ALLOW_LOAD leaves the grant on for the rest of the tap, and changes nothing
 * else.
 */
export const confirmOwnerKey = async (
  transceive: Transceiver,
  cardPubkey: string,
  save: typeof saveOwnerKey = saveOwnerKey,
): Promise<OwnerKey | undefined> => {
  const key = await ownerKeyFor(cardPubkey)
  if (!key) return undefined
  if (key.source === "dev") return key
  try {
    await allowLoad(transceive, ownerSigner(key.privateKey))
  } catch (err) {
    if (refusedAsNotOwner(err)) return undefined
    throw err
  }
  return keepTakenKey(cardPubkey, key, save)
}

/** The card's answer that this phone is not its owner: `6A91` (another's) or `6A90` (none). */
const refusedAsNotOwner = (err: unknown) =>
  err instanceof CardError && (err.sw === SW_OWNER_PROOF || err.sw === SW_NO_OWNER)

/**
 * A key the card just took: it is this phone's whether or not the Keychain
 * keeps it now. A save that fails is tried again at the next owner's command;
 * a key saved already, or the dev bridge's, is left as it is (`saveOwnerKey`).
 */
const keepTakenKey = async (
  cardPubkey: string,
  key: OwnerKey,
  save: typeof saveOwnerKey,
): Promise<OwnerKey> => {
  if (key.saved || key.source === "dev") return key
  const saved = await save(cardPubkey, key).then(
    () => true,
    () => false,
  )
  return { ...key, saved }
}

/**
 * A LOCKED card's REFRESH, sent with this phone's key for it, and the card's
 * answer read as whose card it is. A locked card refuses ALLOW_LOAD (`6986`,
 * spec/APDU.md, ALLOW_LOAD), so `confirmOwnerKey` cannot ask it, and Foxy
 * never sends the grant to a locked card (08a-flashcard.js, `cardGrant` is
 * skipped for `card.info.locked`). REFRESH is the one owner's command a
 * locked card still takes (spec/APDU.md, REFRESH: "a locked card too"), and
 * the caller sends it only when the card's window has rolled, so it is a
 * refresh the card needs and the answer comes with it.
 *
 * `9000` and the card is this phone's: resolves the key (saved here if it was
 * not, as `confirmOwnerKey` saves one) and the card's `now`. `6A91` (another
 * phone's card) or `6A90` (no owner) resolves undefined: a wrong proof costs
 * no PIN try and changes nothing (spec/APDU.md, the owner's proof). With no
 * key here nothing is sent. Anything else rejects: the caller knows nothing
 * either way.
 */
export const refreshAsOwner = async (
  transceive: Transceiver,
  cardPubkey: string,
  header: number[],
): Promise<{ key: OwnerKey; now: number } | undefined> => {
  const key = await ownerKeyFor(cardPubkey)
  if (!key) return undefined
  let now: number
  try {
    now = await refreshCard(transceive, ownerSigner(key.privateKey), header)
  } catch (err) {
    if (refusedAsNotOwner(err)) return undefined
    throw err
  }
  return { key: await keepTakenKey(cardPubkey, key, saveOwnerKey), now }
}

/**
 * The applet versions setup writes to (ENG-825), as SELECT's `[major, minor]`.
 * Any other is refused before anything is written: older cards (2.0, 2.1)
 * and newer ones alike, until a version is checked and added here.
 */
export const SETUP_APPLET_VERSIONS: readonly (readonly [number, number])[] = [[2, 2]]

/**
 * What a setup sets out to write, fixed at its first tap press (ENG-825) and
 * kept for every retry tap of the same sequence: the card it is for (its key,
 * the applet's only identity), the record it writes, and the owner's limits
 * it writes after SET_OWNER (ENG-827). The PIN itself is never kept here,
 * only whether one was chosen.
 */
export type SetupIntent = Readonly<{
  cardPubkey: string
  mint: string
  /** The record's unit: 0, sat. */
  unit: 0
  /** The app's pieces carry no date, so its cards take no refund key. */
  refundKey: null
  design: null
  pinChosen: boolean
  /**
   * The owner's SET_LIMIT, sent in the same tap after SET_OWNER (ENG-827).
   * Absent on an ENG-826 record: such a setup never sends SET_LIMIT, and is
   * never verified.
   */
  limits?: Readonly<CardLimits>
}>

/**
 * What this sequence has sent so far, set just BEFORE each write goes out: a
 * write whose answer is lost may have landed, and the next tap may find it.
 * `ownerSent` (SET_OWNER, ENG-826) implies `recordSent`. `limitsSent`
 * (SET_LIMIT, ENG-827) implies `ownerSent`; `verified` is set once the card
 * read back everything the intent wrote. Both are absent on ENG-826 records.
 */
export type SetupProgress = {
  pinSent: boolean
  recordSent: boolean
  ownerSent: boolean
  limitsSent?: boolean
  verified?: boolean
}

/**
 * A field the card read back that differs from the intent: of the record
 * (ENG-826), or, at verification (ENG-827), the owner flag and the limits.
 */
export type ReadBackField =
  | "unset"
  | "mint"
  | "unit"
  | "refundKey"
  | "design"
  | "owner"
  | "dailyLimit"
  | "paymentLimit"
  | "allowance"
  | "rollBudget"

/** What the card's GET_CARD said of its record after setup wrote it. */
export type HeldByCard = {
  mint: string
  unit: number
  refundKey: string | null
  design: string | null
}

/**
 * The wallet's own record of a card setup (ENG-826), kept in the persisted
 * `flashcardV2` slice by card pubkey and written BEFORE each setup write goes
 * out: a restart between taps resumes the same intent and progress. Nothing
 * secret: never the PIN, the seed or any key, only whether a PIN was chosen.
 */
export type CardSetup = {
  v: 1
  intent: SetupIntent
  progress: SetupProgress
  /**
   * `started` while writes are going out; `mismatched` when the card read back
   * a record other than the one written (final: SET_OWNER never went out);
   * `set-up` once SET_OWNER went through.
   */
  status: "started" | "mismatched" | "set-up"
  /** What the card read back, once it has (`mismatched`, `set-up`). */
  heldByCard?: HeldByCard
  /** Which fields differed, for `mismatched`. */
  mismatch?: ReadBackField[]
  /** ms since epoch */
  updatedAt: number
  /** ms since epoch, for `set-up`. */
  setUpAt?: number
  /**
   * ENG-827: the card read back, in one tap after SET_OWNER and SET_LIMIT,
   * everything the intent wrote, its owner flag and its limits included.
   * A `set-up` record with this is "holder setup verified". Point in time:
   * a later change under Limits is not reflected here.
   */
  verification?: SetupVerification
  /** ENG-827: what a `set-up` record's last verifying read did not confirm. */
  unconfirmed?: ReadBackField[]
  /**
   * ENG-827: the last verifying read found limits that are neither the
   * intent's nor a new card's. Setup never overwrites them, so no tap can
   * finish it: the holder is pointed to Limits instead.
   */
  limitsChangedElsewhere?: boolean
  /**
   * ENG-827: after `limitsChangedElsewhere`, the owner's SET_LIMIT under
   * Limits went through on this phone (`cardLimitsSet`): the holder has dealt
   * with the limits, and the card screen stops pointing them there. The setup
   * stays unverified: the card holds the holder's limits, not the intent's.
   */
  limitsSavedSince?: boolean
}

/** What the card said when its setup was verified (ENG-827). */
export type SetupVerification = {
  /** ms since epoch */
  at: number
  held: HeldByCard & { owner: true } & CardLimits
}

/**
 * A stored setup record in the format this app reads (`v: 1`), else
 * undefined: a record of an unknown format is ignored, never read as v1.
 */
export const currentSetup = (setup: CardSetup | undefined): CardSetup | undefined =>
  setup && setup.v === 1 ? setup : undefined

/**
 * A `set-up` record (ENG-827) whose holder setup is not verified yet: it
 * carries the intent's limits, SET_OWNER went out, and no verifying read
 * confirmed it. An ENG-826 record (no limits) never is: it is left as it is.
 */
const setupNotVerified = (setup: CardSetup | undefined): setup is CardSetup =>
  setup !== undefined &&
  setup.status === "set-up" &&
  setup.intent.limits !== undefined &&
  setup.progress.ownerSent &&
  setup.verification === undefined

/**
 * A `set-up` record (ENG-827) whose holder setup is not verified yet and that
 * a tap can still finish: not one whose card holds limits from elsewhere
 * (`setupLimitsDiffer`), which setup never overwrites.
 */
export const setupUnverified = (setup: CardSetup | undefined): boolean =>
  setupNotVerified(setup) && !setup.limitsChangedElsewhere

/**
 * A `set-up` record (ENG-827) not verified because the card holds limits
 * that are neither the intent's nor a new card's: no tap finishes it, and the
 * holder checks them under Limits. Once the holder has saved limits there
 * (`limitsSavedSince`), it is no longer said.
 */
export const setupLimitsDiffer = (setup: CardSetup | undefined): boolean =>
  setupNotVerified(setup) &&
  setup.limitsChangedElsewhere === true &&
  setup.limitsSavedSince !== true

/** Writes a setup record and resolves once it is on disk; rejects when it is not. */
export type PersistSetup = (setup: CardSetup) => Promise<void>

/**
 * Fixes the intent of a setup: the mint is checked as SET_CARD would take it
 * (`cardRecordValue`) and the limits as SET_LIMIT would (`limitValue`) first,
 * so a mint the card cannot hold or limits it cannot take fail before any
 * APDU is sent. The limits are none (`NO_LIMITS`) unless given (ENG-827). A
 * no-PIN allowance above 0 with no PIN is refused here too: the card would
 * answer SET_LIMIT `6985` after SET_OWNER, and the setup would be stranded.
 */
export const freezeSetupIntent = ({
  cardPubkey,
  mint,
  pin,
  limits = NO_LIMITS,
}: {
  cardPubkey: string
  mint: string
  pin?: string
  limits?: CardLimits
}): SetupIntent => {
  cardRecordValue({ mint })
  limitValue(limits)
  if (limits.allowance > 0 && !pin) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    throw new CardNotOpenError("unreadable")
  }
  return Object.freeze({
    cardPubkey,
    mint,
    unit: 0,
    refundKey: null,
    design: null,
    pinChosen: Boolean(pin),
    limits: Object.freeze({
      day: limits.day,
      payment: limits.payment,
      allowance: limits.allowance,
      rollBudget: limits.rollBudget,
    }),
  })
}

/** A fresh sequence's progress: nothing sent. */
export const newSetupProgress = (): SetupProgress => ({
  pinSent: false,
  recordSent: false,
  ownerSent: false,
  limitsSent: false,
  verified: false,
})

/** Whether a sequence has sent any write: then its intent is not rebuilt. */
export const setupWriteSent = (progress: SetupProgress) =>
  progress.pinSent || progress.recordSent

export type SetUpArgs = {
  /** What this tap's SELECT and GET_PUBKEY said. */
  tap: CardTap
  /** This tap's GET_INFO. */
  info: CardInfo
  /** A PIN to set on the card, exactly when `intent.pinChosen`. */
  pin?: string
  /** What the sequence set out to write (`freezeSetupIntent`). */
  intent: SetupIntent
  /** What the sequence has sent; updated here before each write. */
  progress: SetupProgress
  /** The tip block header, when the phone has one: the clock's anchor. */
  anchor?: number[]
  key: OwnerKey
  /**
   * Writes the sequence's record (ENG-826) and resolves once it is on disk.
   * Run before SET_PIN, SET_CARD and SET_OWNER: a rejection means that write
   * is not sent.
   */
  persist: PersistSetup
}

/** Why a card cannot be set up (ENG-825): nothing was written to it. */
export type CardNotOpenReason =
  /** It has an owner. */
  | "owned"
  /** It holds unspent value. */
  | "in-use"
  /** It has a PIN this sequence did not set, or a blocked one. */
  | "pin-set"
  /** It has spent slots: it has been used. */
  | "used"
  /** LOCK_CARD has run. */
  | "locked"
  /** A daily, payment or no-PIN limit is set, or something was signed for. */
  | "limits-set"
  /** Its record names another mint. */
  | "other-mint"
  /** Its answers do not add up: nothing they say is acted on. */
  | "unreadable"

/** The card is not one setup may write to: nothing was written. */
export class CardNotOpenError extends Error {
  constructor(readonly reason: CardNotOpenReason, readonly mint?: string) {
    super(`this card cannot be set up (${reason})`)
    this.name = "CardNotOpenError"
  }
}

/**
 * The card read back a record other than the one setup wrote (ENG-826):
 * setup stopped before SET_OWNER, and this phone does not own the card.
 */
export class SetupReadBackError extends Error {
  constructor(readonly fields: ReadBackField[]) {
    super(`the card did not keep the setup record (${fields.join(", ")})`)
    this.name = "SetupReadBackError"
  }
}

/**
 * The card did not confirm, after SET_OWNER, everything the setup wrote
 * (ENG-827): it is set up and this phone owns it, but it is not verified.
 * The next tap of the same sequence finishes it. `limitsChangedElsewhere`
 * when the card holds limits other than the intent's and not a new card's:
 * setup never overwrites those (the holder may have set them under Limits).
 */
export class SetupUnconfirmedError extends Error {
  readonly limitsChangedElsewhere: boolean

  constructor(
    readonly fields: ReadBackField[],
    { limitsChangedElsewhere = false }: { limitsChangedElsewhere?: boolean } = {},
  ) {
    super(`the card did not confirm its setup (${fields.join(", ")})`)
    this.name = "SetupUnconfirmedError"
    this.limitsChangedElsewhere = limitsChangedElsewhere
  }
}

/**
 * Throws `CardNeedsUpdateError` for an applet version setup does not write to
 * (`SETUP_APPLET_VERSIONS`): "older" below every one of them, else "newer".
 */
export const checkSetupVersion = (version: number[]): void => {
  const supported =
    version.length === 2 &&
    SETUP_APPLET_VERSIONS.some(
      ([major, minor]) => version[0] === major && version[1] === minor,
    )
  if (supported) return
  const older = SETUP_APPLET_VERSIONS.every(
    ([major, minor]) =>
      version[0] < major || (version[0] === major && (version[1] ?? 0) < minor),
  )
  throw new CardNeedsUpdateError(older ? "older" : "newer")
}

/**
 * The guard before any setup write (ENG-825): this tap's SELECT, GET_PUBKEY,
 * GET_INFO and GET_CARD held to the sequence's intent. Throws on the first
 * miss, in this order: another card (`WrongCardError`), an applet version
 * setup does not write to (`CardNeedsUpdateError`), answers that do not add
 * up (`unreadable`), then a card that is owned, locked, funded, used, has
 * limits, has a PIN this sequence did not set, or a record for another mint.
 * Pure: it sends nothing.
 */
export const checkSetupState = ({
  tap,
  info,
  record,
  intent,
  progress,
}: {
  tap: CardTap
  info: CardInfo
  record: CardRecord
  intent: SetupIntent
  progress: SetupProgress
}): void => {
  if (tap.pubkey !== intent.cardPubkey) throw new WrongCardError(tap.pubkey)
  checkSetupVersion(tap.version)
  if (
    info.major !== tap.version[0] ||
    info.minor !== tap.version[1] ||
    info.pinState === "unknown" ||
    info.format !== 4 ||
    info.unspent + info.spent + info.empty !== info.maxSlots ||
    info.recordSet !== record.recordSet ||
    (record.recordSet && record.unit !== 0)
  ) {
    throw new CardNotOpenError("unreadable")
  }
  if (info.hasOwner) throw new CardNotOpenError("owned")
  if (info.locked) throw new CardNotOpenError("locked")
  if (info.unspent > 0) throw new CardNotOpenError("in-use")
  if (info.spent > 0) throw new CardNotOpenError("used")
  // A PIN on the card is this sequence's own only when it chose one and sent
  // SET_PIN: a resume after a lost answer finds it there.
  const ownPin = info.pinState === "set" && progress.pinSent && intent.pinChosen
  if (
    info.dailyLimit > 0 ||
    info.paymentLimit > 0 ||
    info.allowance > 0 ||
    info.nopinSpent > 0 ||
    info.spentToday > 0 ||
    record.dailyLimit > 0 ||
    // VERIFY_PIN arms the no-PIN allowance (D20), so this sequence's own
    // VERIFY_PIN arms it too; a PIN from before is told as such below.
    (record.allowanceArmed && !ownPin && info.pinState === "unset")
  ) {
    throw new CardNotOpenError("limits-set")
  }
  if (info.pinState === "blocked" || (info.pinState === "set" && !ownPin)) {
    throw new CardNotOpenError("pin-set")
  }
  if (record.recordSet && !sameMint(record.mint, intent.mint)) {
    throw new CardNotOpenError("other-mint", record.mint)
  }
}

/** What `record` says the card holds, as a setup record keeps it. */
export const heldByCard = (record: CardRecord): HeldByCard => ({
  mint: record.mint,
  unit: record.unit,
  refundKey: record.refundKey ?? null,
  design: record.design ?? null,
})

/**
 * The GET_CARD read back after SET_CARD (ENG-826) held to the intent: the
 * fields that differ, none when the card kept what was written. The mint is
 * compared exactly, as the bytes just written; the design must read back as
 * the intent's, zeros for none, and an answer that stops before it differs.
 * Pure: it sends nothing.
 */
export const compareReadBack = (
  intent: SetupIntent,
  record: CardRecord,
): ReadBackField[] => {
  const fields: ReadBackField[] = []
  if (!record.recordSet) fields.push("unset")
  if (record.mint !== intent.mint) fields.push("mint")
  if (record.unit !== intent.unit) fields.push("unit")
  if ((record.refundKey ?? null) !== intent.refundKey) fields.push("refundKey")
  if (record.design !== intent.design) fields.push("design")
  return fields
}

/**
 * The limit fields in which the card differs from `limits`: the daily limit
 * from GET_INFO and GET_CARD both, the payment limit and the allowance from
 * GET_INFO (the payment limit reads 0 without the owner's grant), and the
 * rollover budget from GET_CARD.
 */
const limitFields = (
  limits: CardLimits,
  info: CardInfo,
  record: CardRecord,
): ReadBackField[] => {
  const fields: ReadBackField[] = []
  if (info.dailyLimit !== limits.day || record.dailyLimit !== limits.day) {
    fields.push("dailyLimit")
  }
  if (info.paymentLimit !== limits.payment) fields.push("paymentLimit")
  if (info.allowance !== limits.allowance) fields.push("allowance")
  if (record.rollBudget !== limits.rollBudget) fields.push("rollBudget")
  return fields
}

/** Whether two sets of limits are the same, field for field. */
export const sameLimits = (a: CardLimits, b: CardLimits): boolean =>
  a.day === b.day &&
  a.payment === b.payment &&
  a.allowance === b.allowance &&
  a.rollBudget === b.rollBudget

/**
 * The verifying read after SET_OWNER and SET_LIMIT (ENG-827) held to the
 * intent: the record's fields (`compareReadBack`), the owner flag, and the
 * intent's limits. Read GET_INFO under the owner's grant (ALLOW_LOAD) first:
 * without it the card says its payment limit is 0. None when everything
 * matches. Pure: it sends nothing.
 */
export const compareVerification = (
  intent: SetupIntent,
  info: CardInfo,
  record: CardRecord,
): ReadBackField[] => {
  const fields = compareReadBack(intent, record)
  if (!info.hasOwner) fields.push("owner")
  if (intent.limits) fields.push(...limitFields(intent.limits, info, record))
  return fields
}

/**
 * The setup record for `intent` at `progress`, copied: later progress never
 * reaches a record already made. `at` (ms) is its `updatedAt`, now by default.
 */
export const setupRecord = (
  intent: SetupIntent,
  progress: SetupProgress,
  {
    status,
    at = Date.now(),
    ...extra
  }: Pick<CardSetup, "status"> &
    Partial<
      Pick<
        CardSetup,
        | "heldByCard"
        | "mismatch"
        | "setUpAt"
        | "verification"
        | "unconfirmed"
        | "limitsChangedElsewhere"
      >
    > & {
      at?: number
    },
): CardSetup => ({
  v: 1,
  intent: { ...intent },
  progress: { ...progress },
  status,
  ...extra,
  updatedAt: at,
})

/** Field names only: a setup record that could not be written is logged without its content. */
const warnUnsaved = (status: CardSetup["status"], err: unknown) =>
  console.warn(
    `Cashu card setup record (${status}) not saved: ${
      err instanceof Error ? err.name : typeof err
    }`,
  )

/** GET_INFO then GET_CARD; an answer framed wrong is unreadable, and nothing it says is acted on. */
const readInfoAndRecord = async (
  transceive: Transceiver,
): Promise<{ info: CardInfo; record: CardRecord }> => {
  try {
    const info = await getInfo(transceive)
    const record = await getCardRecord(transceive)
    return { info, record }
  } catch (err) {
    if (err instanceof CardProtocolError) throw new CardNotOpenError("unreadable")
    throw err
  }
}

export type FinishHolderSetupArgs = {
  /** The sequence's intent; it must carry `limits` (not an ENG-826 record). */
  intent: SetupIntent
  /** The sequence's progress; updated here as setupRecord's are. */
  progress: SetupProgress
  /** The owner key the card took. */
  key: OwnerKey
  persist: PersistSetup
  /** This tap's ALLOW_LOAD already went through: the grant is on. */
  granted: boolean
  /** When SET_OWNER went through, when known: kept on the record. */
  setUpAt?: number
  /**
   * This tap sent the intent's SET_LIMIT just now (`setUpCard`): it is read
   * back, never sent again.
   */
  limitsWritten?: boolean
}

/**
 * The holder setup's last step (ENG-827), on a card this phone owns: the
 * owner's grant (ALLOW_LOAD, unless this tap has it already), then GET_INFO
 * (P1 = 1, so under the grant it says the payment limit) and GET_CARD, held
 * to the intent (`compareVerification`). A tap cut short after SET_OWNER is
 * finished here by the next one:
 *
 *   - the card's limits are the intent's: nothing is written;
 *   - they are a new card's (0/0/0, budget 7): `limitsSent` is persisted
 *     (on disk before it goes out; a rejection sends nothing), then
 *     SET_LIMIT, ALLOW_LOAD again (in case SET_LIMIT ends the grant) and the
 *     read again. This covers a resume before SET_LIMIT and a SET_LIMIT
 *     whose answer was lost;
 *   - anything else is never overwritten: the holder may have set them under
 *     Limits since. The setup is unconfirmed (`limitsChangedElsewhere`).
 *
 * All matching, the record is `set-up` with `verification`, and that is
 * resolved. Otherwise it is `set-up` with `unconfirmed`, and
 * `SetupUnconfirmedError` is thrown. Either final record that is not saved
 * only warns: the next tap verifies again.
 */
export async function finishHolderSetup(
  transceive: Transceiver,
  {
    intent,
    progress,
    key,
    persist,
    granted,
    setUpAt,
    limitsWritten = false,
  }: FinishHolderSetupArgs,
): Promise<SetupVerification> {
  const { limits } = intent
  // An ENG-826 record has no limits to write or to verify.
  if (!limits) throw new CardNotOpenError("unreadable")
  const sign = ownerSigner(key.privateKey)
  if (!granted) await allowLoad(transceive, sign)
  let { info, record } = await readInfoAndRecord(transceive)
  let limitsChangedElsewhere = false
  if (!limitsWritten && limitFields(limits, info, record).length > 0) {
    if (limitFields(NO_LIMITS, info, record).length === 0) {
      const next = { ...progress, limitsSent: true }
      await persist(
        setupRecord(intent, next, {
          status: "set-up",
          heldByCard: heldByCard(record),
          setUpAt: setUpAt ?? Date.now(),
        }),
      )
      Object.assign(progress, next)
      await setLimits(transceive, sign, limits)
      await allowLoad(transceive, sign)
      ;({ info, record } = await readInfoAndRecord(transceive))
    } else {
      limitsChangedElsewhere = true
    }
  }
  const fields = compareVerification(intent, info, record)
  const held = heldByCard(record)
  const at = Date.now()
  if (fields.length === 0) {
    const verification: SetupVerification = {
      at,
      held: {
        ...held,
        owner: true,
        day: info.dailyLimit,
        payment: info.paymentLimit,
        allowance: info.allowance,
        rollBudget: record.rollBudget,
      },
    }
    const next = { ...progress, verified: true }
    await persist(
      setupRecord(intent, next, {
        status: "set-up",
        heldByCard: held,
        setUpAt: setUpAt ?? at,
        verification,
        at,
      }),
    ).then(
      () => {
        Object.assign(progress, next)
      },
      (err) => warnUnsaved("set-up", err),
    )
    return verification
  }
  await persist(
    setupRecord(intent, progress, {
      status: "set-up",
      heldByCard: held,
      setUpAt: setUpAt ?? at,
      unconfirmed: fields,
      ...(limitsChangedElsewhere ? { limitsChangedElsewhere: true } : {}),
      at,
    }),
  ).catch((err) => warnUnsaved("set-up", err))
  throw new SetupUnconfirmedError(fields, { limitsChangedElsewhere })
}

/**
 * Personalisation, one tap, owner last (spec/APDU.md, Personalisation), so a
 * setup cut short is finished by the next tap of the same sequence. First the
 * guard (ENG-825): GET_CARD is read, and with this tap's SELECT, GET_PUBKEY
 * and GET_INFO held to the sequence's intent (`checkSetupState`); a card that
 * fails it is refused with nothing written. Then SET_PIN and VERIFY_PIN (when
 * a PIN is chosen), SET_CARD (the mint), then the key saved here, then
 * SET_OWNER with the tip header as its anchor. A card with a PIN this
 * sequence did not set is refused: its record can't be written without a PIN
 * nobody here knows.
 *
 * The key is saved BEFORE SET_OWNER is sent (the torn-write rule): a SET_OWNER
 * whose answer is lost may have landed, and a card owned by a key this phone
 * no longer has is orphaned for good. A lost answer is settled on the next
 * tap by the card's owner flag.
 *
 * The wallet's record (ENG-826): before each write the next progress is
 * persisted (`persist`, on disk before it resolves), so a restart resumes the
 * same intent; a failed persist sends nothing more. A PIN this sequence sent
 * that the card holds is not sent again: it is verified. After SET_CARD the
 * record is read back and held to the intent (`compareReadBack`); a card that
 * did not keep it is marked `mismatched` and refused before SET_OWNER
 * (`SetupReadBackError`).
 *
 * After SET_OWNER (ENG-827), with an intent that carries limits: the record
 * is persisted `set-up`, with what the card read back and `limitsSent`, and
 * that persist is strict: a rejection sends no SET_LIMIT, and the next tap
 * finishes through the owned path (the `started` record with `ownerSent` is
 * already on disk). Then the owner's SET_LIMIT with the intent's limits,
 * and `finishHolderSetup`: ALLOW_LOAD, GET_INFO and GET_CARD, held to the
 * intent. All matching, the record is verified; otherwise
 * `SetupUnconfirmedError`. With the default no-limits intent (`NO_LIMITS`)
 * no SET_LIMIT is sent at all (spec/APDU.md, Personalisation: SET_LIMIT only
 * "if the holder wants limits"): the `set-up` persist only warns, since no
 * write depends on it, and `finishHolderSetup` verifies the card's own
 * 0/0/0, budget 7. An ENG-826 intent (no limits) stops after
 * SET_OWNER, its `set-up` record persisted as before, a failure only warned.
 */
export async function setUpCard(
  transceive: Transceiver,
  { tap, info, pin, intent, progress, anchor, key, persist }: SetUpArgs,
  save: typeof saveOwnerKey = saveOwnerKey,
): Promise<void> {
  if (Boolean(pin) !== intent.pinChosen) throw new CardNotOpenError("unreadable")
  let record: CardRecord
  try {
    record = await getCardRecord(transceive)
  } catch (err) {
    // A malformed answer: nothing it says is acted on. A lost channel
    // propagates as it is: the next tap reads the card again.
    if (err instanceof CardProtocolError) throw new CardNotOpenError("unreadable")
    throw err
  }
  checkSetupState({ tap, info, record, intent, progress })
  const { cardPubkey } = intent
  const form: PinForm = { sealed: info.sealed, cardPubkey }
  // One tap at a time writes this sequence's progress, in order: persisted,
  // then marked, before the write, as a lost answer may still have landed.
  const mark = async (
    next: Partial<SetupProgress>,
    status: CardSetup["status"] = "started",
    extra: Partial<Pick<CardSetup, "heldByCard" | "setUpAt">> & { at?: number } = {},
  ) => {
    const progressed = { ...progress, ...next }
    await persist(setupRecord(intent, progressed, { status, ...extra }))
    Object.assign(progress, progressed)
  }
  if (pin) {
    // A SET_PIN this sequence sent that the card holds is not sent again; one
    // it sent that the card does not hold never landed, and is sent again.
    if (!(progress.pinSent && info.pinState === "set")) {
      await mark({ pinSent: true })
      await setCardPin(transceive, pin, form)
    }
    await verifyCardPin(transceive, pin, form)
  }
  await mark({ recordSent: true })
  await setOpenCardRecord(transceive, { mint: intent.mint })
  let readBack: CardRecord
  try {
    readBack = await getCardRecord(transceive)
  } catch (err) {
    if (err instanceof CardProtocolError) throw new CardNotOpenError("unreadable")
    throw err
  }
  const held = heldByCard(readBack)
  const mismatch = compareReadBack(intent, readBack)
  if (mismatch.length > 0) {
    await persist(
      setupRecord(intent, progress, { status: "mismatched", heldByCard: held, mismatch }),
    ).catch((err) => warnUnsaved("mismatched", err))
    throw new SetupReadBackError(mismatch)
  }
  await save(cardPubkey, key)
  await mark({ ownerSent: true })
  await setOwner(transceive, key.privateKey, anchor)
  const at = Date.now()
  if (!intent.limits) {
    // An ENG-826 intent: the next tap's already-mine path writes it again if
    // this one is lost.
    await persist(
      setupRecord(intent, progress, {
        status: "set-up",
        heldByCard: held,
        setUpAt: at,
        at,
      }),
    ).catch((err) => warnUnsaved("set-up", err))
    return
  }
  // No limits wanted (the default): a new card already holds 0/0/0 with
  // budget 7 (spec/APDU.md: limits are "all off on a new card"), and
  // Personalisation sends SET_LIMIT only "if the holder wants limits". None
  // is sent; the verifying read confirms the card's own.
  if (sameLimits(intent.limits, NO_LIMITS)) {
    await persist(
      setupRecord(intent, progress, {
        status: "set-up",
        heldByCard: held,
        setUpAt: at,
        at,
      }),
    ).catch((err) => warnUnsaved("set-up", err))
    await finishHolderSetup(transceive, {
      intent,
      progress,
      key,
      persist,
      granted: false,
      setUpAt: at,
    })
    return
  }
  await mark({ limitsSent: true }, "set-up", { heldByCard: held, setUpAt: at, at })
  await setLimits(transceive, ownerSigner(key.privateKey), intent.limits)
  await finishHolderSetup(transceive, {
    intent,
    progress,
    key,
    persist,
    granted: false,
    setUpAt: at,
    limitsWritten: true,
  })
}
