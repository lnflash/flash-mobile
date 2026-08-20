// Invoice-expiry rules for the send flow.
//
// Runtime-import-free (the two imports below are type-only and erase at
// compile time) so the rules stay unit-testable under plain jest, mirroring
// max-send-amount.ts. Decoding is the caller's job — this module only reasons
// about the decoded timestamps.
//
// Related: @galoymoney/client exports `lightningInvoiceHasExpired(payReq)`,
// which `parsePaymentDestination` uses to reject an already-dead invoice at
// paste/scan time. It is deliberately NOT reused here. That helper answers
// "is this invoice expired?" strictly (`now < timeExpireDate`, no tolerance),
// which is the right question when the user has just supplied a destination
// and a wrong answer only costs them a re-scan. This module answers a
// different question — "should we refuse to transmit an invoice the user is
// actively trying to pay?" — where a wrong answer costs them the payment, so
// it deliberately allows a clock-skew grace window and fails open on a device
// clock that is provably wrong. Keep the two apart; do not "unify" them.
import type { WalletCurrency } from "@app/graphql/generated"
import type { PaymentType } from "@galoymoney/client"

// Why any of this exists: Flash IBEX receive invoices are short-lived, and
// the window is not a client-side convention — IBEX enforces it.
//
//   // flash src/domain/bitcoin/lightning/invoice-expiration.ts
//   // IBEX caps BOLT11 receive-invoice expiry by the account's currency type:
//   //   - msat currency accounts: up to 900s
//   //   - all other currency accounts (USD/USDT/JMD): up to 60s
//   export const IBEX_RECEIVE_MAX_EXPIRATION_SECONDS = SECS_PER_MIN
//
// Verified against a real failing invoice (ENG-555): issued 16:39:42Z,
// expiring 16:40:42Z — exactly 60 seconds.
//
// A minute is short enough that an ordinary confirm-screen pause outlives it,
// so the send flow must treat a held invoice as perishable rather than as a
// stable property of the payment.

/**
 * How far past the stated expiry the absolute backstop still lets a send
 * through, in seconds.
 *
 * Comparing `nowSeconds` against the stated expiry compares two *different*
 * clocks — the device's against the issuer's — and only the issuer's is
 * authoritative. Without a tolerance that comparison fails CLOSED on skew: a
 * handset running two minutes fast would mark every freshly minted 60-second
 * Flash invoice expired the instant it was created, and the user could never
 * send at all, where before this guard existed the backend (validating against
 * server time) would have accepted the payment.
 *
 * 120s swallows ordinary handset drift. It is not the primary signal — see
 * `firstSeenSeconds` below, which measures the device clock against *itself*
 * and so cannot be fooled by any offset at all.
 */
export const CLOCK_SKEW_GRACE_SECONDS = 120

// When each bolt11 was first seen, keyed by the invoice itself rather than by a
// screen mount.
//
// This is what makes the elapsed-time signal survive the reported retry. After
// a failed send the confirm screen disables its button, so the user goes Back,
// changes the amount and comes forward again — remounting the screen but
// reusing the SAME bolt11, because setAmount only rebuilds the detail around
// it. A per-mount reading restarts at zero there and the invoice looks fresh;
// keyed by the invoice, the original sighting is still on record and the guard
// can see that a full lifetime has passed under the user.
//
// Keying by the invoice is also what lets the reading START where the bolt11
// is first proved alive — `createLightningDestination`, one instant after
// `parsePaymentDestination` certified it (payment-destination/lightning.ts) —
// rather than at some later screen mount. Everything downstream (the amount
// screen, the confirm screen) registers unconditionally too; the first
// sighting wins, so those calls are no-ops.
const firstSightByInvoice = new Map<string, number>()

// A send flow visits a handful of invoices; this cap only stops a very long
// session from growing the map without bound. Exported so the eviction test
// tracks the real cap instead of a copy of it.
export const MAX_TRACKED_INVOICES = 50

/**
 * Record (once) when this device first saw `paymentRequest`, and return that
 * reading. It shares a clock with `nowSeconds`, so the difference is a true
 * elapsed duration — a handset ten minutes fast reads zero on a fresh invoice,
 * exactly like a correct one.
 */
export const noteInvoiceFirstSight = (
  paymentRequest: string,
  nowSeconds: number,
): number => {
  const seen = firstSightByInvoice.get(paymentRequest)
  if (seen !== undefined) return seen

  if (firstSightByInvoice.size >= MAX_TRACKED_INVOICES) {
    const oldest = firstSightByInvoice.keys().next()
    if (!oldest.done) firstSightByInvoice.delete(oldest.value)
  }
  firstSightByInvoice.set(paymentRequest, nowSeconds)
  return nowSeconds
}

/** Test seam — module state would otherwise leak between cases. */
export const resetInvoiceFirstSight = (): void => {
  firstSightByInvoice.clear()
}

