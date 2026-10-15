/**
 * ENG-714: payOnchainBreez's own split between the steps before the dispatch
 * and sdk.sendPayment itself.
 *
 * sendPayment re-arms Confirm on a plain `success: false` answer and keeps it
 * disarmed on `outcomeUnknown: true`. In spark-sdk 0.22.3 a rejection from
 * sdk.sendPayment can come after the cooperative exit went out (a lost
 * complete_coop_exit answer, a failed storage write), so it has to come out as
 * outcomeUnknown, or the next tap withdraws a second time. A refusal before
 * the dispatch has to stay the plain answer: nothing left the wallet, and the
 * user may try again. This is the only test that pins which call threw.
 *
 * The rejection from sendPayment is also logged, with its message and the
 * reason the SDK gave, to the console and, through appendLog, to the Spark log
 * CSV, as payLnurlBreez logs its own (spark-lnurl-pay.spec.ts). The RN binding
 * builds an SdkError's message from the variant alone ("SdkError.SparkError")
 * and carries the reason in `inner`, so the rejections below are shaped like
 * its errors.
 *
 * The SDK module is the shared manual mock, whose enums and SendPaymentOptions
 * classes mirror the generated ones, plus a builder that hands out a fake SDK,
 * so the real initializeBreezSDK connects to it and payOnchainBreez runs
 * unchanged. The Keychain and RNFS calls on the way go to their manual mocks
 * in __mocks__. appendLog is a jest.fn; the rest of the log buffer is the real
 * module.
 */
const mockSdk = {
  prepareSendPayment: jest.fn(),
  sendPayment: jest.fn(),
}

