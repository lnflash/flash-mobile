/**
 * ENG-712. payLightningBreez sends a bolt11 with a 60-second completion
 * timeout: sdk.sendPayment resolves once the payment leaves Pending or the
 * wait ends, so a payment that fails inside the wait resolves with status
 * Failed. The wrapper answered success: true for it, and the callers that
 * read only `success` reported an unpaid invoice as paid: sendPayment's
 * lightning branch, and chat zaps, which toasted "Zapped N sats".
 *
 * ENG-720. payLightningBreez's own split between the steps before the
 * dispatch and sdk.sendPayment itself. sendPayment re-arms Confirm on a plain
 * `success: false` answer and keeps it disarmed on `outcomeUnknown: true`, and
 * the chat zap and the swap do the same. In spark-sdk 0.22.3 a rejection from
 * sdk.sendPayment can come after the payment left, so it has to come out as
 * outcomeUnknown, or the next tap pays again. A refusal before the dispatch
 * has to stay the plain answer with its own message: nothing left the wallet,
 * and the user may try again. The rejection from sendPayment is also logged,
 * with its message and the reason the SDK gave, to the console and, through
 * appendLog, to the Spark log CSV, as payOnchainBreez logs its own
 * (spark-pay-onchain.spec.ts). appendLog is a jest.fn; the rest of the log
 * buffer is the real module, with initLogBuffer stubbed too.
 */

// The SDK the wrapper talks to. connectToSDK builds it with SdkBuilder, which
// the shared manual mock does not have, so this file adds a builder that
// hands out this object, plus the constructors connectToSDK calls.
// payLightningBreez's SendPaymentOptions is the shared mock's, which mirrors
// the generated classes. Only the two calls a bolt11 send makes are faked.
const mockSdk = {
  prepareSendPayment: jest.fn(),
  sendPayment: jest.fn(),
}

jest.mock("@breeztech/breez-sdk-spark-react-native", () => {
  // The shared manual mock, by path. Its enums mirror the generated ones:
  // see __tests__/mocks/breez-sdk-spark-mock-parity.spec.ts.
  const sharedMock = jest.requireActual(
    "../../__mocks__/@breeztech/breez-sdk-spark-react-native.js",
  )
  // The constructors keep their arguments and nothing else.
  class Args {
    constructor(args: object) {
      Object.assign(this, args)
    }
  }
  return {
    ...sharedMock,
    Network: { Mainnet: 0 },
    defaultConfig: () => ({}),
    Seed: { Mnemonic: Args },
    MaxFee: { NetworkRecommended: Args },
    SdkBuilder: class {
      withDefaultStorage = async () => undefined
      build = async () => mockSdk
    },
  }
})

// sendZap signs a zap request only for a service that allows nostr, and the
// one below does not. The real signer would load the whole nostr runtime.
jest.mock("@app/nostr/signer", () => ({ getSigner: jest.fn() }))
jest.mock("@app/utils/breez-sdk/log-buffer", () => ({
  __esModule: true,
  ...jest.requireActual("@app/utils/breez-sdk/log-buffer"),
  appendLog: jest.fn(),
  initLogBuffer: jest.fn(),
}))

import {
  PaymentRequest,
  PaymentStatus,
  SendPaymentOptions,
  SendPaymentResponse,
} from "@breeztech/breez-sdk-spark-react-native"
import { appendLog } from "@app/utils/breez-sdk/log-buffer"
import {
  initializeBreezSDK,
  lightningPayResponse,
  payLightningBreez,
} from "@app/utils/breez-sdk/spark"
import { sendZap } from "@app/utils/nostr/zap"

// What sdk.sendPayment resolves with, carrying only the field the wrapper
// reads.
const resolvedWith = (status: PaymentStatus) =>
  ({ payment: { status } } as unknown as SendPaymentResponse)

const appendLogMock = appendLog as jest.MockedFunction<typeof appendLog>

const INVOICE = "lnbc21u1invoice"
const AMOUNT_SATS = 2_100
// The line for a refusal before the dispatch, unchanged by ENG-720.
const BEFORE_DISPATCH = "payLightningBreez error:"
// The label of the log line for a rejection from sendPayment, which also
// starts its line in the Spark log CSV. The tests that expect no such line
// check the first argument of every console.error call, so a call with any
// number of arguments counts. Nothing else in payLightningBreez calls
// appendLog, so those tests expect no call to it at all.
const AFTER_DISPATCH = "payLightningBreez error after dispatch:"
const TRANSPORT_ERROR = "request_lightning_send: transport error"

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

