// Max-send computation backing the MAX chip on the amount input screen.
//
// This module is intentionally free of react-native / SDK imports so the
// max rules are unit-testable under plain jest (mirrors
// app/utils/breez-sdk/fee-errors.ts).

// Matches PaymentDetail["paymentType"] without importing the payment-details
// dependency tree.
export type MaxSendPaymentType = "intraledger" | "lightning" | "lnurl" | "onchain"

// Matches WalletCurrency without importing the generated GraphQL tree.
export type MaxSendWalletCurrency = "BTC" | "USD"

/**
 * Whether the MAX chip supports a payment type at all.
 *
 * Onchain is excluded: its fee estimate requires the user's selected fee
 * speed, which has not been chosen yet when the amount screen opens, and the
 * onchain flow already has its own send-all "Max" affordance
 * (DetailAmountNote / canSendMax). Supporting it here needs both problems
 * solved together — out of scope for the chip.
 */
export const maxChipSupportsPaymentType = (paymentType: MaxSendPaymentType): boolean =>
  paymentType !== "onchain"

/**
 * The payment type the max computation should use.
 *
 * BTC-wallet "intraledger" sends settle via LNURL-pay under the hood with a
 * real Breez fee — only the custodial USD wallet is truly fee-free between
 * Flash accounts. Route BTC-wallet intraledger through the LNURL fee path so
 * MAX reserves that fee instead of claiming there is none.
 */
export const effectiveMaxPaymentType = (
  walletCurrency: MaxSendWalletCurrency,
  paymentType: MaxSendPaymentType,
): MaxSendPaymentType => {
  if (walletCurrency === "BTC" && paymentType === "intraledger") {
    return "lnurl"
  }
  return paymentType
}

/**
 * Which way to quantize a converted bound.
 *
 * "ceil" for a MINIMUM and "floor" for a MAXIMUM — always inward, so the
 * quantized bound is one the receiver definitely accepts.
 */
export type LnurlBoundRounding = "floor" | "ceil"

export type LnurlBoundInWalletUnitsArgs = {
  /** The receiver's advertised LUD-06 bound, in sats. */
  sats: number
  /**
   * Convert sats into whole minor units of the target unit — the sending
   * wallet's currency for the MAX chip's cap, the number pad's own currency
   * when quoting a bound back to the user.
   */
  convertSatsToWallet: (sats: number) => number
  rounding: LnurlBoundRounding
}

/**
 * An LNURL (LUD-06) bound — advertised in sats — as a WHOLE minor unit of
 * whichever currency `convertSatsToWallet` targets.
 *
 * Amounts are entered in whole minor units, so a fractional bound is a bound
 * the user can never type. Left fractional, a 100-sat floor at $64,000/BTC
 * becomes 6.4 cents: quote "$0.06" and the user types an amount the receiver
 * refuses; quote "$0.064" and the number pad cannot produce it. Rounding
 * inward (ceil a minimum, floor a maximum) makes the quoted amount both
 * typeable and accepted.
 *
 * Note the asymmetry with enforcement: bounds are ENFORCED in sats, against
 * the sat amount the request is actually built with. This quantization is for
 * the amount a message quotes and for the MAX chip's cap — the two places
 * where the number has to survive a trip through the number pad.
 *
 * The `toPrecision` pass strips float noise before quantizing: 100 sats at
 * exactly $70,000/BTC converts to 7.000000000000001 cents, and a naive ceil
 * would name 8c as the floor of a bound that is really 7c. Twelve significant
 * digits is far finer than any real rate difference and far coarser than the
 * ~1e-16 relative noise of IEEE-754 arithmetic.
 */
export const lnurlBoundInWalletUnits = ({
  sats,
  convertSatsToWallet,
  rounding,
}: LnurlBoundInWalletUnitsArgs): number => {
  const converted = convertSatsToWallet(sats)
  if (!Number.isFinite(converted)) {
    return converted
  }
  const denoised = Number(converted.toPrecision(12))
  return rounding === "ceil" ? Math.ceil(denoised) : Math.floor(denoised)
}

export type ResolveRecipientCapArgs = {
  walletCurrency: MaxSendWalletCurrency
  paymentType: MaxSendPaymentType
  /** Receiver's resolved LNURL maxSendable in sats (BTC-wallet path). */
  receiverMaxSats?: number | null
  /** The destination's lnurlParams.max in sats (USD-wallet LNURL path). */
  lnurlParamsMaxSats?: number | null
  /** Convert sats into the sending wallet's minor units. */
  convertSatsToWallet: (sats: number) => number
}

