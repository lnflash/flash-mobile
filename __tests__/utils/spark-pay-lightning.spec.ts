/**
 * ENG-712. payLightningBreez sends a bolt11 with a 60-second completion
 * timeout: sdk.sendPayment resolves once the payment leaves Pending or the
 * wait ends, so a payment that fails inside the wait resolves with status
 * Failed. The wrapper answered success: true for it, and the callers that
 * read only `success` reported an unpaid invoice as paid: sendPayment's
 * lightning branch, and chat zaps, which toasted "Zapped N sats".
 */

// The SDK the wrapper talks to. connectToSDK builds it with SdkBuilder, which
// the shared manual mock does not have, so this file adds a builder that
// hands out this object, plus the constructors connectToSDK and
// payLightningBreez call. Only the two calls a bolt11 send makes are faked.
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
    SendPaymentOptions: { Bolt11Invoice: Args },
    SdkBuilder: class {
      withDefaultStorage = async () => undefined
      build = async () => mockSdk
    },
  }
})

// sendZap signs a zap request only for a service that allows nostr, and the
// one below does not. The real signer would load the whole nostr runtime.
jest.mock("@app/nostr/signer", () => ({ getSigner: jest.fn() }))

import {
  PaymentStatus,
  SendPaymentResponse,
} from "@breeztech/breez-sdk-spark-react-native"
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
})
