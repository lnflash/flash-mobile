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

// Attempts whose key has been spent by a DEFINITIVE, server-confirmed failure,
// and how many times. Absent means generation 0 — the common case, so an
// untouched attempt costs no entry at all.
//
// Deliberately NOT bounded by an eviction cap. Absence has to mean "generation
// 0" for a never-seen attempt — that is what lets a key be re-derived after a
// remount, or after the process itself was killed mid-flight — so evicting an
// entry hands the forgotten attempt back the exact uuid the server already
// answered with FAILURE, and the backend then replays that failure forever:
// the customer could never succeed. There is no reading of "safe to forget"
// available here, so the map does not forget. It only ever gains an entry on a
// definitive, server-confirmed failure (a few dozen bytes, human-paced), and
// the whole thing is discarded with the process.
const generationByAttempt = new Map<string, number>()

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
  generationByAttempt.set(fingerprint, (generationByAttempt.get(fingerprint) ?? 0) + 1)
}

/** Test seam — module state would otherwise leak between cases. */
export const resetSendAttemptKeys = (): void => {
  generationByAttempt.clear()
}
