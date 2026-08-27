// The idempotency key for a send, derived from the ATTEMPT rather than minted
// per hook instance.
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
import { v5 as uuidv5 } from "uuid"

/**
 * Namespace for send-attempt keys. Fixed and arbitrary — its only job is to
 * keep these v5 uuids from colliding with any other namespace's. Do NOT change
 * it: a build that derives different keys from the same attempt than the build
 * before it cannot recognise its own in-flight retries across an upgrade.
 */
const SEND_ATTEMPT_NAMESPACE = "3a1f4f8c-1c22-4b3e-9c1a-5d2b7e6f8a90"

/**
 * How many attempts a "this key is spent" reading is kept for. A send flow
 * visits a handful; the cap only stops a very long session growing the map
 * without bound. Exported so the eviction test tracks the real cap rather than
 * a copy of it.
 */
export const MAX_TRACKED_ATTEMPTS = 50

// Attempts whose key has been spent by a DEFINITIVE, server-confirmed failure,
// and how many times. Absent means generation 0 — the common case, so an
// untouched attempt costs no entry at all.
const generationByAttempt = new Map<string, number>()

export type SendAttempt = {
  /** The wallet that will be debited. */
  walletId: string
  paymentType: string
  /** The bolt11 that will go out, or the destination when there is no invoice. */
  destination: string
  /** Minor units off the sending wallet. */
  settlementAmount: number
  settlementCurrency: string
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
    String(attempt.settlementAmount),
    attempt.settlementCurrency,
    attempt.memo ?? "",
    // NUL separator: none of the fields above can contain one, so no two
    // different attempts can join to the same string.
  ].join("\u0000")

/**
 * The key to send for `fingerprint` right now.
 *
 * Pure: called twice for the same attempt it returns the same uuid, which is
 * what makes a repeat recognisable. It changes only when `retireAttemptKey`
 * has been called for that attempt.
 */
export const attemptKey = (fingerprint: string): string =>
  uuidv5(
    `${fingerprint}\u0000#${generationByAttempt.get(fingerprint) ?? 0}`,
    SEND_ATTEMPT_NAMESPACE,
  )

/**
 * Spend this attempt's key, so the next send for the same attempt carries a
 * fresh one.
 *
 * Called on exactly one exit: a definitive, server-confirmed `FAILURE`. There
 * we know nothing settled, and reusing the key would make the backend replay
 * the recorded failure — the customer could never succeed. Every other exit,
 * including a thrown mutation, deliberately keeps the key: a repeat the server
 * already committed must return the original result rather than pay twice.
 */
export const retireAttemptKey = (fingerprint: string): void => {
  const current = generationByAttempt.get(fingerprint)
  if (current === undefined && generationByAttempt.size >= MAX_TRACKED_ATTEMPTS) {
    const oldest = generationByAttempt.keys().next()
    if (!oldest.done) generationByAttempt.delete(oldest.value)
  }
  generationByAttempt.set(fingerprint, (current ?? 0) + 1)
}

/** Test seam — module state would otherwise leak between cases. */
export const resetSendAttemptKeys = (): void => {
  generationByAttempt.clear()
}