/**
 * Receiver's LNURL maxSendable bound in WHOLE minor units of the sending
 * wallet (sats or cents), or null when no cap applies.
 *
 * The BTC wallet pays Flash addresses and LNURL destinations through
 * LNURL-pay, so its cap comes from the resolved pay request (already in
 * sats — the wallet's minor unit, and already whole). The USD wallet only has
 * a cap for explicit LNURL destinations, advertised in sats and converted
 * here; that conversion is fractional, so it is floored to a whole cent — the
 * MAX chip pre-fills the number pad with this value and the pad cannot hold a
 * fraction of a cent.
 */
export const resolveRecipientCap = ({
  walletCurrency,
  paymentType,
  receiverMaxSats,
  lnurlParamsMaxSats,
  convertSatsToWallet,
}: ResolveRecipientCapArgs): number | null => {
  if (walletCurrency === "BTC") {
    return receiverMaxSats ?? null
  }
  if (paymentType === "lnurl" && lnurlParamsMaxSats) {
    return lnurlBoundInWalletUnits({
      sats: lnurlParamsMaxSats,
      convertSatsToWallet,
      rounding: "floor",
    })
  }
  return null
}

export type MaxSendReason =
  | "zero-balance"
  | "intraledger-full-balance"
  | "fee-reserved"
  | "fee-exceeds-balance"
  | "fee-unavailable"
  | "recipient-cap"

export type MaxSendResult = {
  /** Max sendable amount, in the sending wallet's minor units. */
  amount: number
  reason: MaxSendReason
  /**
   * Set when reason is "fee-reserved" (the estimated fee held back) or
   * "fee-exceeds-balance" (the estimated fee that swallowed the balance).
   */
  feeReserved?: number
}

/** Which info-row note (if any) a max result warrants. */
export type MaxSendNote =
  | { kind: "none" }
  | { kind: "intraledger" }
  | { kind: "fee-reserved"; feeReserved: number }
  | { kind: "fee-too-large" }
  | { kind: "fee-unknown" }
  | { kind: "recipient-cap"; cap: number }

/**
 * Note selection for a max result. Kept pure so the wording decision is
 * unit-testable; the caller maps kinds onto localized strings.
 *
 * A fee-reserved result with a zero fee (legitimately reachable — e.g.
 * Spark-address payments report fee 0) gets no note: "~$0.00 reserved for
 * the network fee" is nonsense to a user.
 */
export const noteForResult = (result: MaxSendResult): MaxSendNote => {
  switch (result.reason) {
    case "intraledger-full-balance":
      return { kind: "intraledger" }
    case "fee-reserved":
      return result.feeReserved
        ? { kind: "fee-reserved", feeReserved: result.feeReserved }
        : { kind: "none" }
    // No amount was proposed, so the user is owed the reason — otherwise the
    // tap looks broken.
    case "fee-exceeds-balance":
      return { kind: "fee-too-large" }
    case "fee-unavailable":
      return { kind: "fee-unknown" }
    case "recipient-cap":
      return { kind: "recipient-cap", cap: result.amount }
    default:
      return { kind: "none" }
  }
}

export type ComputeMaxSendAmountArgs = {
  paymentType: MaxSendPaymentType
  /** Wallet balance in the wallet's minor units (sats or cents). */
  balance: number
  /**
   * Resolve the estimated fee for sending `probeAmount` (the balance clamped
   * to the recipient cap, in wallet minor units). Probing at the capped
   * amount matters: LNURL fee probes bounds-validate against the receiver's
   * LUD-06 limits, so a full-balance probe is guaranteed to fail whenever
   * the cap binds. Resolve null when no estimate is available — the
   * computation then proposes nothing at all, because an unpriced send is
   * one it cannot promise will be accepted.
   */
  fetchFee: (probeAmount: number) => Promise<number | null>
  /** Receiver's LNURL maxSendable converted to wallet minor units, if known. */
  recipientCap?: number | null
  /**
   * Fee estimates slower than this are treated as unavailable — no amount is
   * proposed.
   */
  timeoutMs?: number
}

/**
 * The whole chip's fee budget. Exported so anything that must stay under it
 * (the LNURL price probe's own timeout) can assert against this number rather
 * than a copy of it — a copy silently stops guarding the moment this changes.
 */
export const FEE_ESTIMATE_TIMEOUT_MS = 10_000