describe("lightningPayResponse", () => {
  it("answers success: false for a Failed payment, with the payment and no error", () => {
    const response = resolvedWith(PaymentStatus.Failed)

    // No error: a Failed payment carries no reason, so each caller shows its
    // own failure copy.
    expect(lightningPayResponse(response)).toStrictEqual({
      success: false,
      payment: response,
    })
  })

  const sentStatuses: [string, PaymentStatus][] = [
    ["Completed", PaymentStatus.Completed],
    // Still in flight when the wait ended. It may yet complete, so a caller
    // must not offer a retry.
    ["Pending", PaymentStatus.Pending],
  ]
  sentStatuses.forEach(([label, status]) => {
    it(`answers success: true for a ${label} payment, with the payment`, () => {
      const response = resolvedWith(status)

      expect(lightningPayResponse(response)).toStrictEqual({
        success: true,
        payment: response,
      })
    })
  })
})

// ENG-720. Above every describe that connects: initializeBreezSDK() in a
// beforeAll connects for the rest of the file.
describe("payLightningBreez before the SDK is connected", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("answers the plain refusal with its own message, never dispatches, and logs nothing after dispatch", async () => {
    const answer = await payLightningBreez(INVOICE, AMOUNT_SATS)

    expect(answer).toStrictEqual({
      success: false,
      error: "Breez SDK not initialized. Call initializeBreezSDK first.",
    })
    expect(mockSdk.prepareSendPayment).not.toHaveBeenCalled()
    expect(mockSdk.sendPayment).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([[BEFORE_DISPATCH, answer.error]])
    expect(appendLogMock).not.toHaveBeenCalled()
  })
})

describe("a chat zap paid through payLightningBreez", () => {
  const ZAP_INVOICE = "lnbc210n1zapinvoice"
  const realFetch = globalThis.fetch

  // The chat screen's payInvoice while Breez runs: payLightningBreez(pr), with
  // no amount (app/screens/chat/messages.tsx).
  const zap = () =>
    sendZap({
      recipientPubkey: "f".repeat(64),
      lud16: "bob@example.com",
      amountSats: 21,
      lnAddressHostname: "flashapp.me",
      payInvoice: (pr) => payLightningBreez(pr),
    })

  beforeAll(async () => {
    await initializeBreezSDK()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSdk.prepareSendPayment.mockResolvedValue({})
    // The LNURL pay params, then the zap's invoice from their callback.
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          callback: "https://example.com/lnurlp/bob/callback",
          minSendable: 1000,
          maxSendable: 100000000,
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ pr: ZAP_INVOICE }),
      }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it("is not a success when the payment resolves Failed, so the chat shows its own failure copy", async () => {
    mockSdk.sendPayment.mockResolvedValue(resolvedWith(PaymentStatus.Failed))

    const result = await zap()

    // messages.tsx toasts "Zapped N sats" for success: true only, and
    // otherwise `result.error || "Payment could not be sent."`.
    expect(result).toMatchObject({ success: false })
    expect(result.error).toBeUndefined()
    // The answer is the zap invoice's own payment, not an earlier failure.
    expect(mockSdk.prepareSendPayment).toHaveBeenCalledTimes(1)
    expect(mockSdk.prepareSendPayment.mock.calls[0][0].paymentRequest.inner.input).toBe(
      ZAP_INVOICE,
    )
    expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
  })

  it("is a success when the payment Completed", async () => {
    mockSdk.sendPayment.mockResolvedValue(resolvedWith(PaymentStatus.Completed))

    await expect(zap()).resolves.toMatchObject({ success: true })
    expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
  })

  // ENG-720. The zap's payment may already have left, and a retry would fetch
  // a fresh invoice and pay again, so the chat keeps the zap button disabled
  // on outcomeUnknown (messages.tsx) and shows the history message instead of
  // `error`.
  it("is an unknown outcome when sendPayment itself rejects, so the chat does not offer a retry", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
    mockSdk.sendPayment.mockRejectedValue(sdkError("SparkError", [TRANSPORT_ERROR]))

    try {
      await expect(zap()).resolves.toStrictEqual({
        success: false,
        error: "SdkError.SparkError",
        outcomeUnknown: true,
      })
      expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
      expect(consoleError.mock.calls).toEqual([
        [AFTER_DISPATCH, "SdkError.SparkError", TRANSPORT_ERROR],
      ])
    } finally {
      consoleError.mockRestore()
    }
  })
})

