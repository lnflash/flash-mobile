/**
 * fetchBreezOnchainFees, the speed picker's quote, against fetchBreezFee, the
 * check at Next.
 *
 * Both have to send the SDK the same onchain prepare request, or the picker
 * dims or allows speeds by a different fee than the one Next enforces. Both go
 * through one helper in spark.ts; this pins that their requests match.
 *
 * The picker's quote runs by itself on every amount that settles, so only an
 * unexpected SDK fault goes to Crashlytics. An insufficient-funds rejection or
 * a network blip is an expected miss the screen falls back on, and must not log
 * a non-fatal for every amount the user pauses on.
 *
 * The SDK module is the shared manual mock plus a builder that hands out a
 * fake SDK, as in spark-pay-onchain.spec.ts.
 */
const mockSdk = {
  prepareSendPayment: jest.fn(),
}
const mockRecordError = jest.fn()

jest.mock("@breeztech/breez-sdk-spark-react-native", () => {
  const sharedMock = jest.requireActual(
    "../../__mocks__/@breeztech/breez-sdk-spark-react-native.js",
  )
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
jest.mock("@react-native-firebase/crashlytics", () => ({
  __esModule: true,
  getCrashlytics: () => ({ log: () => undefined, recordError: mockRecordError }),
  default: () => ({ log: () => undefined, recordError: mockRecordError }),
}))

import {
  fetchBreezFee,
  fetchBreezOnchainFees,
  initializeBreezSDK,
} from "@app/utils/breez-sdk/spark"

const ADDRESS = "bc1qdestination"
const AMOUNT_SATS = 21_000

const prepareResponse = {
  paymentMethod: {
    tag: "BitcoinAddress",
    inner: {
      feeQuote: {
        speedFast: { userFeeSat: BigInt(900), l1BroadcastFeeSat: BigInt(330) },
        speedMedium: { userFeeSat: BigInt(600), l1BroadcastFeeSat: BigInt(210) },
        speedSlow: { userFeeSat: BigInt(300), l1BroadcastFeeSat: BigInt(120) },
      },
    },
  },
}

const sdkError = (variant: string, inner: object): Error =>
  Object.assign(new Error(`SdkError.${variant}`), {
    tag: variant,
    inner: Object.freeze(inner),
  })

let consoleLog: jest.SpyInstance

beforeEach(() => {
  mockSdk.prepareSendPayment.mockReset()
  mockSdk.prepareSendPayment.mockResolvedValue(prepareResponse)
  mockRecordError.mockReset()
  consoleLog = jest.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  consoleLog.mockRestore()
})

// Before the SDK connects: the quote finds no instance. The screen falls back
// on it, so it is not reported either.
describe("fetchBreezOnchainFees before the SDK is connected", () => {
  it("answers no fees and does not report to Crashlytics", async () => {
    const result = await fetchBreezOnchainFees({
      paymentRequest: ADDRESS,
      amountSats: AMOUNT_SATS,
    })

    expect(result.fees).toBeNull()
    expect(result.err?.kind).toBe("sdk")
    expect(mockSdk.prepareSendPayment).not.toHaveBeenCalled()
    expect(mockRecordError).not.toHaveBeenCalled()
  })
})

describe("with the SDK connected", () => {
  beforeAll(async () => {
    await initializeBreezSDK()
  })

  describe("the speed picker's quote and the Next check", () => {
    it("send the SDK the same onchain prepare request and read the same fees", async () => {
      const picker = await fetchBreezOnchainFees({
        paymentRequest: ADDRESS,
        amountSats: AMOUNT_SATS,
      })
      const next = await Promise.all(
        (["fast", "medium", "slow"] as const).map((selectedFeeType) =>
          fetchBreezFee({
            paymentType: "onchain",
            paymentRequest: ADDRESS,
            amountSats: AMOUNT_SATS,
            selectedFeeType,
          }),
        ),
      )

      expect(picker).toStrictEqual({
        fees: { fast: 1230, medium: 810, slow: 420 },
        err: null,
      })
      expect(next.map(({ fee }) => fee)).toStrictEqual([1230, 810, 420])

      const [pickerRequest, ...nextRequests] = mockSdk.prepareSendPayment.mock.calls.map(
        ([request]) => request,
      )
      expect(nextRequests).toHaveLength(3)
      nextRequests.forEach((request) => expect(request).toStrictEqual(pickerRequest))
    })
  })

  describe("fetchBreezOnchainFees error reporting", () => {
    it("does not report an insufficient-funds rejection to Crashlytics", async () => {
      mockSdk.prepareSendPayment.mockRejectedValue(
        sdkError("InsufficientFunds", ["not enough funds"]),
      )

      const result = await fetchBreezOnchainFees({
        paymentRequest: ADDRESS,
        amountSats: AMOUNT_SATS,
      })

      expect(result.fees).toBeNull()
      expect(result.err?.kind).toBe("insufficient-funds")
      expect(mockRecordError).not.toHaveBeenCalled()
    })

    it("does not report a network failure to Crashlytics", async () => {
      mockSdk.prepareSendPayment.mockRejectedValue(new Error("request timed out"))

      const result = await fetchBreezOnchainFees({
        paymentRequest: ADDRESS,
        amountSats: AMOUNT_SATS,
      })

      expect(result.err?.kind).toBe("network")
      expect(mockRecordError).not.toHaveBeenCalled()
    })

    it("reports an unexpected SDK fault to Crashlytics once, with the original error", async () => {
      const fault = sdkError("SparkError", ["tree service unavailable"])
      mockSdk.prepareSendPayment.mockRejectedValue(fault)

      const result = await fetchBreezOnchainFees({
        paymentRequest: ADDRESS,
        amountSats: AMOUNT_SATS,
      })

      expect(result.err?.kind).toBe("sdk")
      expect(mockRecordError.mock.calls).toStrictEqual([[fault]])
    })

    it("keeps the console log for every failure", async () => {
      mockSdk.prepareSendPayment.mockRejectedValue(
        sdkError("InsufficientFunds", ["not enough funds"]),
      )

      await fetchBreezOnchainFees({ paymentRequest: ADDRESS, amountSats: AMOUNT_SATS })

      expect(consoleLog.mock.calls.map(([label]) => label)).toContain(
        "FETCH BREEZ ONCHAIN FEES ERROR",
      )
    })
  })
})
