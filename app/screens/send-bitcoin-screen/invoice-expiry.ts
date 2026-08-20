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
 * How far past the stated expiry we still let a send through, in seconds.
 *
 * `nowSeconds` comes from the device wall clock, which is not authoritative:
 * the issuer's clock is. Without a tolerance the guard fails CLOSED on skew —
 * a handset running two minutes fast would mark every freshly minted 60-second
 * Flash invoice expired the instant it was created, and the user could never
 * send at all, where before this guard existed the backend (validating against
 * server time) would have accepted the payment.
 *
 * 120s is chosen to swallow ordinary handset drift while still catching the
 * ENG-555 case with a wide margin — that retry landed ~18 minutes late.
 */
export const CLOCK_SKEW_GRACE_SECONDS = 120

export type InvoiceExpiryArgs = {
  /** Decoded bolt11 `timeExpireDate`, in epoch SECONDS. */
  timeExpireDate?: number | null
  /** Decoded bolt11 `timestamp` (issue time), in epoch SECONDS. */
  timestamp?: number | null
  /** Current time in epoch SECONDS, per the device clock. */
  nowSeconds: number
}

/**
 * Whether a held invoice is far enough past its expiry to refuse the send.
 *
 * Fails open on every unknown, and on a device clock that is provably wrong:
 *
 *  - Unknown/unparseable expiry — a decode quirk must not become a blocked
 *    payment. The backend still rejects a genuinely expired invoice, so a
 *    false negative only restores the status quo, while a false positive
 *    costs a payment that would have worked.
 *  - `nowSeconds` before the invoice's own issue time — the device clock is
 *    behind the issuer's, so nothing derived from it can be trusted.
 *  - Inside CLOCK_SKEW_GRACE_SECONDS past the expiry — plausible drift rather
 *    than a genuinely dead invoice.
 */
export const isInvoiceExpired = ({
  timeExpireDate,
  timestamp,
  nowSeconds,
}: InvoiceExpiryArgs): boolean => {
  if (typeof timeExpireDate !== "number" || !Number.isFinite(timeExpireDate)) {
    return false
  }
  if (!Number.isFinite(nowSeconds)) return false

  // Skew detector: an invoice cannot have been issued in the future, so a
  // "now" that precedes its issue time proves the device clock is behind.
  if (
    typeof timestamp === "number" &&
    Number.isFinite(timestamp) &&
    nowSeconds < timestamp
  ) {
    return false
  }

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

  try {
    const { timeExpireDate, timestamp } = decode(paymentRequest, network)
    return isInvoiceExpired({ timeExpireDate, timestamp, nowSeconds })
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
