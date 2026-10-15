import { renderHook, act } from "@testing-library/react-native"

/**
 * ENG-533 — freeze-the-attempt idempotency.
 *
 * An attempt is an OBJECT (the send closure captured at the first tap + one
 * random key), never a content fingerprint. These tests pin the lifecycle:
 *
 *   double tap        → one mutation call; the second tap returns ignored
 *   throw             → retry re-runs the ORIGINAL closure with the SAME key,
 *                       even if the hook re-rendered with a new mutation
 *   Failure           → attempt cleared; next tap = fresh key, fresh closure
 *   Success           → attempt cleared; a later send never reuses the key
 */

jest.mock("@app/graphql/generated", () => ({
  HomeAuthedDocument: {},
  PaymentSendResult: {
    Success: "SUCCESS",
    Failure: "FAILURE",
    Pending: "PENDING",
    AlreadyPaid: "ALREADY_PAID",
  },
  WalletCurrency: { Btc: "BTC", Usd: "USD" },
}))

// The nine triggers are client.mutate calls since ENG-686, so the Apollo
// client is what gets faked. One client for the whole file, the way an
// ApolloProvider hands out one.
const mockClient = { mutate: jest.fn() }
jest.mock("@apollo/client", () => ({
  ...jest.requireActual("@apollo/client"),
  useApolloClient: () => mockClient,
}))

const GRAPHQL_URI = "https://api.test.flashapp.me/graphql"
const LN_ADDRESS_HOSTNAME = "flashapp.me"
// Mutable, so a test can switch the instance between renders the way
// setGaloyInstance (the debug screen) does. Reset before each test.
const mockGaloyInstance = {
  lnAddressHostname: LN_ADDRESS_HOSTNAME,
  graphqlUri: GRAPHQL_URI,
}
jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({ appConfig: { galoyInstance: mockGaloyInstance } }),
}))

jest.mock("@app/utils/breez-sdk", () => ({
  payLightningBreez: jest.fn(),
  payOnchainBreez: jest.fn(),
  payLnurlBreez: jest.fn(),
}))

let uuidCounter = 0
jest.mock("uuid", () => ({
  v4: () => {
    uuidCounter += 1
    return `uuid-${uuidCounter}`
  },
}))

import { useSendPayment } from "@app/screens/send-bitcoin-screen/use-send-payment"
import { SendPaymentMutationParams } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { payLightningBreez, payLnurlBreez } from "@app/utils/breez-sdk"

// A USD payment detail: only the fields the hook reads on the GraphQL path.
const usdPaymentDetail = {
  sendingWalletDescriptor: { currency: "USD", id: "usd-wallet" },
} as never

