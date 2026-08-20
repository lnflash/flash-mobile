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
  /** Convert sats into the sending wallet's minor units. */
  convertSatsToWallet: (sats: number) => number
  rounding: LnurlBoundRounding
}

/**
 * An LNURL (LUD-06) bound — advertised in sats — as a WHOLE unit of the
 * sending wallet's minor currency.
 *
 * Amounts are entered and sent in whole minor units, so a fractional bound is
 * a bound the user can never type. Left fractional, a 100-sat floor at
 * $64,000/BTC becomes 6.4 cents: the validator refuses 6c, the message rounds
 * the bound to "$0.06", the user types 6c, and the refusal repeats — a dead
 * end. Quantizing here means the bound the validator enforces and the bound
 * the message names are the same number, and that number is typeable.
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
 * Receiver's LNURL maxSendable bound in the sending wallet's minor units,
 * or null when no cap applies.
 *
 * The BTC wallet pays Flash addresses and LNURL destinations through
 * LNURL-pay, so its cap comes from the resolved pay request (already in
 * sats — the wallet's minor unit). The USD wallet only has a cap for
 * explicit LNURL destinations, advertised in sats and converted here.
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
  | "fee-unavailable"
  | "recipient-cap"

export type MaxSendResult = {
  /** Max sendable amount, in the sending wallet's minor units. */
  amount: number
  reason: MaxSendReason
  /** Set when reason is "fee-reserved" — the estimated fee held back. */
  feeReserved?: number
}

/** Which info-row note (if any) a max result warrants. */
export type MaxSendNote =
  | { kind: "none" }
  | { kind: "intraledger" }
  | { kind: "fee-reserved"; feeReserved: number }
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
   * computation then falls back to the full balance so the existing
   * pre-validation surfaces the typed fee error instead of blocking the tap.
   */
  fetchFee: (probeAmount: number) => Promise<number | null>
  /** Receiver's LNURL maxSendable converted to wallet minor units, if known. */
  recipientCap?: number | null
  /** Fee estimates slower than this fall back to the full balance. */
  timeoutMs?: number
}

const FEE_ESTIMATE_TIMEOUT_MS = 10_000

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
    // A failed estimate must never block the tap — fall back to full balance.
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
    result =
      fee === null
        ? { amount: spendableBalance, reason: "fee-unavailable" }
        : {
            amount: Math.max(Math.floor(spendableBalance - fee), 0),
            reason: "fee-reserved",
            feeReserved: fee,
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
