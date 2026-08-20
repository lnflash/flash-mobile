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
  ) => { timeExpireDate?: number | null }
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
    const { timeExpireDate } = decode(paymentRequest, network)
    return isInvoiceExpired({ timeExpireDate, nowSeconds })
  } catch {
    return false
  }
}
