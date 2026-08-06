import {
  classifyBreezSdkError,
  lnurlLimitsFromPayRequest,
  validateAmountWithinLimits,
} from "@app/utils/breez-sdk/fee-errors"

describe("lnurlLimitsFromPayRequest", () => {
  it("converts msat bounds to inclusive sat limits", () => {
    expect(
      lnurlLimitsFromPayRequest({
        minSendable: BigInt(1000),
        maxSendable: BigInt(150_000_000),
      }),
    ).toEqual({ minSats: 1, maxSats: 150_000 })
  })

  it("rounds min up and max down to whole sats", () => {
    expect(
      lnurlLimitsFromPayRequest({
        minSendable: BigInt(1500),
        maxSendable: BigInt(1999),
      }),
    ).toEqual({ minSats: 2, maxSats: 1 })
  })

  it("handles the sub-1-sat minSendable IBEX advertises", () => {
    expect(
      lnurlLimitsFromPayRequest({
        minSendable: BigInt(1),
        maxSendable: BigInt(150_000_000),
      }),
    ).toEqual({ minSats: 1, maxSats: 150_000 })
  })

  it("accepts plain numbers", () => {
    expect(lnurlLimitsFromPayRequest({ minSendable: 1000, maxSendable: 2000 })).toEqual({
      minSats: 1,
      maxSats: 2,
    })
  })

  it("returns null when the pay request or its bounds are missing", () => {
    expect(lnurlLimitsFromPayRequest(undefined)).toBeNull()
    expect(lnurlLimitsFromPayRequest({})).toBeNull()
    expect(lnurlLimitsFromPayRequest({ minSendable: BigInt(1) })).toBeNull()
    expect(lnurlLimitsFromPayRequest({ maxSendable: BigInt(1000) })).toBeNull()
  })

  it("returns null for unusable bounds", () => {
    expect(
      lnurlLimitsFromPayRequest({ minSendable: BigInt(0), maxSendable: BigInt(0) }),
    ).toBeNull()
  })
})

describe("validateAmountWithinLimits", () => {
  const limits = { minSats: 1, maxSats: 150_000 }

  it("rejects the regression case: 1,391,690 sats against a 150k-sat cap", () => {
    expect(validateAmountWithinLimits(1_391_690, limits)).toEqual({
      kind: "amount-above-max",
      maxSats: 150_000,
    })
  })

  it("rejects amounts below the minimum", () => {
    expect(validateAmountWithinLimits(1, { minSats: 10, maxSats: 100 })).toEqual({
      kind: "amount-below-min",
      minSats: 10,
    })
  })

  it("accepts amounts at the exact bounds (inclusive)", () => {
    expect(validateAmountWithinLimits(1, limits)).toBeNull()
    expect(validateAmountWithinLimits(150_000, limits)).toBeNull()
  })

  it("accepts amounts within the bounds", () => {
    expect(validateAmountWithinLimits(50_000, limits)).toBeNull()
  })

  it("skips validation when limits are unknown", () => {
    expect(validateAmountWithinLimits(1_391_690, null)).toBeNull()
  })
})

describe("classifyBreezSdkError", () => {
  it("classifies uniffi InsufficientFunds errors by tag", () => {
    const err = Object.assign(new Error("some opaque sdk text"), {
      tag: "InsufficientFunds",
    })
    expect(classifyBreezSdkError(err)).toEqual({
      kind: "insufficient-funds",
      message: "some opaque sdk text",
    })
  })

  it("classifies insufficient-funds errors by message", () => {
    expect(classifyBreezSdkError(new Error("not enough funds to cover amount"))).toEqual({
      kind: "insufficient-funds",
      message: "not enough funds to cover amount",
    })
    expect(classifyBreezSdkError(new Error("Insufficient funds"))).toMatchObject({
      kind: "insufficient-funds",
    })
  })

  it("classifies network errors by tag and by message", () => {
    const tagged = Object.assign(new Error("fetch failed"), { tag: "NetworkError" })
    expect(classifyBreezSdkError(tagged)).toMatchObject({ kind: "network" })
    expect(
      classifyBreezSdkError(new Error("Operation timed out after 15000ms")),
    ).toMatchObject({ kind: "network" })
    expect(classifyBreezSdkError(new Error("Network request failed"))).toMatchObject({
      kind: "network",
    })
  })

  it("falls back to sdk kind preserving the message", () => {
    expect(
      classifyBreezSdkError(new Error("uniffi LnurlError: invalid response")),
    ).toEqual({
      kind: "sdk",
      message: "uniffi LnurlError: invalid response",
    })
  })

  it("handles non-Error values", () => {
    expect(classifyBreezSdkError("plain string failure")).toEqual({
      kind: "sdk",
      message: "plain string failure",
    })
  })
})
