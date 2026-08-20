// Invoice-expiry rules for the send flow.
//
// Free of react-native / SDK imports so the rules stay unit-testable under
// plain jest (mirrors max-send-amount.ts). Decoding is the caller's job —
// this module only reasons about the decoded expiry timestamp.

/**
 * Flash IBEX receive invoices are short-lived, and the window is not a
 * client-side convention — IBEX enforces it:
 *
 *   // flash src/domain/bitcoin/lightning/invoice-expiration.ts
 *   // IBEX caps BOLT11 receive-invoice expiry by the account's currency type:
 *   //   - msat currency accounts: up to 900s
 *   //   - all other currency accounts (USD/USDT/JMD): up to 60s
 *   export const IBEX_RECEIVE_MAX_EXPIRATION_SECONDS = SECS_PER_MIN
 *
 * Verified against a real failing invoice (ENG-555): issued 16:39:42Z,
 * expiring 16:40:42Z — exactly 60 seconds.
 *
 * A minute is short enough that an ordinary confirm-screen pause outlives
 * it, so the send flow must treat a held invoice as perishable rather than
 * as a stable property of the payment.
 */
export type InvoiceExpiryArgs = {
  /** Decoded bolt11 `timeExpireDate`, in epoch SECONDS. */
  timeExpireDate?: number | null
  /** Current time in epoch SECONDS. */
  nowSeconds: number
}

/**
 * Whether a held invoice is past its expiry.
 *
 * Returns false when the expiry is unknown or unparseable. Refusing to send
 * on a value we could not read would turn a decode quirk into a blocked
 * payment; the backend still rejects a genuinely expired invoice, so the
 * cost of a false negative is the status quo, while a false positive would
 * block a perfectly good send.
 */
export const isInvoiceExpired = ({
  timeExpireDate,
  nowSeconds,
}: InvoiceExpiryArgs): boolean => {
  if (typeof timeExpireDate !== "number" || !Number.isFinite(timeExpireDate)) {
    return false
  }
  if (!Number.isFinite(nowSeconds)) return false

  return nowSeconds >= timeExpireDate
}
