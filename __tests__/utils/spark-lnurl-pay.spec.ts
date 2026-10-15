/**
 * ENG-711: payLnurlBreez's own split between the steps before the dispatch and
 * sdk.lnurlPay itself.
 *
 * sendPayment keeps Confirm disarmed for a LnurlPayOutcomeUnknownError and
 * re-arms on any other rejection. So a rejection from lnurlPay has to come out
 * as that class, or the next tap pays a second time, and a refusal before the
 * dispatch has to stay a plain error: nothing was sent, and the user may try
 * again. The rejection from lnurlPay is also logged, with its message and the
 * reason the SDK gave, since nothing the app logs after payLnurlBreez tells one
 * apart from another: the screen shows the history message and payment_result
 * records a plain FAILURE. The RN binding builds an SdkError's message from the
 * variant alone ("SdkError.SparkError") and carries the reason in `inner`, so
 * the rejections below are shaped like its errors.
 *
 * The SDK module is replaced by a fake whose builder hands back a fake SDK, so
 * the real initializeBreezSDK connects to it and payLnurlBreez runs unchanged.
 * The Keychain and RNFS calls on the way go to their manual mocks in __mocks__.
 */
jest.mock("@breeztech/breez-sdk-spark-react-native", () => ({
  __esModule: true,
  Network: { Mainnet: 0 },
  defaultConfig: () => ({}),
  Seed: { Mnemonic: class {} },
  MaxFee: { NetworkRecommended: class {} },
  SdkBuilder: class {
    async withDefaultStorage() {}
    async build() {
      return { parse: jest.fn(), prepareLnurlPay: jest.fn(), lnurlPay: jest.fn() }
    }
  },
}))

import { LnurlPayOutcomeUnknownError } from "@app/utils/breez-sdk/lnurl-pay-errors"
import {
  getSDKInstance,
  initializeBreezSDK,
  payLnurlBreez,
} from "@app/utils/breez-sdk/spark"

type FakeSdk = {
  parse: jest.Mock
  prepareLnurlPay: jest.Mock
  lnurlPay: jest.Mock
}

const LNURL = "bob@example.com"
// The label of the log line for a rejection from lnurlPay. The tests that
// expect no such line check the first argument of every console.error call:
// toHaveBeenCalledWith matches the whole argument list, so a negative one with
// a different number of arguments than the log line never fails.
const AFTER_DISPATCH = "payLnurlBreez error after dispatch:"
const AMOUNT_SATS = 2100
const MEMO = "lunch"

const payRequest = {
  callback: "https://example.com/lnurl/callback",
  minSendable: BigInt(1000),
  maxSendable: BigInt(100_000_000),
  metadataStr: "[]",
  commentAllowed: 255,
  allowsNostr: false,
  nostrPubkey: undefined,
  payerData: undefined,
}
const prepareResponse = { payRequest, amountSats: BigInt(AMOUNT_SATS) }
// Status 0 is PaymentStatus.Completed in the generated enum.
const answer = { payment: { status: 0 }, successAction: undefined }

// An SdkError as the RN binding builds it. uniffi sets the message to the type
// and variant alone (uniffi-bindgen-react-native/typescript/src/errors.ts), and
// the SDK's reason travels in a frozen `inner`: a [string] for the variants that
// carry text, an object for the rest (SdkError in
// @breeztech/breez-sdk-spark-react-native/src/generated/breez_sdk_spark.ts).
const sdkError = (variant: string, inner: object): Error =>
  Object.assign(new Error(`SdkError.${variant}`), {
    tag: variant,
    inner: Object.freeze(inner),
  })
const TRANSPORT_ERROR = "request_lightning_send: transport error"

const rejectionOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected payLnurlBreez to reject")
    },
    (error: unknown) => error,
  )

describe("payLnurlBreez before the SDK is connected", () => {
  it("rejects with a plain Error, since nothing was sent", async () => {
    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as Error).message).toMatch("Breez SDK not initialized")
  })
})

