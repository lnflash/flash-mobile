// Max-send computation backing the MAX chip on the amount input screen.
//
// This module is intentionally free of react-native / SDK imports so the
// max rules are unit-testable under plain jest (mirrors
// app/utils/breez-sdk/fee-errors.ts).

// Matches PaymentDetail["paymentType"] without importing the payment-details
// dependency tree.
export type MaxSendPaymentType = "intraledger" | "lightning" | "lnurl" | "onchain"

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

export type ComputeMaxSendAmountArgs = {
  paymentType: MaxSendPaymentType
  /** Wallet balance in the wallet's minor units (sats or cents). */
  balance: number
  /**
   * Resolve the estimated fee for sending (approximately) the full balance,
   * in wallet minor units. Resolve null when no estimate is available — the
   * computation then falls back to the full balance so the existing
   * pre-validation surfaces the typed fee error instead of blocking the tap.
   */
  fetchFee: () => Promise<number | null>
  /** Receiver's LNURL maxSendable converted to wallet minor units, if known. */
  recipientCap?: number | null
  /** Fee estimates slower than this fall back to the full balance. */
  timeoutMs?: number
}

const FEE_ESTIMATE_TIMEOUT_MS = 10_000

const feeOrNull = async (
  fetchFee: () => Promise<number | null>,
  timeoutMs: number,
): Promise<number | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const fee = await Promise.race([
      fetchFee(),
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
  if (balance <= 0) {
    return { amount: 0, reason: "zero-balance" }
  }

  let result: MaxSendResult
  if (paymentType === "intraledger") {
    // Flash-to-Flash — no fee between Flash accounts, no API call.
    result = { amount: balance, reason: "intraledger-full-balance" }
  } else {
    const fee = await feeOrNull(fetchFee, timeoutMs)
    result =
      fee === null
        ? { amount: balance, reason: "fee-unavailable" }
        : { amount: Math.max(balance - fee, 0), reason: "fee-reserved", feeReserved: fee }
  }

  // LNURL receivers advertise a maxSendable bound (LUD-06) — never offer more
  // than the recipient can accept. Applies to BTC-wallet intraledger sends
  // too, which settle via LNURL-pay under the hood.
  if (
    recipientCap !== null &&
    recipientCap !== undefined &&
    recipientCap >= 0 &&
    result.amount > recipientCap
  ) {
    return { amount: recipientCap, reason: "recipient-cap" }
  }

  return result
}
