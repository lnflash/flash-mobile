// Prices an LNURL send so the MAX chip can propose a real number (ENG-554).
//
// An LNURL payment detail has no `getFee` until an invoice is attached
// (payment-details/lightning.ts sets canGetFee false until then), so the plain
// IBEX probe cannot price the destination at all — that gap is what made MAX
// offer an amount the send then refused. This mints a throwaway invoice at the
// probe amount purely to price it. The invoice is never paid: pressing Next
// mints a fresh one for the actual send, which matters because these expire in
// 60s.
//
// Dependency-injected and free of react-native / generated-GraphQL imports so
// the sat conversion, the invoice mint, the timeout and the failure mapping are
// unit-testable under plain jest (mirrors max-amount-button.ts).

import { requestInvoiceWithServiceParams, utils } from "lnurl-pay"
import type { LnUrlPayServiceResponse } from "lnurl-pay/dist/types/types"

/** Structural stand-in for MoneyAmount — keeps this module RN-free. */
type MoneyAmountShape = { amount: number }

/**
 * The MAX chip's own fee budget is 10s (max-send-amount.ts). Keep the LNURL
 * price check well under it so a slow receiver degrades to "couldn't estimate"
 * instead of holding the tap.
 *
 * This bounds the WHOLE price check — the invoice mint and the IBEX fee probe
 * that follows it — not just the mint. Timing only the mint left the second
 * leg unbounded, so a 6.9s mint plus a 5s route probe ran 11.9s and only the
 * chip's outer 10s race stopped it: the margin this constant exists to
 * guarantee did not apply to the slow destinations it was written for.
 */
export const LNURL_PROBE_TIMEOUT_MS = 7000

/**
 * The slice of PaymentDetail this probe needs, expressed structurally so the
 * module stays out of the react-native dependency tree.
 *
 * `P` is the receiver's already-resolved LNURL pay-service params. Passing them
 * to the invoice mint is what keeps this to ONE network round-trip: the
 * address-taking `requestInvoice` re-resolves the pay service before it can hit
 * the callback, so a receiver answering each leg in 4s would blow the budget on
 * a destination that is perfectly priceable.
 */
export type LnurlProbeDetail<
  M extends MoneyAmountShape,
  B extends MoneyAmountShape,
  F,
  P,
> = {
  paymentType: string
  unitOfAccountAmount: M
  /** Invoices are denominated in sats, so `B` is the BTC-side money amount. */
  convertMoneyAmount: (moneyAmount: M, toCurrency: "BTC") => B
  setAmount?: (unitOfAccountAmount: M) => LnurlProbeDetail<M, B, F, P>
  lnurlParams?: P
  setInvoice?: (params: { paymentRequest: string; paymentRequestAmount: B }) => {
    getFee?: F
  }
}

export type PriceLnurlSendArgs<
  M extends MoneyAmountShape,
  B extends MoneyAmountShape,
  F,
  P,
> = {
  /** The screen's current payment detail. Non-LNURL details price as null. */
  detail: LnurlProbeDetail<M, B, F, P>
  /** Amount to price, in the sending wallet's minor units. */
  probeAmount: number
  /** Sending wallet balance — the currency template for the probe amount. */
  balanceMoneyAmount: M
  /** Mints a throwaway invoice for `sats` against the resolved pay params. */
  requestInvoice: (args: { params: P; sats: number }) => Promise<{ invoice: string }>
  /** Runs a priced detail's getFee (the IBEX fee probe). */
  getIbexFee: (getFee: F | undefined) => Promise<MoneyAmountShape | undefined>
  timeoutMs?: number
}

/**
 * The real invoice mint: `PriceLnurlSendArgs["requestInvoice"]` bound to
 * lnurl-pay. Lives here rather than inline in the send screen so the two
 * choices it encodes are testable.
 *
 * The params-taking `requestInvoiceWithServiceParams`, not the address-taking
 * `requestInvoice`: the receiver's pay-service params are already resolved on
 * the payment detail, so this is ONE round-trip to their callback instead of
 * two, which is the difference between a slow-but-priceable destination and
 * one that reads as unpriceable inside the probe budget.
 *
 * `utils.toSats` is a bare cast — it brands a number as Satoshis without
 * checking anything — so the whole-sat contract is enforced here before the
 * cast rather than trusted after it. A fractional or millisat value reaching
 * the receiver mints an invoice for the wrong amount (or none at all); the
 * throw is caught by `priceLnurlSend` and reads as "couldn't price it".
 */