const feeOrNull = async (
  fetchFee: (probeAmount: number) => Promise<number | null>,
  probeAmount: number,
  timeoutMs: number,
): Promise<number | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const fee = await Promise.race([
      fetchFee(probeAmount),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
    return typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? fee : null
  } catch {
    // A failed estimate yields no proposal; the caller explains why.
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const computeMaxSendAmount = async ({
  paymentType,
  balance,
  fetchFee,
  recipientCap,
  timeoutMs = FEE_ESTIMATE_TIMEOUT_MS,
}: ComputeMaxSendAmountArgs): Promise<MaxSendResult> => {
  // NaN (wallet balance still loading) must land here too — NaN fails every
  // comparison, so without the isFinite check it would sail through the
  // zero-balance guard and fill the number pad with the literal "NaN".
  if (!Number.isFinite(balance) || balance <= 0) {
    return { amount: 0, reason: "zero-balance" }
  }

  // Balances arrive in the wallet's minor units but can be FRACTIONAL: the
  // API reports USD cash balances in fractional cents (e.g. 109.9346 for
  // $1.099346 held at IBEX). Payments send whole minor units and the
  // rounding between here and the mutation is half-up, so offering a
  // fractional max overdraws by up to half a cent and the send dies at
  // IBEX with "insufficient balance" (found on-device: balance 1.099346,
  // MAX produced a 1.100000 invoice). Floor everything we might offer;
  // sats are already integers so this is a no-op for the BTC wallet.
  const spendableBalance = Math.floor(balance)
  if (spendableBalance <= 0) {
    return { amount: 0, reason: "zero-balance" }
  }

  const flooredCap =
    recipientCap !== null && recipientCap !== undefined && recipientCap >= 0
      ? Math.floor(recipientCap)
      : null
  const hasRecipientCap = flooredCap !== null

  let result: MaxSendResult
  if (paymentType === "intraledger") {
    // Flash-to-Flash from the custodial USD wallet — no fee, no API call.
    // Callers must pass effectiveMaxPaymentType so BTC-wallet intraledger
    // sends (which settle via LNURL-pay with a real fee) never hit this arm.
    result = { amount: spendableBalance, reason: "intraledger-full-balance" }
  } else {
    // Probe at the cap-clamped amount, not the raw balance: LNURL fee probes
    // bounds-validate against the receiver's LUD-06 maxSendable, so a
    // full-balance probe fails whenever the cap binds — leaving the clamped
    // amount with zero fee headroom and a confirm-time dead-end in the band
    // where balance − cap < fee. Probing slightly above the final amount is
    // safe: fees are monotone, so the estimate is conservative.
    const probeAmount =
      flooredCap === null ? spendableBalance : Math.min(spendableBalance, flooredCap)
    const fee = await feeOrNull(fetchFee, probeAmount, timeoutMs)
    if (fee === null) {
      // No estimate, so no honest maximum. Offering the full balance is what
      // caused ENG-554 — the fee lands on top and the send is refused — but
      // guessing a reserve is no better: nothing in this app knows what IBEX
      // charges. There is no published bound in the flash config or the IBEX
      // client, and the galoy fee cap (FEECAP_BASIS_POINTS) governs a code
      // path this send never takes: lnNoAmountUsdInvoicePaymentSend calls
      // Ibex.payInvoice directly, with the Payments layer commented out.
      // Decline to propose a number rather than invent one; the caller
      // explains why instead of filling the pad with something doomed.
      result = { amount: 0, reason: "fee-unavailable" }
    } else {
      // Reserve the fee ROUNDED UP plus one whole minor unit of slack.
      //
      // The estimate is not a cap. It was priced against a different invoice
      // than the one the send will pay: this probe mints a throwaway invoice
      // at the probe amount, and pressing Next mints a fresh one at
      // balance − fee and re-prices THAT (send-bitcoin-details-screen.tsx,
      // goToNextScreen). Amount-monotonicity says a smaller amount does not
      // cost more on the same route; it says nothing about invoice-to-invoice
      // route variance. Without slack the failure band is narrow but real —
      // balance 442¢, probe fee 0.5¢ → MAX fills 441¢, the final invoice
      // prices at 1.5¢, and fetchSendingFee blocks with "amount exceeds
      // balance (amount + fee)". MAX filling an amount the very next screen
      // refuses is exactly the bug this code exists to kill, so it gives up
      // one minor unit to stay on the safe side of it.
      const maxAmount = spendableBalance - Math.ceil(fee) - 1
      result =
        maxAmount > 0
          ? { amount: maxAmount, reason: "fee-reserved", feeReserved: fee }
          : // The fee (plus its slack) swallows the whole balance. That is a
            // different outcome from "some of the balance was reserved":
            // there is nothing to fill, so the user is owed the reason.
            // Clamping to zero under the fee-reserved banner made the tap a
            // silent no-op — 2_000 sats against a 2_500-sat channel-open fee
            // spun the chip and then said nothing at all.
            { amount: 0, reason: "fee-exceeds-balance", feeReserved: fee }
    }
  }

  // LNURL receivers advertise a maxSendable bound (LUD-06) — never offer more
  // than the recipient can accept. Applies to BTC-wallet intraledger sends
  // too, which settle via LNURL-pay under the hood.
  if (hasRecipientCap && flooredCap !== null && result.amount > flooredCap) {
    return { amount: flooredCap, reason: "recipient-cap" }
  }

  return result
}
