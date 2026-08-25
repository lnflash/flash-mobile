import {
  extractFeeFromPaymentMethod,
  SendPaymentMethodLike,
} from "@app/utils/breez-sdk/fee-extraction"

const quote = {
  speedFast: { userFeeSat: BigInt(900), l1BroadcastFeeSat: BigInt(330) },
  speedMedium: { userFeeSat: BigInt(600), l1BroadcastFeeSat: BigInt(210) },
  speedSlow: { userFeeSat: BigInt(300), l1BroadcastFeeSat: BigInt(120) },
}

const bitcoinAddressMethod: SendPaymentMethodLike = {
  tag: "BitcoinAddress",
  inner: { feeQuote: quote },
}

describe("extractFeeFromPaymentMethod", () => {
  it("sums user + L1 broadcast fee for each onchain speed", () => {
    expect(extractFeeFromPaymentMethod(bitcoinAddressMethod, "fast")).toEqual(
      BigInt(1230),
    )
    expect(extractFeeFromPaymentMethod(bitcoinAddressMethod, "medium")).toEqual(
      BigInt(810),
    )
    expect(extractFeeFromPaymentMethod(bitcoinAddressMethod, "slow")).toEqual(BigInt(420))
  })

  it("defaults to medium when no speed is selected — never a silent 0", () => {
    expect(extractFeeFromPaymentMethod(bitcoinAddressMethod, undefined)).toEqual(
      BigInt(810),
    )
  })

  it("throws when the onchain prepare response carries no fee quote", () => {
    const withoutQuote: SendPaymentMethodLike = { tag: "BitcoinAddress", inner: {} }
    expect(() => extractFeeFromPaymentMethod(withoutQuote, "fast")).toThrow(
      /fee quote missing/i,
    )
  })

  it("reads the lightning fee from Bolt11 invoices", () => {
    const bolt11: SendPaymentMethodLike = {
      tag: "Bolt11Invoice",
      inner: { lightningFeeSats: BigInt(7) },
    }
    expect(extractFeeFromPaymentMethod(bolt11, undefined)).toEqual(BigInt(7))
    expect(
      extractFeeFromPaymentMethod({ tag: "Bolt11Invoice", inner: {} }, undefined),
    ).toEqual(BigInt(0))
  })

  it("reads the flat fee from Spark address and Spark invoice methods", () => {
    expect(
      extractFeeFromPaymentMethod(
        { tag: "SparkAddress", inner: { fee: BigInt(3) } },
        undefined,
      ),
    ).toEqual(BigInt(3))
    expect(
      extractFeeFromPaymentMethod(
        { tag: "SparkInvoice", inner: { fee: BigInt(4) } },
        undefined,
      ),
    ).toEqual(BigInt(4))
  })

  it("throws on unrecognized payment method tags — never a silent 0-sat fee", () => {
    // 0.22.x added CrossChainAddress to the SendPaymentMethod union; any tag
    // this module doesn't understand must not render as a free send.
    expect(() =>
      extractFeeFromPaymentMethod({ tag: "CrossChainAddress", inner: {} }, "fast"),
    ).toThrow(/unrecognized payment method.*CrossChainAddress/i)
    expect(() => extractFeeFromPaymentMethod({ tag: "SomethingNew" }, "fast")).toThrow(
      /unrecognized payment method.*SomethingNew/i,
    )
  })

  it("returns 0 when no payment method is passed at all", () => {
    expect(extractFeeFromPaymentMethod(undefined, "fast")).toEqual(BigInt(0))
  })
})
