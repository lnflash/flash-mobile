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

/** Structural stand-in for MoneyAmount — keeps this module RN-free. */
type MoneyAmountShape = { amount: number }

/**
 * The MAX chip's own fee budget is 10s (max-send-amount.ts). Keep the LNURL
 * price check well under it so a slow receiver degrades to "couldn't estimate"
 * instead of holding the tap.
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

    const minted = await Promise.race([
      requestInvoice({ params, sats }),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
      }),
    ])
    if (minted === TIMED_OUT) {
      return null
    }

    const pricedDetail = probeDetail.setInvoice({
      paymentRequest: minted.invoice,
      paymentRequestAmount: { ...btcProbeAmount, amount: sats },
    })
    const fee = await getIbexFee(pricedDetail.getFee)
    return fee?.amount ?? null
  } catch {
    // Unpriceable — the computation declines to propose an amount rather than
    // guessing one the send would refuse.
    return null
  } finally {
    clearTimeout(timer)
  }
}
