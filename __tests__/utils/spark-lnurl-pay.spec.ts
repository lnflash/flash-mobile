/**
 * ENG-711: payLnurlBreez's own split between the steps before the dispatch and
 * sdk.lnurlPay itself.
 *
 * sendPayment keeps Confirm disarmed for a LnurlPayOutcomeUnknownError and
 * re-arms on any other rejection. So a rejection from lnurlPay has to come out
 * as that class, or the next tap pays a second time, and a refusal before the
 * dispatch has to stay a plain error: nothing was sent, and the user may try
 * again.
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
    const sdkError = new Error("SdkError.SparkError")
    sdk.lnurlPay.mockRejectedValue(sdkError)

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as LnurlPayOutcomeUnknownError).sdkError).toBe(sdkError)
    expect((error as LnurlPayOutcomeUnknownError).message).toBe("SdkError.SparkError")
    expect(sdk.lnurlPay).toHaveBeenCalledTimes(1)
  })

  it("passes a parse rejection through untouched, and never dispatches", async () => {
    const refusal = new Error("invalid input")
    sdk.parse.mockRejectedValue(refusal)

    await expect(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO)).rejects.toBe(refusal)
    expect(sdk.prepareLnurlPay).not.toHaveBeenCalled()
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
  })

  it("passes a prepareLnurlPay rejection through untouched, and never dispatches", async () => {
    const refusal = new Error("amount is out of range")
    sdk.prepareLnurlPay.mockRejectedValue(refusal)

    await expect(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO)).rejects.toBe(refusal)
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
  })

  it('refuses an input that is not LNURL-pay with a plain "Unsupported input type", and never dispatches', async () => {
    sdk.parse.mockResolvedValue({ tag: "Bolt11Invoice", inner: [{ invoice: "lnbc1" }] })

    const error = await rejectionOf(payLnurlBreez(LNURL, AMOUNT_SATS, MEMO))

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LnurlPayOutcomeUnknownError)
    expect((error as Error).message).toBe("Unsupported input type")
    expect(sdk.prepareLnurlPay).not.toHaveBeenCalled()
    expect(sdk.lnurlPay).not.toHaveBeenCalled()
  })
})
