import { decodeInvoiceString, getHashFromInvoice, Network } from "@galoymoney/client"

import { networkForPaymentRequest } from "@app/screens/send-bitcoin-screen/invoice-expiry"

// When a prepared action's numbers go stale (docs/ai-assistant-tool-
// registry.md §5, "Expiry"): the earliest of its inputs' lifetimes.

/** A Lightning fee probe holds this long. */
export const FEE_PROBE_TTL_MS = 60_000

/** An amount that depends on the exchange rate holds this long from the price read. */
export const RATE_TTL_MS = 60_000

/** A fixed-cent intraledger send moves nothing in the meantime: the cap is for hygiene. */
export const FIXED_CENT_INTRALEDGER_TTL_MS = 10 * 60_000

/** No prepared action outlives the longest TTL above, whatever its inputs. */
export const MAX_ACTION_TTL_MS = FIXED_CENT_INTRALEDGER_TTL_MS

/** The earliest expiry among the inputs that have one (epoch ms). */
export const minExpiry = (candidates: readonly (number | null | undefined)[]): number => {
  const known = candidates.filter(
    (candidate): candidate is number =>
      typeof candidate === "number" && Number.isFinite(candidate),
  )
  if (known.length === 0) throw new Error("A prepared action needs at least one expiry")
  return Math.min(...known)
}

/** What the action tools read off a bolt11. */
export type DecodedBolt11 = {
  /** Its own expiry, epoch ms; null when it cannot be read. */
  expiresAt: number | null
  paymentHash: string | null
  /** The amount it asks for, in sats; null for a no-amount invoice. */
  sats: number | null
}

/** Decode a bolt11 on the network its prefix names; null when it does not decode. */
export const decodeBolt11 = (paymentRequest: string): DecodedBolt11 | null => {
  const network = networkForPaymentRequest(paymentRequest)
  if (!network) return null
  try {
    const decoded = decodeInvoiceString(paymentRequest, network as Network)
    const millisatoshis =
      decoded.millisatoshis === undefined || decoded.millisatoshis === null
        ? null
        : Number(decoded.millisatoshis)
    return {
      expiresAt:
        typeof decoded.timeExpireDate === "number" ? decoded.timeExpireDate * 1000 : null,
      paymentHash: getHashFromInvoice(paymentRequest, network as Network) ?? null,
      sats: millisatoshis === null ? null : Math.round(millisatoshis / 1000),
    }
  } catch {
    return null
  }
}

/**
 * An API Timestamp as epoch ms. The scalar is documented as Unix seconds,
 * but CashoutOffer.expiresAt resolves to `Date.getTime()` and the scalar
 * passes a number through (lnflash/flash cashout-offer.ts and timestamp.ts),
 * so an offer's expiry arrives in ms, as CashoutConfirmation's
 * `moment(expiresAt)` already reads it. Read by size, so a fix on either side
 * reads the same: below 10^11 is seconds (any date before the year 5138).
 */
export const timestampToMs = (value: number): number =>
  value < 100_000_000_000 ? value * 1000 : value