const render = (mutation: jest.Mock) => {
  let currentMutation: jest.Mock = mutation
  const utils = renderHook(() => useSendPayment(currentMutation, usdPaymentDetail))
  return {
    ...utils,
    // Re-render with a DIFFERENT mutation closure — simulates the re-render
    // that used to re-mint invoices and re-derive amounts.
    swapMutation: (next: jest.Mock) => {
      currentMutation = next
      utils.rerender(undefined as never)
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  uuidCounter = 0
  mockGaloyInstance.lnAddressHostname = LN_ADDRESS_HOSTNAME
})

describe("useSendPayment — freeze-the-attempt", () => {
  it("sends once with a random key and the configured endpoint", async () => {
    const mutation = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    const { result } = render(mutation)

    let outcome
    await act(async () => {
      outcome = await result.current.sendPayment?.()
    })

    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mutation.mock.calls[0][0]).toMatchObject({
      idempotencyKey: "uuid-1",
      apiEndpoint: GRAPHQL_URI,
    })
    expect(outcome).toEqual({ status: "SUCCESS", errorsMessage: undefined })
  })

  it("suppresses a double tap: second call returns ignored, one mutation fires", async () => {
    let resolveSend: (v: unknown) => void = () => {}
    const mutation = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve
        }),
    )
    const { result } = render(mutation)

    await act(async () => {
      const first = result.current.sendPayment?.()
      // Second tap lands while the first is on the wire. The render-time
      // hasAttemptedSend gate hasn't flipped yet — this is the ref's job.
      const second = await result.current.sendPayment?.()
      expect(second).toEqual({
        status: undefined,
        errorsMessage: undefined,
        ignored: true,
      })
      resolveSend({ status: "SUCCESS" })
      await first
    })

    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it("on throw, the retry re-runs the ORIGINAL closure with the SAME key — even after a re-render swapped the mutation", async () => {
    const original = jest
      .fn()
      .mockRejectedValueOnce(new Error("socket dropped"))
      .mockResolvedValue({ status: "SUCCESS" })
    const { result, swapMutation } = render(original)

    await act(async () => {
      await expect(result.current.sendPayment?.()).rejects.toThrow("socket dropped")
    })

    // Between taps the screen re-renders: new payment detail, new closure.
    // A content fingerprint would have to decide whether this is "the same"
    // payment. Object identity doesn't: the frozen attempt ignores it.
    const reRendered = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    swapMutation(reRendered)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    expect(original).toHaveBeenCalledTimes(2)
    expect(reRendered).not.toHaveBeenCalled()
    expect(original.mock.calls[0][0].idempotencyKey).toBe("uuid-1")
    expect(original.mock.calls[1][0].idempotencyKey).toBe("uuid-1")
    // The gate's keyless fallback is only sound on a first dispatch, so the
    // hook must tell it which is which: first dispatch false, retry true.
    expect(original.mock.calls[0][0].attemptIsRetry).toBe(false)
    expect(original.mock.calls[1][0].attemptIsRetry).toBe(true)
  })

  it("refuses to auto-retry an attempt whose earlier dispatch went out KEYLESS", async () => {
    // The mixed-fleet window: the gate is latched (a stale pod refused
    // earlier), so the attempt's first dispatch goes out keyless — reported
    // via onKeylessDispatch — and then throws with the outcome unknown. The
    // server has never seen this attempt's key, so a retry has nothing to
    // replay: dispatching it (the closure would now send KEYED against a pod
    // that accepts the field) could execute a second payment while the
    // keyless one may have committed. The retry must not dispatch at all.
    const mutation = jest.fn(async (params: { onKeylessDispatch?: () => void }) => {
      params.onKeylessDispatch?.()
      throw new Error("socket dropped")
    })
    const { result } = render(mutation)

    await act(async () => {
      await expect(result.current.sendPayment?.()).rejects.toThrow("socket dropped")
    })
    // The throw re-armed the button, so the retry tap is reachable...
    expect(result.current.sendPayment).toBeTruthy()

    let outcome:
      | Awaited<ReturnType<NonNullable<typeof result.current.sendPayment>>>
      | undefined
    await act(async () => {
      outcome = await result.current.sendPayment?.()
    })

    // ...but it surfaces the check-your-history failure WITHOUT dispatching:
    // the mutation ran exactly once, on the keyless first dispatch.
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(outcome?.status).toBe("FAILURE")
    expect(outcome?.errorsMessage).toMatch(
      /may have already been sent.*transaction history/i,
    )
    // Same as the reuse-error branch: the button stays disarmed, so no
    // fresh-key tap is offered for a payment that may already have settled.
    expect(result.current.hasAttemptedSend).toBe(true)
    expect(result.current.sendPayment).toBeUndefined()
  })

  it("a fresh attempt after a FAILURE dispatches as a first attempt, not a retry", async () => {
    const first = jest.fn().mockResolvedValue({ status: "FAILURE", errors: [] })
    const { result, swapMutation } = render(first)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    const second = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    swapMutation(second)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    expect(second.mock.calls[0][0].attemptIsRetry).toBe(false)
  })

  it("an IdempotencyKeyReuseError failure does NOT re-arm the button — the user is sent to history", async () => {
    // The server holding a result for this key against different parameters is
    // never an ordinary failure: re-arming hands the next tap a FRESH key for
    // a payment that may already have settled, and the money leaves twice.
    const mutation = jest.fn().mockResolvedValue({
      status: "FAILURE",
      errors: [
        {
          message:
            "This idempotency key was already used for a different payment. Use a new key for a new payment.",
        },
      ],
    })
    const { result } = render(mutation)

    let outcome:
      | Awaited<ReturnType<NonNullable<typeof result.current.sendPayment>>>
      | undefined
    await act(async () => {
      outcome = await result.current.sendPayment?.()
    })

    expect(outcome?.status).toBe("FAILURE")
    expect(outcome?.errorsMessage).toMatch(/transaction history/i)
    // Button stays disarmed: no fresh-key tap is reachable.
    expect(result.current.hasAttemptedSend).toBe(true)
    expect(result.current.sendPayment).toBeUndefined()
  })

  it("on FAILURE, the attempt is finished: next tap gets a FRESH key and the CURRENT closure", async () => {
    const first = jest.fn().mockResolvedValue({ status: "FAILURE", errors: [] })
    const { result, swapMutation } = render(first)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    const second = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    swapMutation(second)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    // A known failure must never pin the old key — that's the 24h
    // cached-FAILURE lockout of the fingerprint design.
    expect(second).toHaveBeenCalledTimes(1)
    expect(first.mock.calls[0][0].idempotencyKey).toBe("uuid-1")
    expect(second.mock.calls[0][0].idempotencyKey).toBe("uuid-2")
  })

  it("FAILURE re-arms the button (hasAttemptedSend false); SUCCESS does not", async () => {
    const failing = jest.fn().mockResolvedValue({ status: "FAILURE" })
    const { result } = render(failing)

    await act(async () => {
      await result.current.sendPayment?.()
    })
    expect(result.current.hasAttemptedSend).toBe(false)
    expect(result.current.sendPayment).toBeTruthy()

    const succeeding = jest.fn().mockResolvedValue({ status: "SUCCESS" })
    const secondRender = render(succeeding)
    await act(async () => {
      await secondRender.result.current.sendPayment?.()
    })
    expect(secondRender.result.current.hasAttemptedSend).toBe(true)
    expect(secondRender.result.current.sendPayment).toBeUndefined()
  })

  it("a throw re-arms the button so the frozen retry is reachable", async () => {
    const mutation = jest.fn().mockRejectedValue(new Error("502"))
    const { result } = render(mutation)

    await act(async () => {
      await expect(result.current.sendPayment?.()).rejects.toThrow("502")
    })

    expect(result.current.hasAttemptedSend).toBe(false)
    expect(result.current.sendPayment).toBeTruthy()
  })
})