export const mintProbeInvoice = async ({
  params,
  sats,
}: {
  params: LnUrlPayServiceResponse
  sats: number
}): Promise<{ invoice: string }> => {
  if (!Number.isInteger(sats) || sats <= 0) {
    throw new Error(`lnurl fee probe: refusing to mint an invoice for ${sats} sats`)
  }
  return requestInvoiceWithServiceParams({ params, tokens: utils.toSats(sats) })
}

const TIMED_OUT = Symbol("lnurl-probe-timeout")

/**
 * The estimated fee for sending `probeAmount` to an LNURL destination, in the
 * sending wallet's minor units, or null when it cannot be priced.
 *
 * Null is a real answer, not a failure to report: the max computation declines
 * to propose an amount rather than guessing one the send would refuse.
 */
export const priceLnurlSend = async <
  M extends MoneyAmountShape,
  B extends MoneyAmountShape,
  F,
  P,
>({
  detail,
  probeAmount,
  balanceMoneyAmount,
  requestInvoice,
  getIbexFee,
  timeoutMs = LNURL_PROBE_TIMEOUT_MS,
}: PriceLnurlSendArgs<M, B, F, P>): Promise<number | null> => {
  if (detail.paymentType !== "lnurl" || !detail.setAmount || !detail.lnurlParams) {
    return null
  }

  const params = detail.lnurlParams
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const probeDetail = detail.setAmount({ ...balanceMoneyAmount, amount: probeAmount })
    if (probeDetail.paymentType !== "lnurl" || !probeDetail.setInvoice) {
      return null
    }

    // Invoices are denominated in sats regardless of the sending wallet, and
    // must be whole ones. The app's converter already rounds BTC targets; this
    // rounds again so the module cannot mint a fractional-sat request on its
    // own if that ever changes.
    const btcProbeAmount = probeDetail.convertMoneyAmount(
      probeDetail.unitOfAccountAmount,
      "BTC",
    )
    const sats = Math.round(btcProbeAmount.amount)
    if (!Number.isFinite(sats) || sats <= 0) {
      return null
    }

    // Both legs run inside ONE timer. The IBEX leg is a real route probe that
    // takes seconds of its own, so racing only the mint bounded half the wait
    // and let a slow destination hold the chip for its full 10s budget.
    const setInvoice = probeDetail.setInvoice
    const priced = await Promise.race([
      (async () => {
        const minted = await requestInvoice({ params, sats })
        const pricedDetail = setInvoice({
          paymentRequest: minted.invoice,
          paymentRequestAmount: { ...btcProbeAmount, amount: sats },
        })
        const fee = await getIbexFee(pricedDetail.getFee)
        return fee?.amount ?? null
      })(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
      }),
    ])
    return priced === TIMED_OUT ? null : priced
  } catch {
    // Unpriceable — the computation declines to propose an amount rather than
    // guessing one the send would refuse.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * An invoice mint — in flight, or answered and still young enough to reuse.
 *
 * `mintedAt` is stamped when the REQUEST goes out rather than when it answers:
 * the receiver's own expiry clock starts no later than that, so ageing from
 * here retires an invoice at or before the receiver does, never after.
 */
type MintEntry = { promise: Promise<{ invoice: string }>; mintedAt: number }

/**
 * How long a mint may be reused.
 *
 * These invoices expire 60s after the receiver issues them, and the mint key
 * is destination + SATS while the fee key is destination + wallet + probe
 * amount — 441¢ and 442¢ both round to 221 sats at 2¢/sat, so a brand-new fee
 * key can land on an existing mint. Without an age bound that mint could be
 * minutes old, and IBEX would refuse the expired invoice it prices. 45s leaves
 * the route probe room to finish against an invoice that is still alive.
 */
export const MINT_REUSE_TTL_MS = 45_000

/**
 * Per-screen memo for the LNURL price probe. Every probe that reaches the
 * receiver mints a REAL invoice, so repeated MAX taps orphan invoices at the
 * receiver and trip rate-limited services (BTCPay, LNbits) until the
 * destination stops answering at all.
 *
 * Two maps, because the two things worth remembering have different lifetimes:
 * a finished fee is good for the session, while a mint is worth sharing only
 * while it is the freshest invoice anyone has.
 */
export type LnurlProbeCache = {
  /** Completed fee estimates, keyed by destination + wallet + probe amount. */
  fees: Map<string, number>
  /** Invoice mints, keyed by destination + sats. */
  mints: Map<string, MintEntry>
}

export const makeLnurlProbeCache = (): LnurlProbeCache => ({
  fees: new Map(),
  mints: new Map(),
})

export type MakeLnurlFeeProbeArgs<
  M extends MoneyAmountShape,
  B extends MoneyAmountShape,
  F,
  P,
> = Omit<PriceLnurlSendArgs<M, B, F, P>, "probeAmount"> & {
  /** Cache-key discriminator — the screen's resolved destination string. */
  destination: string
  /** Cache-key discriminator — the sending wallet, whose minor unit the
   * probe amount is denominated in. */
  walletCurrency: string
  cache: LnurlProbeCache
}

/**
 * A memoized `probeLnurlFee` for `buildMaxAmountButton`.
 *
 * The glue that used to sit inline in the send screen, extracted so the
 * caching rules are testable — they are the part with teeth:
 *
 * - A completed fee is cached; a null is NOT. A transient failure must not
 *   brand a destination unpriceable for the life of the screen, because the
 *   note it produces invites the user to tap MAX again.
 * - The probe amount is part of the fee key. A fee priced for a full-balance
 *   probe reused for a smaller cap-clamped one would under-reserve.
 * - The in-flight MINT is shared, not just the finished fee. The 7s budget
 *   abandons the wait but cannot cancel the request, so the receiver mints and
 *   returns an invoice regardless. Without this, every destination slower than
 *   the budget — Tor-hosted, cold serverless, LNbits under load — costs a
 *   fresh invoice on every tap and never caches anything, which is the exact
 *   orphan/rate-limit failure the memo exists to prevent.
 * - A mint that REJECTED is forgotten immediately; a mint that ANSWERED is
 *   kept until it ages out (MINT_REUSE_TTL_MS), whatever became of the probe
 *   that asked for it. Dropping a live invoice because the probe failed reads
 *   the failure as the invoice's fault, and usually it is not: mint at 2s,
 *   route probe hangs, budget fires at 7s, and a 2s-old invoice good for
 *   another 53s is thrown away. The note tells the user to tap MAX again, so
 *   the next tap mints another at the receiver — the same orphan/rate-limit
 *   failure this memo exists to prevent, moved from the first leg to the
 *   second. Age, not the outcome of a probe, is what retires an invoice.
 */
export const makeLnurlFeeProbe =
  <M extends MoneyAmountShape, B extends MoneyAmountShape, F, P>({
    destination,
    walletCurrency,
    cache,
    requestInvoice,
    ...priceArgs
  }: MakeLnurlFeeProbeArgs<M, B, F, P>) =>
  async (probeAmount: number): Promise<number | null> => {
    const feeKey = `${destination}:${walletCurrency}:${probeAmount}`
    const cachedFee = cache.fees.get(feeKey)
    if (cachedFee !== undefined) {
      return cachedFee
    }

    const fee = await priceLnurlSend({
      ...priceArgs,
      probeAmount,
      requestInvoice: ({ params, sats }) => {
        const mintKey = `${destination}:${sats}`
        const outstanding = cache.mints.get(mintKey)
        if (outstanding && Date.now() - outstanding.mintedAt < MINT_REUSE_TTL_MS) {
          return outstanding.promise
        }
        const entry: MintEntry = {
          promise: requestInvoice({ params, sats }),
          mintedAt: Date.now(),
        }
        cache.mints.set(mintKey, entry)
        entry.promise.catch(() => {
          // A refused mint is worthless to everyone; forget it so the next tap
          // asks again rather than awaiting a dead promise forever. Only if it
          // is still the entry under this key — a later mint has since taken
          // over and must not be evicted by this one's failure.
          if (cache.mints.get(mintKey) === entry) {
            cache.mints.delete(mintKey)
          }
        })
        return entry.promise
      },
    })

    if (fee !== null) {
      cache.fees.set(feeKey, fee)
    }
    return fee
  }
