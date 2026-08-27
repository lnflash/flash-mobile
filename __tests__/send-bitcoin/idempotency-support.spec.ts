/**
 * The app can ship ahead of any given environment's API, and GraphQL rejects
 * unknown input-object fields during INPUT COERCION — before execution. So an
 * unconditional `idempotencyKey` on `LnNoAmountUsdInvoicePaymentInput`, which
 * only gained the field in flash#494, does not degrade against an older
 * backend: it errors the whole mutation out and every no-amount USD lightning
 * send stops working. `yarn graphql-check` cannot see this — it validates our
 * operations against the checked-in snapshot, not against a deployed server.
 *
 * These drive the REAL builder, so they fail if the gate is removed from
 * lightning.ts as well as if the gate itself regresses.
 */
import { WalletCurrency } from "@app/graphql/generated"
import { createNoAmountLightningPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import {
  idempotencyKeySupported,
  isUnsupportedIdempotencyKeyError,
  resetIdempotencyKeySupport,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { toUsdMoneyAmount } from "@app/types/amounts"

import {
  convertMoneyAmountMock,
  createSendPaymentMocks,
} from "../payment-details/helpers"

const PAYMENT_REQUEST = "lnbc1someinvoice"

// The message graphql-js produces when an input object is handed a field its
// type does not declare — i.e. what an API from before flash#494 answers with.
const COERCION_REFUSAL =
  'Variable "$input" got invalid value "k" at "input.idempotencyKey"; ' +
  'Field "idempotencyKey" is not defined by type "LnNoAmountUsdInvoicePaymentInput".'

const usdNoAmountDetail = () =>
  createNoAmountLightningPaymentDetails({
    paymentRequest: PAYMENT_REQUEST,
    unitOfAccountAmount: toUsdMoneyAmount(250),
    convertMoneyAmount: convertMoneyAmountMock,
    sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "usd-wallet" },
  })

const send = async (mocks: ReturnType<typeof createSendPaymentMocks>) => {
  const details = usdNoAmountDetail()
  if (!details.canSendPayment) throw new Error("Cannot send payment")
  return details.sendPaymentMutation(mocks)
}

const keysSent = (mutation: jest.Mock) =>
  mutation.mock.calls.map(([args]) => args.variables.input.idempotencyKey)

beforeEach(resetIdempotencyKeySupport)

describe("an API that has the field", () => {
  it("sends the key, and only once", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const result = await send(mocks)

    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey])
    expect(result.status).toBe("SUCCESS")
    expect(idempotencyKeySupported()).toBe(true)
  })

  it("does not swallow a real send failure as a missing field", async () => {
    // The dangerous confusion: reading any error as "the field does not
    // exist" would retry the send WITHOUT the key — which is the double-pay
    // this whole mechanism exists to prevent.
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error("Network request failed"))

    await expect(send(mocks)).rejects.toThrow("Network request failed")
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(idempotencyKeySupported()).toBe(true)
  })

  it("does not read a backend error that merely mentions the key as a missing field", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error("idempotencyKey already used for a payment"))

    await expect(send(mocks)).rejects.toThrow("already used")
    expect(mutation).toHaveBeenCalledTimes(1)
  })
})

describe("an API from before flash#494", () => {
  it("degrades to today's behaviour instead of failing the send", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValueOnce({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const result = await send(mocks)

    // Coercion fails BEFORE execution, so the refusal proves nothing settled
    // and the un-keyed retry cannot double-pay.
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey, undefined])
    expect(result.status).toBe("SUCCESS")
  })

  it("stops offering the field for the rest of the session", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(mocks)
    await send(mocks)

    expect(idempotencyKeySupported()).toBe(false)
    // First send: keyed, refused, retried bare. Second: bare from the start —
    // no wasted round trip.
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey, undefined, undefined])
  })

  it("recognises the refusal when it arrives as an Apollo graphQLErrors list", async () => {
    expect(
      isUnsupportedIdempotencyKeyError({
        message: "Response not successful",
        graphQLErrors: [{ message: COERCION_REFUSAL }],
      }),
    ).toBe(true)
  })
})