export type InvoiceExpiryArgs = {
  /** Decoded bolt11 `timeExpireDate`, in epoch SECONDS. */
  timeExpireDate?: number | null
  /** Decoded bolt11 `timestamp` (issue time), in epoch SECONDS. */
  timestamp?: number | null
  /** Current time in epoch SECONDS, per the device clock. */
  nowSeconds: number
  /**
   * The device clock's reading when the send flow first saw this bolt11, in
   * epoch SECONDS — destination parse for a scanned/pasted/deep-linked
   * invoice, the confirm screen for one LNURL minted on the way in. Either
   * way, before the user could have paused on it.
   *
   * Read off the same clock as `nowSeconds`, so `nowSeconds - firstSeenSeconds`
   * is an elapsed *duration*, not a comparison against someone else's clock:
   * any constant offset cancels. Optional — omitted, only the absolute
   * backstop is available.
   */
  firstSeenSeconds?: number | null
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

/**
 * Whether a held invoice is dead enough to refuse the send.
 *
 * Two signals, in order of trustworthiness:
 *
 *  1. Elapsed since first sight (primary, offset-immune). The send flow
 *     cannot have laid eyes on the invoice before it was minted, so the time
 *     it has spent in front of *this* user never overstates the invoice's real
 *     age. Once that exceeds the invoice's whole stated lifetime, the invoice
 *     is dead whatever the handset thinks the wall-clock time is. This is what
 *     catches the ordinary pause on a 60-second invoice, which the absolute
 *     comparison below cannot see until the invoice is 180s old. It refuses
 *     only with the raw expiry corroborating, so a clock that JUMPS between
 *     the two readings cannot manufacture elapsed time — see the branch below.
 *  2. Absolute expiry + grace (backstop) — reached ONLY when the invoice
 *     states no usable issue time, or when no first-sight reading exists. An
 *     invoice already dead at its first sighting is deliberately NOT caught:
 *     that reading is indistinguishable from a fast handset clock, so the
 *     elapsed term wins and the backend does the rejecting. See the tradeoff
 *     note at the elapsed branch below. What keeps this from mattering in
 *     practice is registering first sight at the moment the bolt11 is proved
 *     alive (payment-destination/lightning.ts) rather than at confirm-mount,
 *     so the elapsed reading spans the whole time the invoice was under the
 *     user.
 *
 * Fails open on every unknown, and on a device clock that is provably wrong:
 *
 *  - Unknown/unparseable expiry — a decode quirk must not become a blocked
 *    payment. The backend still rejects a genuinely expired invoice, so a
 *    false negative only restores the status quo, while a false positive
 *    costs a payment that would have worked.
 *  - `nowSeconds` before the invoice's own issue time — the device clock is
 *    behind the issuer's, so nothing derived from it can be trusted.
 *  - A first sighting that already read as long dead — see below.
 *  - An elapsed reading the raw expiry contradicts — the clock moved between
 *    the two samples, so the duration between them is not elapsed time.
 *  - Inside CLOCK_SKEW_GRACE_SECONDS past the expiry — plausible drift rather
 *    than a genuinely dead invoice.
 */
export const isInvoiceExpired = ({
  timeExpireDate,
  timestamp,
  nowSeconds,
  firstSeenSeconds,
}: InvoiceExpiryArgs): boolean => {
  if (!isFiniteNumber(timeExpireDate)) return false
  if (!isFiniteNumber(nowSeconds)) return false

  // Skew detector: an invoice cannot have been issued in the future, so a
  // "now" that precedes its issue time proves the device clock is behind.
  if (isFiniteNumber(timestamp) && nowSeconds < timestamp) return false

  if (
    isFiniteNumber(timestamp) &&
    isFiniteNumber(firstSeenSeconds) &&
    timeExpireDate > timestamp
  ) {
    // The invoice's own lifetime, straight off the bolt11 — 60 seconds for a
    // Flash receive invoice, per IBEX's cap.
    const lifetimeSeconds = timeExpireDate - timestamp

    // Primary signal. Both readings come from the device clock, so this is a
    // true elapsed duration: a handset ten minutes fast reads zero on a fresh
    // invoice, exactly like a correct one. It fires only once the invoice's
    // whole lifetime has passed under the user.
    //
    // Elapsed time is immune to a clock with a constant OFFSET — but not to a
    // clock that MOVES between the two readings. `Date.now()` is sampled once
    // at first sight and again at the tap, so an OS time resync in between
    // lands entirely in this term. A handset five minutes slow when it scans a
    // live 60-second invoice, resynced while the user types an amount, reads
    // 320s elapsed on an invoice with 40 seconds of life left — and refusing
    // there is a blocked good payment, the one failure this guard must not
    // introduce.
    //
    // So the absolute reading has to corroborate before we refuse. On any
    // STABLE clock this second term is implied and changes nothing: the flow
    // cannot have seen the invoice before it was minted, so with a constant
    // offset d we have firstSeen >= timestamp + d, hence
    // now > firstSeen + lifetime >= timeExpireDate + d — which for a fast or
    // correct clock is already past timeExpireDate. (Verified against every
    // elapsed-branch case in __tests__/utils/invoice-expiry.spec.ts and
    // __tests__/screens/send-confirmation.spec.tsx.) It only bites when the
    // clock jumped, and on a slow clock the `nowSeconds < timestamp` detector
    // above has usually already muted the guard anyway.
    //
    // Note it is a corroboration, not a second opinion: the absolute term can
    // only ever HOLD THE GUARD BACK here, never fire it on its own. It cannot
    // tell a stale invoice from a fast clock, so letting it refuse a send by
    // itself would block good payments on skewed handsets.
    return nowSeconds - firstSeenSeconds > lifetimeSeconds && nowSeconds > timeExpireDate
  }

  // Fallback for invoices with no usable issue time, where no elapsed
  // duration can be computed. Skew moves this one, hence the grace window.
  return nowSeconds > timeExpireDate + CLOCK_SKEW_GRACE_SECONDS
}

/** The networks @galoymoney/client's decoder accepts. */
export type InvoiceNetwork = "mainnet" | "signet" | "regtest"

/**
 * The network a bolt11 belongs to, read from its human-readable prefix.
 *
 * Derived rather than hardcoded so the expiry check works on every build.
 * The send flow hardcodes "mainnet" elsewhere, which would make this guard
 * silently useless on a signet or regtest build: the decoder throws on a
 * prefix mismatch, the catch swallows it, and nothing is ever checked.
 *
 * Order matters — "lnbcrt" also starts with "lnbc", so the longer prefix has
 * to be tested first.
 */
export const networkForPaymentRequest = (
  paymentRequest: string,
): InvoiceNetwork | undefined => {
  const pr = paymentRequest.trim().toLowerCase()
  if (pr.startsWith("lnbcrt")) return "regtest"
  if (pr.startsWith("lntbs")) return "signet"
  if (pr.startsWith("lnbc")) return "mainnet"
  return undefined
}

export type HeldInvoiceExpiredArgs = {
  /** The bolt11 the confirm screen is holding, if it has one. */
  paymentRequest?: string
  /** Current time in epoch SECONDS. */
  nowSeconds: number
  /** Injected so this decision stays testable without the screen. */
  decode: (
    paymentRequest: string,
    network: InvoiceNetwork,
  ) => { timeExpireDate?: number | null; timestamp?: number | null }
}

/**
 * Whether the send should be refused because the held invoice is dead.
 *
 * Fails open on every unknown: no invoice, an unrecognised prefix, or a
 * decode failure all resolve to false. The backend still rejects a genuinely
 * expired invoice, so a false negative only restores today's behaviour —
 * whereas a false positive blocks a payment that would have worked.
 */
export const isHeldInvoiceExpired = ({
  paymentRequest,
  nowSeconds,
  decode,
}: HeldInvoiceExpiredArgs): boolean => {
  if (!paymentRequest) return false

  const network = networkForPaymentRequest(paymentRequest)
  if (!network) return false

  // Resolved here rather than passed in: the reading has to be per-invoice to
  // survive a remount, and every caller would otherwise have to know that.
  const seenAt = noteInvoiceFirstSight(paymentRequest, nowSeconds)

  try {
    const { timeExpireDate, timestamp } = decode(paymentRequest, network)
    return isInvoiceExpired({
      timeExpireDate,
      timestamp,
      nowSeconds,
      firstSeenSeconds: seenAt,
    })
  } catch {
    return false
  }
}

export type HeldInvoiceTransmissionArgs = {
  /** `sendingWalletDescriptor.currency` of the detail being confirmed. */
  sendingWalletCurrency?: WalletCurrency
  /** `paymentType` of the detail being confirmed. */
  paymentType?: PaymentType
}

/**
 * Whether the bolt11 the confirm screen is holding is the one that will
 * actually be transmitted — and therefore whether its expiry says anything
 * about the send that is about to happen.
 *
 * It usually is, but not on the Breez/Spark BTC wallet's LNURL and
 * intraledger paths: `useSendPayment` routes those to `payLnurlBreez`, which
 * re-resolves the lightning address and mints a *brand-new* invoice at send
 * time (app/utils/breez-sdk/spark.ts). The held bolt11 is dead weight there,
 * so checking its expiry would refuse a payment Breez would have completed —
 * exactly the false positive the guard exists to avoid.
 *
 * BTC + `lightning` is the opposite case: `payLightningBreez` is handed the
 * detail's `destination`, which *is* the held bolt11, so the check applies.
 * Every non-BTC wallet sends through GraphQL with `paymentRequest` in the
 * mutation input, so the check applies there too.
 */
export const willTransmitHeldInvoice = ({
  sendingWalletCurrency,
  paymentType,
}: HeldInvoiceTransmissionArgs): boolean =>
  sendingWalletCurrency !== "BTC" || paymentType === "lightning"