/**
 * ENG-686: `loading` drives the Confirm button's spinner. It used to be the OR
 * of the nine useMutation hooks' own flags, and is now counted around each
 * client.mutate call. It has to keep that meaning: true only while a GraphQL
 * mutation is pending.
 */
describe("useSendPayment — loading", () => {
  // A send closure shaped like the payment-details builders': it reaches the
  // network only through a trigger the hook hands it.
  const sendThroughTrigger = () =>
    jest.fn(async (params: SendPaymentMutationParams) => {
      const { data } = await params.lnInvoicePaymentSend({
        variables: { input: { walletId: "usd-wallet", paymentRequest: "lnbc1invoice" } },
      })
      return {
        status: data?.lnInvoicePaymentSend.status,
        errors: data?.lnInvoicePaymentSend.errors,
      }
    })

  // Each client.mutate call stays pending until the test settles it.
  const pendingMutations = () => {
    const calls: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = []
    mockClient.mutate.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          calls.push({ resolve, reject })
        }),
    )
    return calls
  }

  const answer = (status: string, errors: { message: string }[] = []) => ({
    data: { lnInvoicePaymentSend: { status, errors } },
  })

  it("stays false for the whole of a Breez send", async () => {
    let finishPay: (v: unknown) => void = () => {}
    ;(payLightningBreez as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPay = resolve
        }),
    )
    const btcPaymentDetail = {
      sendingWalletDescriptor: { currency: "BTC", id: "btc-wallet" },
      paymentType: "lightning",
      destination: "lnbc1invoice",
      settlementAmount: { amount: 100, currency: "BTC", currencyCode: "BTC" },
    } as never
    const mutation = jest.fn()
    const { result } = renderHook(() => useSendPayment(mutation, btcPaymentDetail))

    let send: Promise<unknown> | undefined
    await act(async () => {
      send = result.current.sendPayment?.()
    })
    // The payment is on the wire through Breez; no GraphQL mutation is.
    expect(payLightningBreez).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)

    await act(async () => {
      finishPay({ success: true })
      await send
    })
    expect(result.current.loading).toBe(false)
    expect(mockClient.mutate).not.toHaveBeenCalled()
    expect(mutation).not.toHaveBeenCalled()
  })

  const settledAnswers: [string, ReturnType<typeof answer>][] = [
    ["SUCCESS", answer("SUCCESS")],
    ["FAILURE", answer("FAILURE", [{ message: "Insufficient balance" }])],
    [
      "an IdempotencyKeyReuseError FAILURE",
      answer("FAILURE", [
        {
          message:
            "This idempotency key was already used for a different payment. Use a new key for a new payment.",
        },
      ]),
    ],
  ]
  settledAnswers.forEach(([label, response]) => {
    it(`is true while the mutation is pending, and false after ${label}`, async () => {
      const calls = pendingMutations()
      const { result } = render(sendThroughTrigger())
      expect(result.current.loading).toBe(false)

      let send: Promise<unknown> | undefined
      await act(async () => {
        send = result.current.sendPayment?.()
      })
      expect(mockClient.mutate).toHaveBeenCalledTimes(1)
      expect(result.current.loading).toBe(true)

      await act(async () => {
        calls[0].resolve(response)
        await send
      })
      expect(result.current.loading).toBe(false)
    })
  })

  it("is true while the mutation is pending, and false after it throws", async () => {
    const calls = pendingMutations()
    const { result } = render(sendThroughTrigger())

    let send: Promise<unknown> | undefined
    await act(async () => {
      send = result.current.sendPayment?.()
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      calls[0].reject(new Error("socket dropped"))
      await expect(send).rejects.toThrow("socket dropped")
    })
    expect(result.current.loading).toBe(false)
  })

  it("is true again for a second dispatch in the same attempt", async () => {
    // The idempotency gate's keyless fallback sends twice in one attempt: the
    // keyed send is refused, then the same input goes out without the key.
    // The old per-hook flag was true for each of those calls, so loading is
    // counted per call, not per attempt.
    const calls = pendingMutations()
    const resendOnRefusal = jest.fn(async (params: SendPaymentMutationParams) => {
      const variables = {
        input: { walletId: "usd-wallet", paymentRequest: "lnbc1invoice" },
      }
      try {
        await params.lnInvoicePaymentSend({ variables })
      } catch {
        // refused: go again without the key
      }
      const { data } = await params.lnInvoicePaymentSend({ variables })
      return { status: data?.lnInvoicePaymentSend.status }
    })
    const { result } = render(resendOnRefusal)

    let send: Promise<unknown> | undefined
    await act(async () => {
      send = result.current.sendPayment?.()
    })
    expect(result.current.loading).toBe(true)

    await act(async () => {
      calls[0].reject(new Error('Field "idempotencyKey" is not defined'))
    })
    expect(mockClient.mutate).toHaveBeenCalledTimes(2)
    expect(result.current.loading).toBe(true)

    await act(async () => {
      calls[1].resolve(answer("SUCCESS"))
      await send
    })
    expect(result.current.loading).toBe(false)
  })
})