describe("payLnurlBreez", () => {
  let sdk: FakeSdk
  let consoleError: jest.SpyInstance

  beforeAll(async () => {
    await initializeBreezSDK()
    sdk = getSDKInstance() as unknown as FakeSdk
  })

  beforeEach(() => {
    sdk.parse.mockReset()
    sdk.parse.mockResolvedValue({ tag: "LnurlPay", inner: [payRequest] })
    sdk.prepareLnurlPay.mockReset()
    sdk.prepareLnurlPay.mockResolvedValue(prepareResponse)
    sdk.lnurlPay.mockReset()
    sdk.lnurlPay.mockResolvedValue(answer)
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("prepares the parsed pay request, pays it once, and returns lnurlPay's answer", async () => {
    await expect(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO)).resolves.toBe(answer)

    expect(sdk.parse.mock.calls).toEqual([[LNURL]])
    expect(sdk.prepareLnurlPay).toHaveBeenCalledTimes(1)
    expect(sdk.prepareLnurlPay.mock.calls[0][0]).toMatchObject({
      amount: BigInt(AMOUNT_SATS),
      payRequest,
      comment: MEMO,
    })
    expect(sdk.lnurlPay.mock.calls).toEqual([
      [{ prepareResponse, idempotencyKey: undefined }],
    ])
  })

  it("rethrows a rejection from lnurlPay itself as LnurlPayOutcomeUnknownError, with the SDK's error", async () => {
    const rejection = sdkError("SparkError", [TRANSPORT_ERROR])
    sdk.lnurlPay.mockRejectedValue(rejection)

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as LnurlPayOutcomeUnknownError).sdkError).toBe(rejection)
    expect((error as LnurlPayOutcomeUnknownError).message).toBe("SdkError.SparkError")
    expect(sdk.lnurlPay).toHaveBeenCalledTimes(1)
  })

  it("logs the message and the SDK's reason from inner for a rejection from lnurlPay itself", async () => {
    sdk.lnurlPay.mockRejectedValue(sdkError("SparkError", [TRANSPORT_ERROR]))

    await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(consoleError.mock.calls).toEqual([
      [AFTER_DISPATCH, "SdkError.SparkError", TRANSPORT_ERROR],
    ])
  })

  it("still rejects as LnurlPayOutcomeUnknownError when inner is an object holding a bigint, and logs no reason", async () => {
    // InsufficientCpfpFunds' shape. JSON.stringify throws on the bigint, and a
    // TypeError out of the catch would reach sendPayment as a plain Error and
    // re-arm Confirm.
    const rejection = sdkError("InsufficientCpfpFunds", { requiredSat: BigInt(1000) })
    sdk.lnurlPay.mockRejectedValue(rejection)

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as LnurlPayOutcomeUnknownError).sdkError).toBe(rejection)
    expect(consoleError.mock.calls).toEqual([
      [AFTER_DISPATCH, "SdkError.InsufficientCpfpFunds", ""],
    ])
  })

  it("logs and wraps a rejection from lnurlPay that is not an Error by its string form", async () => {
    sdk.lnurlPay.mockRejectedValue("connection reset")

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as LnurlPayOutcomeUnknownError).sdkError).toBe("connection reset")
    expect((error as LnurlPayOutcomeUnknownError).message).toBe("connection reset")
    expect(consoleError.mock.calls).toEqual([[AFTER_DISPATCH, "connection reset", ""]])
  })

  it("passes a parse rejection through untouched, and never dispatches", async () => {
    const refusal = new Error("invalid input")
    sdk.parse.mockRejectedValue(refusal)

    await expect(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO)).rejects.toBe(refusal)
    expect(sdk.prepareLnurlPay).not.toHaveBeenCalled()
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
    expect(consoleError.mock.calls.map(([label]) => label)).not.toContain(AFTER_DISPATCH)
  })

  it("passes a prepareLnurlPay rejection through untouched, and never dispatches", async () => {
    const refusal = new Error("amount is out of range")
    sdk.prepareLnurlPay.mockRejectedValue(refusal)

    await expect(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO)).rejects.toBe(refusal)
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
    expect(consoleError.mock.calls.map(([label]) => label)).not.toContain(AFTER_DISPATCH)
  })

  it('refuses an input that is not LNURL-pay with a plain "Unsupported input type", and never dispatches', async () => {
    sdk.parse.mockResolvedValue({ tag: "Bolt11Invoice", inner: [{ invoice: "lnbc1" }] })

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as Error).message).toBe("Unsupported input type")
    expect(sdk.prepareLnurlPay).not.toHaveBeenCalled()
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
    expect(consoleError.mock.calls.map(([label]) => label)).not.toContain(AFTER_DISPATCH)
  })
})
