import { LnurlPayOutcomeUnknownError } from "@app/utils/breez-sdk/lnurl-pay-errors"

/**
 * ENG-711: sendPayment tells a rejection from sdk.lnurlPay itself (the outcome
 * is unknown, so Confirm stays disarmed) from every other rejection (re-arm) by
 * this class alone. Its contract is pinned here.
 */
describe("LnurlPayOutcomeUnknownError", () => {
  it("carries the SDK error's message and keeps the error itself", () => {
    const sdkError = new Error("SdkError.SparkError")

    const error = new LnurlPayOutcomeUnknownError(sdkError)

    expect(error.message).toBe("SdkError.SparkError")
    expect(error.sdkError).toBe(sdkError)
  })

  it("takes String() of a rejection that is not an Error", () => {
    const rejections: unknown[] = ["SSP timeout", 42, undefined, null, { code: 7 }]

    rejections.forEach((rejection) => {
      const error = new LnurlPayOutcomeUnknownError(rejection)

      expect(error.message).toBe(String(rejection))
      expect(error.sdkError).toBe(rejection)
    })
  })

  it("is an Error of its own class, under its own name", () => {
    const error = new LnurlPayOutcomeUnknownError(new Error("x"))

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect(error.name).toBe("LnurlPayOutcomeUnknownError")
  })

  it("does not match a plain Error with the same message", () => {
    // A plain Error is a refusal before the dispatch, which re-arms.
    expect(new Error("SdkError.SparkError")).not.toBeInstanceOf(
      LnurlPayOutcomeUnknownError,
    )
  })
})
