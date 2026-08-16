// Fee extraction from a Breez Spark prepare-send response.
//
// Like fee-errors.ts, this module is intentionally free of react-native / SDK
// runtime imports so the logic is unit-testable under plain jest. The tag
// strings mirror SendPaymentMethod_Tags in @breeztech/breez-sdk-spark-react-native,
// whose enum members are the same string literals.

export type OnchainFeeSpeed = "fast" | "medium" | "slow"

type SpeedFee = {
  userFeeSat: bigint
  l1BroadcastFeeSat: bigint
}

// Structural view of the SDK's SendPaymentMethod union — only the fields fee
// extraction reads. Optional everywhere so any variant assigns to it.
export type SendPaymentMethodLike = {
  tag: string
  inner?: {
    lightningFeeSats?: bigint
    fee?: bigint
    feeQuote?: {
      speedFast: SpeedFee
      speedMedium: SpeedFee
      speedSlow: SpeedFee
    }
  }
}

export const extractFeeFromPaymentMethod = (
  paymentMethod: SendPaymentMethodLike | undefined,
  selectedFeeType?: OnchainFeeSpeed,
): bigint => {
  if (paymentMethod?.tag === "Bolt11Invoice") {
    return paymentMethod.inner?.lightningFeeSats ?? BigInt(0)
  }
  if (paymentMethod?.tag === "BitcoinAddress") {
    const feeQuote = paymentMethod.inner?.feeQuote
    if (!feeQuote) {
      // No quote means no knowable fee. Throwing (classified upstream as an
      // "sdk" fee error) beats the old fall-through to 0, which displayed a
      // free send and skipped the amount+fee balance check.
      throw new Error("Fee quote missing from onchain prepare response")
    }
    // The send screens require a speed before continuing, so the default only
    // covers direct callers — an undefined speed must never read as fee 0.
    const speed = selectedFeeType ?? "medium"
    if (speed === "fast") {
      return feeQuote.speedFast.userFeeSat + feeQuote.speedFast.l1BroadcastFeeSat
    }
    if (speed === "slow") {
      return feeQuote.speedSlow.userFeeSat + feeQuote.speedSlow.l1BroadcastFeeSat
    }
    return feeQuote.speedMedium.userFeeSat + feeQuote.speedMedium.l1BroadcastFeeSat
  }
  if (paymentMethod?.tag === "SparkAddress" || paymentMethod?.tag === "SparkInvoice") {
    return paymentMethod.inner?.fee ?? BigInt(0)
  }
  return BigInt(0)
}
