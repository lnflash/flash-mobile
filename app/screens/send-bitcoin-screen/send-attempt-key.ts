// The idempotency key for a send, derived from the ATTEMPT rather than minted
// per hook instance — and, with it, the FROZEN send that key was first paired
// with.
//
// Why not a ref in useSendPayment: the retry this key exists to protect is the
// one the user actually performs, and on this flow that retry is a
// back-navigation. Going back unmounts the confirm screen, which destroys any
// ref, so a per-mount `uuidv4()` produces a *different* key for the repeat —
// exactly the case the backend cannot recognise, and the case the whole design
// is justified by (a send whose RESPONSE was lost has already moved the money;
// only a stable key lets the server return the original outcome instead of
// paying again).
//
// Deriving the key from the attempt's own content makes it survive anything
// that preserves the attempt: a remount, a rebuilt payment detail, a fresh
// screen. Same wallet + same destination + same amount + same memo ⇒ same key.
//
// Module state, keyed by the attempt, mirrors invoice-expiry.ts's
// first-sight map for the same reason: a per-mount store cannot see a
// back-and-forward.
import AsyncStorage from "@react-native-async-storage/async-storage"
import { WalletCurrency } from "@app/graphql/generated"
import { PaymentType } from "@galoymoney/client"
import { v5 as uuidv5 } from "uuid"

import { PaymentDetail } from "./payment-details/index.types"

/**
 * Namespace for send-attempt keys. Fixed and arbitrary — its only job is to
 * keep these v5 uuids from colliding with any other namespace's. Do NOT change
 * it: a build that derives different keys from the same attempt than the build
 * before it cannot recognise its own in-flight retries across an upgrade.
 */
const SEND_ATTEMPT_NAMESPACE = "3a1f4f8c-1c22-4b3e-9c1a-5d2b7e6f8a90"

/**
 * How long the server will answer for a key, and therefore how long anything
 * we remember about that key is worth remembering.
 *
 * Mirrors `IDEMPOTENCY_TTL_SECS` in lnflash/flash `src/app/payments/idempotency.ts`
 * (24h). Past it the backend has forgotten the key entirely, so a retired
 * generation is no longer protecting anyone and a frozen input is no longer
 * replayable — expiring both here keeps the two sides from disagreeing, and
 * bounds these maps for free.
 */
export const ATTEMPT_MEMORY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Where the retired generations live across a process restart.
 *
 * Versioned: a build that changes the entry shape must not read the old one.
 */
const GENERATIONS_STORAGE_KEY = "send-attempt-generations.v1"

type Generation = {
  /** How many times this attempt's key has been spent. */
  generation: number
  /** Wall-clock ms after which the server has forgotten the key anyway. */
  expiresAt: number
}

// Attempts whose key has been spent by a server-supplied outcome, and how many
// times. Absent means generation 0 — the common case, so an untouched attempt
// costs no entry at all.
//
// Keyed by a DIGEST of the fingerprint rather than the fingerprint itself: the
// fingerprint concatenates a wallet id, a bolt11 or lightning address and the
// user's memo, and this map is mirrored to disk. The digest is a v5 uuid over
// the same namespace, so it is stable across launches without putting any of
// that on the filesystem in readable form.
//
// Deliberately NOT bounded by an eviction cap. Absence has to mean "generation
// 0" for a never-seen attempt — that is what lets a key be re-derived after a
// remount — so evicting a live entry hands the forgotten attempt back the exact
// uuid the server already answered with FAILURE, and the backend then replays
// that failure until its own TTL runs out: the customer could never succeed.
// The ONLY safe eviction is the one the server itself performs, which is why
// entries carry `expiresAt` and are dropped on exactly that clock and no other.
const generationByAttempt = new Map<string, Generation>()

type FrozenSend = {
  /** The key this attempt was first sent with. */
  key: string
  /**
   * The send closure captured on the first Confirm — and with it the exact
   * mutation input: this bolt11, this settlement amount, this memo.
   */
  send: unknown
  expiresAt: number
}

// The frozen half of an unresolved attempt.
//
// The key alone is not enough, because the client and the server do not agree
// on what identifies a payment. The server binds the cached result to a
// `requestFingerprint` built from the WIRE input — `ln|${paymentRequest}`,
// `ln-noamount-usd|${paymentRequest}|${amount}`,
// `intraledger|${recipientWalletId}|${amount}` (lnflash/flash
// `src/app/payments/`) — while our fingerprint is deliberately built from what
// SURVIVES the retry, which excludes both a re-minted LNURL bolt11 and a
// price-derived settlement amount. Resending the same key with a rebuilt input
// therefore lands on `IdempotencyKeyReuseError`, not on a replay.
//
// So the repeat resends the frozen closure rather than the rebuilt payment
// detail, and client key and server fingerprint move in lockstep. Dropped the
// moment the attempt resolves (see `retireAttemptKey`), so at most one closure
// per in-flight send is retained.
const frozenByAttempt = new Map<string, FrozenSend>()