// ENG-720: which call threw. The real wrapper against the fake SDK, connected
// through the real initializeBreezSDK, as spark-pay-onchain.spec.ts does for
// payOnchainBreez.
describe("payLightningBreez", () => {
  // What prepareSendPayment resolves with, carrying only what the wrapper
  // hands back to sendPayment.
  const prepareResponse = { amount: BigInt(AMOUNT_SATS), feePolicy: 0 }

  let consoleError: jest.SpyInstance

  beforeAll(async () => {
    await initializeBreezSDK()
  })

  beforeEach(() => {
    mockSdk.prepareSendPayment.mockReset()
    mockSdk.prepareSendPayment.mockResolvedValue(prepareResponse)
    mockSdk.sendPayment.mockReset()
    mockSdk.sendPayment.mockResolvedValue(resolvedWith(PaymentStatus.Completed))
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
    appendLogMock.mockClear()
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  const expectNoAfterDispatchLog = () => {
    expect(consoleError.mock.calls.map(([label]) => label)).not.toContain(AFTER_DISPATCH)
    expect(appendLogMock).not.toHaveBeenCalled()
  }

  it("prepares the invoice, then sends it once with the Bolt11 options and no key", async () => {
    const sent = resolvedWith(PaymentStatus.Completed)
    mockSdk.sendPayment.mockResolvedValue(sent)

    await expect(payLightningBreez(INVOICE, AMOUNT_SATS)).resolves.toStrictEqual({
      success: true,
      payment: sent,
    })

    expect(mockSdk.prepareSendPayment.mock.calls).toStrictEqual([
      [
        {
          paymentRequest: new PaymentRequest.Input({ input: INVOICE }),
          amount: BigInt(AMOUNT_SATS),
          tokenIdentifier: undefined,
          conversionOptions: undefined,
          feePolicy: undefined,
        },
      ],
    ])
    // Keyless until ENG-715 proves the SDK replays a bolt11 key.
    expect(mockSdk.sendPayment.mock.calls).toStrictEqual([
      [
        {
          prepareResponse,
          options: new SendPaymentOptions.Bolt11Invoice({
            preferSpark: false,
            completionTimeoutSecs: 60,
          }),
          idempotencyKey: undefined,
        },
      ],
    ])
    expect(mockSdk.sendPayment.mock.calls[0][0].prepareResponse).toBe(prepareResponse)
    expectNoAfterDispatchLog()
  })

  it("answers a prepareSendPayment refusal with its own message, never dispatches, and logs nothing after dispatch", async () => {
    mockSdk.prepareSendPayment.mockRejectedValue(
      sdkError("InvalidInput", ["Invoice has expired"]),
    )

    await expect(payLightningBreez(INVOICE, AMOUNT_SATS)).resolves.toStrictEqual({
      success: false,
      error: "SdkError.InvalidInput",
    })
    expect(mockSdk.sendPayment).not.toHaveBeenCalled()
    expect(consoleError.mock.calls).toEqual([[BEFORE_DISPATCH, "SdkError.InvalidInput"]])
    expectNoAfterDispatchLog()
  })

  // [label, what sendPayment rejects with, the answer's error, the reason
  // logged after the message]
  const rejections: [string, unknown, string, string][] = [
    ["an Error", new Error(TRANSPORT_ERROR), TRANSPORT_ERROR, ""],
    // The RN binding's message names only the variant; the reason is in inner.
    [
      "an SdkError with a text reason",
      sdkError("SparkError", [TRANSPORT_ERROR]),
      "SdkError.SparkError",
      TRANSPORT_ERROR,
    ],
    // InsufficientCpfpFunds' shape. JSON.stringify throws on the bigint. A
    // TypeError out of the catch would lose the log line, and the chat zap and
    // the swap would re-arm on the rejection.
    [
      "an SdkError whose inner is an object holding a bigint",
      sdkError("InsufficientCpfpFunds", { requiredSat: BigInt(1000) }),
      "SdkError.InsufficientCpfpFunds",
      "",
    ],
    ["a value that is not an Error", "connection reset", "connection reset", ""],
  ]
  rejections.forEach(([label, rejection, message, reason]) => {
    it(`answers a rejection from sendPayment itself (${label}) as an unknown outcome with its message, and logs it once`, async () => {
      mockSdk.sendPayment.mockRejectedValue(rejection)

      await expect(payLightningBreez(INVOICE, AMOUNT_SATS)).resolves.toStrictEqual({
        success: false,
        error: message,
        outcomeUnknown: true,
      })
      expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
      expect(consoleError.mock.calls).toEqual([[AFTER_DISPATCH, message, reason]])
      expect(appendLogMock.mock.calls).toEqual([
        ["ERROR", `${AFTER_DISPATCH} ${message} ${reason}`.trimEnd()],
      ])
    })
  })

  // The ENG-712 boundary: a payment that resolved Failed is a known failure,
  // not an unknown outcome, so the caller may re-arm.
  it("answers a payment that resolved Failed with success: false and no outcomeUnknown", async () => {
    const failed = resolvedWith(PaymentStatus.Failed)
    mockSdk.sendPayment.mockResolvedValue(failed)

    await expect(payLightningBreez(INVOICE, AMOUNT_SATS)).resolves.toStrictEqual({
      success: false,
      payment: failed,
    })
    expectNoAfterDispatchLog()
  })

  const sentStatuses: [string, PaymentStatus][] = [
    ["Completed", PaymentStatus.Completed],
    ["Pending", PaymentStatus.Pending],
  ]
  sentStatuses.forEach(([label, status]) => {
    it(`answers a ${label} payment with success: true`, async () => {
      const sent = resolvedWith(status)
      mockSdk.sendPayment.mockResolvedValue(sent)

      await expect(payLightningBreez(INVOICE, AMOUNT_SATS)).resolves.toStrictEqual({
        success: true,
        payment: sent,
      })
      expectNoAfterDispatchLog()
    })
  })
})
