// Typed fee-estimation errors for the Breez Spark BTC wallet.
//
// This module is intentionally free of react-native / SDK imports so the
// validation and classification logic is unit-testable under plain jest.

export type LnurlLimits = {
  minSats: number
  maxSats: number
}

export type BreezFeeError =
  | { kind: "amount-below-min"; minSats: number }
  | { kind: "amount-above-max"; maxSats: number }
  | { kind: "insufficient-funds"; message: string }
  | { kind: "network"; message: string }
  | { kind: "unsupported"; message: string }
  | { kind: "sdk"; message: string }

/**
 * Convert LNURL-pay msat bounds (LUD-06 `minSendable`/`maxSendable`) into
 * inclusive sat limits. Returns null when the bounds are absent or unusable so
 * callers skip validation rather than reject valid amounts.
 */
export const lnurlLimitsFromPayRequest = (payRequest?: {
  minSendable?: bigint | number
  maxSendable?: bigint | number
}): LnurlLimits | null => {
  if (
    payRequest === undefined ||
    payRequest.minSendable === undefined ||
    payRequest.maxSendable === undefined
  ) {
    return null
  }

  const minMsat = Number(payRequest.minSendable)
  const maxMsat = Number(payRequest.maxSendable)
  if (!Number.isFinite(minMsat) || !Number.isFinite(maxMsat) || maxMsat <= 0) {
    return null
  }

  // Smallest whole-sat amount ≥ minSendable, largest whole-sat amount ≤ maxSendable
  return {
    minSats: Math.ceil(minMsat / 1000),
    maxSats: Math.floor(maxMsat / 1000),
  }
}

export const validateAmountWithinLimits = (
  amountSats: number,
  limits: LnurlLimits | null,
): BreezFeeError | null => {
  if (!limits) return null
  if (amountSats < limits.minSats) {
    return { kind: "amount-below-min", minSats: limits.minSats }
  }
  if (amountSats > limits.maxSats) {
    return { kind: "amount-above-max", maxSats: limits.maxSats }
  }
  return null
}

/**
 * Map an error thrown by the Breez Spark SDK to a typed reason. SDK errors are
 * uniffi tagged errors carrying a `tag` field; the message regexes are a
 * fallback for plain Errors (timeouts, fetch failures, older SDK builds).
 */
export const classifyBreezSdkError = (err: unknown): BreezFeeError => {
  const message = err instanceof Error ? err.message : String(err)
  const tag =
    typeof err === "object" && err !== null ? (err as { tag?: string }).tag : undefined

  if (
    tag === "InsufficientFunds" ||
    /insufficient funds|not enough funds/i.test(message)
  ) {
    return { kind: "insufficient-funds", message }
  }
  if (tag === "NetworkError" || /network|timed? ?out|connection/i.test(message)) {
    return { kind: "network", message }
  }
  return { kind: "sdk", message }
}