export type SendAttempt = {
  /** The wallet that will be debited. */
  walletId: string
  paymentType: string
  /**
   * What identifies the payee across a retry — see `attemptFingerprintOf`.
   * A payee-minted bolt11 for the invoice types; the lightning address for
   * LNURL, whose bolt11 is re-minted on every pass through the details screen.
   */
  destination: string
  /**
   * The amount the USER authored, in the currency they authored it in — NOT
   * the settlement amount, which for a USD/USDT wallet is derived from a
   * ticking price (`settlementAmountIsEstimated`).
   */
  unitOfAccountAmount: number
  unitOfAccountCurrency: string
  memo?: string
}

/**
 * A stable identity for "this payment, from this wallet, for this amount".
 *
 * Every field is one the user could change to mean a genuinely different
 * payment, so two sends that differ in any of them must not share a key —
 * otherwise the backend would answer the second with the first's outcome.
 */
export const attemptFingerprint = (attempt: SendAttempt): string =>
  [
    attempt.walletId,
    attempt.paymentType,
    attempt.destination,
    String(attempt.unitOfAccountAmount),
    attempt.unitOfAccountCurrency,
    attempt.memo ?? "",
    // NUL separator: none of the fields above can contain one, so no two
    // different attempts can join to the same string.
  ].join("\u0000")

/**
 * The fingerprint of the attempt a payment detail describes.
 *
 * Two fields are picked for what SURVIVES the retry rather than for what ends
 * up in the mutation input, because a fingerprint that moves on its own is no
 * fingerprint at all:
 *
 *  - the amount is `unitOfAccountAmount`, not `settlementAmount`. For a
 *    USD/USDT sending wallet the settlement amount is a price-derived estimate
 *    (`settlementAmountIsEstimated`), and the details screen re-derives it on
 *    every realtime-price tick — so the back-navigation that IS the retry
 *    hands back a detail whose settlement amount has moved by a cent, and the
 *    backend books the repeat as a second payment. `unitOfAccountAmount` is
 *    what the user actually authored and is carried verbatim through
 *    `setConvertMoneyAmount`.
 *  - the destination is the bolt11 only when the payee minted it. An LNURL
 *    detail's `paymentRequest` is re-minted on every pass forward through the
 *    details screen (IBEX caps those invoices at 60s), so keying on it would
 *    guarantee a different key for every retry. Its `destination` — the
 *    lightning address — is what persists, and the amount and memo above
 *    distinguish two different sends to it.
 *
 * Both exclusions are only SAFE because the send itself is frozen alongside
 * the key (`freezeAttempt`): what the fingerprint drops from the identity is
 * exactly what the frozen closure holds fixed, so the server still sees the
 * byte-identical input its own `requestFingerprint` is built from.
 */
export const attemptFingerprintOf = <T extends WalletCurrency>(
  paymentDetail: PaymentDetail<T>,
): string =>
  attemptFingerprint({
    walletId: paymentDetail.sendingWalletDescriptor.id,
    paymentType: paymentDetail.paymentType,
    destination:
      paymentDetail.paymentType === PaymentType.Lnurl
        ? paymentDetail.destination
        : paymentDetail.paymentRequest || paymentDetail.destination,
    unitOfAccountAmount: paymentDetail.unitOfAccountAmount.amount,
    unitOfAccountCurrency: paymentDetail.unitOfAccountAmount.currency,
    memo: paymentDetail.memo,
  })

/**
 * The storage/lookup handle for a fingerprint. See `generationByAttempt`.
 */
const digestOf = (fingerprint: string): string =>
  uuidv5(fingerprint, SEND_ATTEMPT_NAMESPACE)

/** The generation in force right now, ignoring anything the server has forgotten. */
const liveGeneration = (digest: string): number => {
  const entry = generationByAttempt.get(digest)
  if (!entry) return 0
  if (entry.expiresAt <= Date.now()) {
    generationByAttempt.delete(digest)
    return 0
  }
  return entry.generation
}

// A store we cannot write is a store that behaves like today's build: it must
// never be the reason a payment fails, and never something a caller has to
// await.
const ignoreStorageFailure = (): void => {}

const persistGenerations = (): void => {
  const now = Date.now()
  const live: Record<string, Generation> = {}
  for (const [digest, entry] of generationByAttempt) {
    if (entry.expiresAt > now) live[digest] = entry
  }
  AsyncStorage.setItem(GENERATIONS_STORAGE_KEY, JSON.stringify(live)).catch(
    ignoreStorageFailure,
  )
}