jest.mock("@breeztech/breez-sdk-spark-react-native", () => {
  // The shared manual mock, by path: __tests__/mocks/breez-sdk-spark-mock-parity.spec.ts
  // pins its enums to the generated ones.
  const sharedMock = jest.requireActual(
    "../../__mocks__/@breeztech/breez-sdk-spark-react-native.js",
  )
  // The constructors connectToSDK calls keep their arguments and nothing else.
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
jest.mock("@app/utils/breez-sdk/log-buffer", () => ({
  __esModule: true,
  ...jest.requireActual("@app/utils/breez-sdk/log-buffer"),
  appendLog: jest.fn(),
}))

import {
  OnchainConfirmationSpeed,
  PaymentRequest,
  SendPaymentOptions,
} from "@breeztech/breez-sdk-spark-react-native"
import { appendLog } from "@app/utils/breez-sdk/log-buffer"
import { initializeBreezSDK, payOnchainBreez } from "@app/utils/breez-sdk/spark"

const appendLogMock = appendLog as jest.MockedFunction<typeof appendLog>

const ADDRESS = "bc1qdestination"
const AMOUNT_SATS = 21_000
// The attempt's key, as sendPayment mints it: a UUID v4.
const KEY = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"
// payOnchainBreez's refusal before the dispatch, unchanged by ENG-714.
const REFUSAL =
  "Failed to pay the invoice. Please make sure you have enough balance to cover the payment and the network fee."
// The label of the log line for a rejection from sendPayment, which also
// starts its line in the Spark log CSV. The tests that expect no such line
// check the first argument of every console.error call, so a call with any
// number of arguments counts. Nothing else in payOnchainBreez calls appendLog,
// so those tests expect no call to it at all.
const AFTER_DISPATCH = "payOnchainBreez error after dispatch:"
const COOP_EXIT_RESET = "complete_coop_exit: connection reset"

// What prepareSendPayment resolves with, carrying only what the wrapper hands
// back to sendPayment.
const prepareResponse = { amount: BigInt(AMOUNT_SATS), feePolicy: 0 }
// What sendPayment resolves with. Status 1 is PaymentStatus.Pending in the
// generated enum: a cooperative exit waits for its on-chain confirmation.
const sent = { payment: { id: KEY, status: 1 } }

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

let consoleError: jest.SpyInstance

beforeEach(() => {
  mockSdk.prepareSendPayment.mockReset()
  mockSdk.prepareSendPayment.mockResolvedValue(prepareResponse)
  mockSdk.sendPayment.mockReset()
  mockSdk.sendPayment.mockResolvedValue(sent)
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

describe("payOnchainBreez before the SDK is connected", () => {
  it("answers the plain refusal, never dispatches, and logs nothing after dispatch", async () => {
    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({ success: false, error: REFUSAL })

    expect(mockSdk.prepareSendPayment).not.toHaveBeenCalled()
    expect(mockSdk.sendPayment).not.toHaveBeenCalled()
    expectNoAfterDispatchLog()
  })
})

describe("payOnchainBreez", () => {
  beforeAll(async () => {
    await initializeBreezSDK()
  })

  const speeds: ["fast" | "medium" | "slow", OnchainConfirmationSpeed][] = [
    ["fast", OnchainConfirmationSpeed.Fast],
    ["medium", OnchainConfirmationSpeed.Medium],
    ["slow", OnchainConfirmationSpeed.Slow],
  ]
  speeds.forEach(([feeType, speed]) => {
    it(`prepares the address, then sends it once with the attempt's key and the ${feeType} speed`, async () => {
      await expect(
        payOnchainBreez(ADDRESS, AMOUNT_SATS, feeType, KEY),
      ).resolves.toStrictEqual({ success: true, payment: sent })

      expect(mockSdk.prepareSendPayment.mock.calls).toStrictEqual([
        [
          {
            paymentRequest: new PaymentRequest.Input({ input: ADDRESS }),
            amount: BigInt(AMOUNT_SATS),
            tokenIdentifier: undefined,
            conversionOptions: undefined,
            feePolicy: undefined,
          },
        ],
      ])
      expect(mockSdk.sendPayment.mock.calls).toStrictEqual([
        [
          {
            prepareResponse,
            options: new SendPaymentOptions.BitcoinAddress({ confirmationSpeed: speed }),
            idempotencyKey: KEY,
          },
        ],
      ])
      expect(mockSdk.sendPayment.mock.calls[0][0].prepareResponse).toBe(prepareResponse)
      expectNoAfterDispatchLog()
    })
  })

  // The key is the caller's attempt's (sendPayment keeps it across calls), so
  // the wrapper must never mint one of its own: a fresh key per call could
  // never match an earlier withdrawal's.
  it("sends no key when the caller passes none, never one of its own", async () => {
    await payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast")

    expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
    expect(mockSdk.sendPayment.mock.calls[0][0]).toHaveProperty(
      "idempotencyKey",
      undefined,
    )
  })

  it("answers a prepareSendPayment refusal with the plain refusal, never dispatches, and logs nothing after dispatch", async () => {
    mockSdk.prepareSendPayment.mockRejectedValue(
      sdkError("InvalidInput", [
        "Amount is below the minimum of 546 sats required for this address",
      ]),
    )

    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({ success: false, error: REFUSAL })
    expect(mockSdk.sendPayment).not.toHaveBeenCalled()
    expectNoAfterDispatchLog()
  })

  it("answers a rejection from sendPayment itself as an unknown outcome with its message, and logs it", async () => {
    mockSdk.sendPayment.mockRejectedValue(new Error(COOP_EXIT_RESET))

    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({
      success: false,
      error: COOP_EXIT_RESET,
      outcomeUnknown: true,
    })
    expect(mockSdk.sendPayment).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls).toEqual([[AFTER_DISPATCH, COOP_EXIT_RESET, ""]])
    expect(appendLogMock.mock.calls).toEqual([
      ["ERROR", `${AFTER_DISPATCH} ${COOP_EXIT_RESET}`],
    ])
  })

  it("logs the message and the SDK's reason from inner, to the console and the Spark log CSV, for an SdkError from sendPayment", async () => {
    mockSdk.sendPayment.mockRejectedValue(sdkError("SparkError", [COOP_EXIT_RESET]))

    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({
      success: false,
      error: "SdkError.SparkError",
      outcomeUnknown: true,
    })
    expect(consoleError.mock.calls).toEqual([
      [AFTER_DISPATCH, "SdkError.SparkError", COOP_EXIT_RESET],
    ])
    expect(appendLogMock.mock.calls).toEqual([
      ["ERROR", `${AFTER_DISPATCH} SdkError.SparkError ${COOP_EXIT_RESET}`],
    ])
  })

  it("still answers outcomeUnknown when inner is an object holding a bigint, and logs no reason", async () => {
    // InsufficientCpfpFunds' shape. JSON.stringify throws on the bigint. A
    // TypeError out of the catch would reach sendPayment as a rejection, which
    // keeps Confirm disarmed, but the line that records why would be lost.
    mockSdk.sendPayment.mockRejectedValue(
      sdkError("InsufficientCpfpFunds", { requiredSat: BigInt(1000) }),
    )

    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({
      success: false,
      error: "SdkError.InsufficientCpfpFunds",
      outcomeUnknown: true,
    })
    expect(consoleError.mock.calls).toEqual([
      [AFTER_DISPATCH, "SdkError.InsufficientCpfpFunds", ""],
    ])
    expect(appendLogMock.mock.calls).toEqual([
      ["ERROR", `${AFTER_DISPATCH} SdkError.InsufficientCpfpFunds`],
    ])
  })

  it("answers a rejection from sendPayment that is not an Error by its string form", async () => {
    mockSdk.sendPayment.mockRejectedValue("connection reset")

    await expect(
      payOnchainBreez(ADDRESS, AMOUNT_SATS, "fast", KEY),
    ).resolves.toStrictEqual({
      success: false,
      error: "connection reset",
      outcomeUnknown: true,
    })
    expect(consoleError.mock.calls).toEqual([[AFTER_DISPATCH, "connection reset", ""]])
    expect(appendLogMock.mock.calls).toEqual([
      ["ERROR", `${AFTER_DISPATCH} connection reset`],
    ])
  })
})
