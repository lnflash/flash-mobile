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
// extraction reads. `inner` is opaque at the type level because 0.22.x added
// variants (CrossChainAddress) whose inner shares NO properties with the fee
// fields, which breaks structural assignability of the union as a whole; each
// tag branch below narrows to exactly the fields that variant carries.
export type SendPaymentMethodLike = {
  tag: string
  inner?: object
}

type FeeFields = {
  lightningFeeSats?: bigint
  fee?: bigint
  feeQuote?: {
    speedFast: SpeedFee
    speedMedium: SpeedFee
    speedSlow: SpeedFee
  }
}

export const extractFeeFromPaymentMethod = (
  paymentMethod: SendPaymentMethodLike | undefined,
  selectedFeeType?: OnchainFeeSpeed,
): bigint => {
  const inner = paymentMethod?.inner as FeeFields | undefined
  if (paymentMethod?.tag === "Bolt11Invoice") {
    return inner?.lightningFeeSats ?? BigInt(0)
  }
  if (paymentMethod?.tag === "BitcoinAddress") {
    const feeQuote = inner?.feeQuote
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
    return inner?.fee ?? BigInt(0)
  }
  if (paymentMethod === undefined) {
    // Defensive only: the SDK types paymentMethod as required on the prepare
    // response, so callers never actually hit this. Kept as 0 for direct
    // callers passing nothing.
    return BigInt(0)
  }
  // Any other tag is a variant this module doesn't understand — 0.22.x added
  // SendPaymentMethod.CrossChainAddress to the union, and future SDK versions
  // may add more. Rendering an unknown variant as a 0-sat fee would display a
  // free send and skip the amount+fee balance check (the same failure mode the
  // BitcoinAddress no-quote branch above throws on). Throwing is classified
  // upstream as an "sdk" fee error via classifyBreezSdkError.
  throw new Error(`Unrecognized payment method in prepare response: ${paymentMethod.tag}`)
}