/**
 * ENG-686: the hook hands `galoyInstance.lnAddressHostname` to sendPayment,
 * which completes a BTC-wallet intraledger handle with it. That host decides
 * whose wallet is paid, so the hand-off is pinned here, from the app config
 * through the real breezBtcRail to payLnurlBreez.
 */
describe("useSendPayment — BTC intraledger address", () => {
  // One detail object for every render. A new object per render would
  // rebuild the send closure anyway and hide a missing memo dependency.
  const btcIntraledgerDetail = {
    sendingWalletDescriptor: { currency: "BTC", id: "btc-wallet" },
    paymentType: "intraledger",
    destination: "alice",
    settlementAmount: { amount: 100, currency: "BTC", currencyCode: "BTC" },
  } as never

  beforeEach(() => {
    ;(payLnurlBreez as jest.Mock).mockResolvedValue({
      payment: {},
      successAction: undefined,
    })
  })

  it("pays handle@lnAddressHostname of the configured instance", async () => {
    const mutation = jest.fn()
    const { result } = renderHook(() => useSendPayment(mutation, btcIntraledgerDetail))

    await act(async () => {
      await result.current.sendPayment?.()
    })

    expect((payLnurlBreez as jest.Mock).mock.calls).toEqual([
      ["alice@flashapp.me", 100, ""],
    ])
    expect(mutation).not.toHaveBeenCalled()
    expect(mockClient.mutate).not.toHaveBeenCalled()
  })

  it("pays at the new host after lnAddressHostname changes between renders", async () => {
    const mutation = jest.fn()
    const { result, rerender } = renderHook(() =>
      useSendPayment(mutation, btcIntraledgerDetail),
    )

    // Only the host changes: the same send closure, detail and fee type.
    mockGaloyInstance.lnAddressHostname = "test.flashapp.me"
    rerender(undefined as never)

    await act(async () => {
      await result.current.sendPayment?.()
    })

    expect((payLnurlBreez as jest.Mock).mock.calls).toEqual([
      ["alice@test.flashapp.me", 100, ""],
    ])
  })
})