const readGenerations = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(GENERATIONS_STORAGE_KEY)
    if (!raw) return
    const stored: unknown = JSON.parse(raw)
    if (!stored || typeof stored !== "object") return
    const now = Date.now()
    const isLiveGeneration = (value: unknown): value is Generation => {
      const entry = value as Partial<Generation> | null
      return Boolean(
        entry &&
          typeof entry.generation === "number" &&
          typeof entry.expiresAt === "number" &&
          entry.expiresAt > now,
      )
    }

    for (const [digest, value] of Object.entries(stored as Record<string, unknown>)) {
      if (isLiveGeneration(value)) {
        const inMemory = generationByAttempt.get(digest)
        // A retirement recorded since this process started must not be undone
        // by a stale stored one, and vice versa: the HIGHER generation is the
        // one the server has already answered, so it wins either way.
        if (!inMemory || inMemory.generation < value.generation) {
          generationByAttempt.set(digest, {
            generation: value.generation,
            expiresAt: value.expiresAt,
          })
        }
      }
    }
  } catch {
    // Unreadable or corrupt: fall back to "nothing retired", i.e. today's
    // behaviour before this file persisted anything.
  }
}

let hydration: Promise<void> | undefined

/**
 * Load the retired generations written by previous runs.
 *
 * MUST be awaited before the first `attemptKey` of a process, and is a no-op
 * afterwards. Without it a force-quit — the normal reaction to a failed
 * payment — resets every attempt to generation 0 while the server still holds
 * its cached FAILURE for 24h, so the user's identical retry replays that
 * failure and they are locked out of that exact payment with nothing on screen
 * that explains why.
 */
export const hydrateSendAttemptKeys = (): Promise<void> => {
  if (!hydration) hydration = readGenerations()
  return hydration
}

/**
 * The key to send for `fingerprint` right now.
 *
 * Pure: called twice for the same attempt it returns the same uuid, which is
 * what makes a repeat recognisable. It changes only when `retireAttemptKey`
 * has been called for that attempt, or when the server's own 24h window on the
 * retired key has run out.
 */
export const attemptKey = (fingerprint: string): string =>
  uuidv5(
    `${fingerprint}\u0000#${liveGeneration(digestOf(fingerprint))}`,
    SEND_ATTEMPT_NAMESPACE,
  )

/**
 * The key AND the send to use for this attempt.
 *
 * On the first Confirm the given `send` is frozen alongside the key; every
 * repeat of the same attempt gets that same pair back, so the mutation input
 * the server fingerprints is byte-identical to the one it fingerprinted the
 * first time. Handing it the rebuilt payment detail instead — a re-minted
 * LNURL bolt11, a settlement amount one price tick along — makes the backend
 * answer `IdempotencyKeyReuseError` on precisely the retry this design exists
 * for.
 *
 * Callers must have awaited `hydrateSendAttemptKeys` first.
 */
export const freezeAttempt = <S>(
  fingerprint: string,
  send: S,
): { idempotencyKey: string; send: S } => {
  const digest = digestOf(fingerprint)
  const frozen = frozenByAttempt.get(digest)
  if (frozen && frozen.expiresAt > Date.now()) {
    return { idempotencyKey: frozen.key, send: frozen.send as S }
  }

  const key = attemptKey(fingerprint)
  frozenByAttempt.set(digest, {
    key,
    send,
    expiresAt: Date.now() + ATTEMPT_MEMORY_TTL_MS,
  })
  return { idempotencyKey: key, send }
}

/**
 * Spend this attempt's key, so the next send for the same attempt carries a
 * fresh one — and forget the input that key was frozen against.
 *
 * Called on any server-supplied status: the outcome is then KNOWN to the
 * client, so the next time this same content is authored it is a deliberate
 * second payment rather than a repeat. Every other exit — a thrown mutation,
 * an unreadable response, an `IdempotencyKeyReuseError` — deliberately keeps
 * both, because a repeat the server may already have committed must return the
 * original result rather than pay twice.
 *
 * Written through to storage so a force-quit cannot resurrect a spent key.
 */
export const retireAttemptKey = (fingerprint: string): void => {
  const digest = digestOf(fingerprint)
  generationByAttempt.set(digest, {
    generation: liveGeneration(digest) + 1,
    expiresAt: Date.now() + ATTEMPT_MEMORY_TTL_MS,
  })
  frozenByAttempt.delete(digest)
  persistGenerations()
}

/**
 * Test seam — module state would otherwise leak between cases.
 *
 * Marks the module as already hydrated rather than un-hydrated: a reset that
 * left `hydration` unset would send the next case racing the fire-and-forget
 * `removeItem` below, and it would sometimes read the previous case's retired
 * generations back out of the store. Hydration itself is covered by cases that
 * load the module cold, which is the situation it actually exists for.
 */
export const resetSendAttemptKeys = (): void => {
  generationByAttempt.clear()
  frozenByAttempt.clear()
  hydration = Promise.resolve()
  AsyncStorage.removeItem(GENERATIONS_STORAGE_KEY).catch(ignoreStorageFailure)
}
