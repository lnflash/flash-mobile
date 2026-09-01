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

jest.mock("@app/graphql/generated", () => {
  const hook = () => [jest.fn(), { loading: false }]
  return {
    HomeAuthedDocument: {},
    PaymentSendResult: {
      Success: "SUCCESS",
      Failure: "FAILURE",
      Pending: "PENDING",
      AlreadyPaid: "ALREADY_PAID",
    },
    WalletCurrency: { Btc: "BTC", Usd: "USD" },
    useIntraLedgerPaymentSendMutation: hook,
    useIntraLedgerUsdPaymentSendMutation: hook,
    useLnInvoicePaymentSendMutation: hook,
    useLnNoAmountInvoicePaymentSendMutation: hook,
    useLnNoAmountUsdInvoicePaymentSendMutation: hook,
    useOnChainPaymentSendMutation: hook,
    useOnChainPaymentSendAllMutation: hook,
    useOnChainUsdPaymentSendMutation: hook,
    useOnChainUsdPaymentSendAsBtcDenominatedMutation: hook,
  }
})

const GRAPHQL_URI = "https://api.test.flashapp.me/graphql"
jest.mock("@app/hooks", () => ({
  useAppConfig: () => ({
    appConfig: {
      galoyInstance: { lnAddressHostname: "flashapp.me", graphqlUri: GRAPHQL_URI },
    },
  }),
}))

jest.mock("@app/utils/breez-sdk", () => ({
  payLightningBreez: jest.fn(),
  payOnchainBreez: jest.fn(),
  payLnurlBreez: jest.fn(),
}))

let uuidCounter = 0
jest.mock("uuid", () => ({
  v4: () => `uuid-${++uuidCounter}`,
}))

import { useSendPayment } from "@app/screens/send-bitcoin-screen/use-send-payment"

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
    const mutation = jest.fn(() => new Promise((resolve) => (resolveSend = resolve)))
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
