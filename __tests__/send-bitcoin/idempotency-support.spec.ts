/**
 * The app can ship ahead of any given environment's API, and GraphQL rejects
 * unknown input-object fields during INPUT COERCION — before execution. So an
 * unconditional `idempotencyKey` does not degrade against an older backend: it
 * errors the whole mutation out and that entire send path stops working.
 * `yarn graphql-check` cannot see this — it validates our operations against
 * the checked-in snapshot, not against a deployed server.
 *
 * That hazard is not special to the newest input. The app had never sent ANY
 * of these fields before, so "ENG-530 is long deployed" is an assumption
 * nothing in this repo measures — which is why all five inputs are gated, and
 * why the cases below drive all five through the REAL builders. They fail if
 * the gate is removed from lightning.ts or intraledger.ts as well as if the
 * gate itself regresses.
 */
import fs from "fs"
import path from "path"

import { AppState, AppStateStatus } from "react-native"
import { WalletCurrency } from "@app/graphql/generated"
import {
  createAmountLightningPaymentDetails,
  createNoAmountLightningPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details/lightning"
import { createIntraledgerPaymentDetails } from "@app/screens/send-bitcoin-screen/payment-details/intraledger"
import {
  IDEMPOTENT_SEND_INPUTS,
  idempotencyKeySupported,
  isIdempotencyKeyReuseError,
  isUnsupportedIdempotencyKeyError,
  rearmIdempotencyKeySupport,
  resetIdempotencyKeySupport,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { PaymentDetail } from "@app/screens/send-bitcoin-screen/payment-details/index.types"

// `PaymentDetail<T>` is invariant in T, so a BTC detail and a USD detail have
// no common supertype to hold them in one list. The union is what the builders
// under test actually return.
type SendableDetail = PaymentDetail<"BTC"> | PaymentDetail<"USD">
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

import {
  convertMoneyAmountMock,
  createSendPaymentMocks,
} from "../payment-details/helpers"

const PAYMENT_REQUEST = "lnbc1someinvoice"
const ENDPOINT = "https://api.test.flashapp.me/graphql"
const OTHER_ENDPOINT = "https://api.staging.flashapp.me/graphql"

// The message graphql-js really produces when an input object is handed a
// field its type does not declare — i.e. what an API from before the field was
// added answers with. Pinned to the actual shape: `coerceVariableValues`
// reports an unknown field at the INPUT OBJECT's path, inspecting the whole
// object (so the offending key appears in the "got invalid value" half too),
// not at `input.idempotencyKey`. A test that invents a tidier message lets a
// gate that only matches the tidier message pass.
const coercionRefusalFor = (inputType: string) =>
  'Variable "$input" got invalid value { walletId: "usd-wallet", paymentRequest: ' +
  '"lnbc1someinvoice", amount: 250, idempotencyKey: "test-idempotency-key" }; ' +
  `Field "idempotencyKey" is not defined by type "${inputType}".`

const COERCION_REFUSAL = coercionRefusalFor(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)

// The same generated shape, for a field that has nothing to do with this gate:
// the server added a required input field the app does not know about yet. The
// whole input — `idempotencyKey` included — is inspected into the message, so
// a gate built from "mentions the key" AND "says got invalid value" reads this
// as "the server lacks idempotencyKey" and disarms idempotency for the rest of
// the process.
const UNRELATED_COERCION_REFUSAL =
  'Variable "$input" got invalid value { walletId: "usd-wallet", paymentRequest: ' +
  '"lnbc1someinvoice", amount: 250, idempotencyKey: "test-idempotency-key" }; ' +
  'Field "recipientTag" of required type "String!" was not provided.'

const usdNoAmountDetail = () =>
  createNoAmountLightningPaymentDetails({
    paymentRequest: PAYMENT_REQUEST,
    unitOfAccountAmount: toUsdMoneyAmount(250),
    convertMoneyAmount: convertMoneyAmountMock,
    sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "usd-wallet" },
  })

const sendWith = async (
  detail: SendableDetail,
  mocks: ReturnType<typeof createSendPaymentMocks>,
) => {
  if (!detail.canSendPayment) throw new Error("Cannot send payment")
  return detail.sendPaymentMutation(mocks)
}

const send = async (mocks: ReturnType<typeof createSendPaymentMocks>) =>
  sendWith(usdNoAmountDetail(), mocks)

const keysSent = (mutation: jest.Mock) =>
  mutation.mock.calls.map(([args]) => args.variables.input.idempotencyKey)

const gate = (
  inputType: (typeof IDEMPOTENT_SEND_INPUTS)[keyof typeof IDEMPOTENT_SEND_INPUTS],
) => ({
  apiEndpoint: ENDPOINT,
  inputType,
})

beforeEach(resetIdempotencyKeySupport)
afterEach(() => {
  jest.restoreAllMocks()
})

// The input names are load-bearing twice: they scope the gate, and a coercion
// refusal has to NAME one before it is read as being about that input. A typo
// disables the gate silently, so it is checked against the schema the app is
// generated from rather than against itself.
describe("the gated input names are the ones the server declares", () => {
  const sdl = fs.readFileSync(
    path.join(__dirname, "../../app/graphql/public-schema.graphql"),
    "utf8",
  )

  Object.values(IDEMPOTENT_SEND_INPUTS).forEach((inputType) => {
    it(`${inputType} exists and carries idempotencyKey`, () => {
      const block = sdl.match(new RegExp(`input ${inputType} \\{[^}]*\\}`))
      expect(block).not.toBeNull()
      expect(block?.[0]).toContain("idempotencyKey")
    })
  })

  it("gates every send input the app actually calls", () => {
    // Five inputs, five gates. A sixth send path appearing without a gate is
    // the regression this counts.
    expect(Object.values(IDEMPOTENT_SEND_INPUTS)).toHaveLength(5)
  })
})

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
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(true)
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
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(true)
  })

  it("does not read a backend error that merely mentions the key as a missing field", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error("idempotencyKey already used for a payment"))

    await expect(send(mocks)).rejects.toThrow("already used")
    expect(mutation).toHaveBeenCalledTimes(1)
  })

  it("does not disarm itself over a coercion error about a DIFFERENT field", async () => {
    // The way this gate silently kills idempotency for good: every
    // input-coercion message inspects the whole input object, so the key is
    // quoted inside a refusal that has nothing to do with it. Reading that as
    // "the field does not exist" makes every later no-amount USD send go out
    // bare, and a lost response plus a retry then double-pays.
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error(UNRELATED_COERCION_REFUSAL))

    await expect(send(mocks)).rejects.toThrow("recipientTag")
    // Not retried bare: the caller must see the real error.
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey])
    // ...and the next send still carries the key.
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(true)
  })

  it("does not disarm itself over an unrelated coercion error in graphQLErrors", async () => {
    expect(
      isUnsupportedIdempotencyKeyError(
        {
          message: "Response not successful",
          graphQLErrors: [{ message: UNRELATED_COERCION_REFUSAL }],
        },
        IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice,
      ),
    ).toBe(false)
  })
})

describe("an API that does not have the field on this input", () => {
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

  it("stops offering the field on that input for the rest of the session", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(mocks)
    await send(mocks)

    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(false)
    // First send: keyed, refused, retried bare. Second: bare from the start —
    // no wasted round trip.
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey, undefined, undefined])
  })

  it("recognises the refusal when it arrives as an Apollo graphQLErrors list", async () => {
    expect(
      isUnsupportedIdempotencyKeyError(
        {
          message: "Response not successful",
          graphQLErrors: [{ message: COERCION_REFUSAL }],
        },
        IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice,
      ),
    ).toBe(true)
  })

  it("does not read one input's refusal as another input's", async () => {
    // The five inputs gained the field in different server releases, so a
    // refusal on one says nothing about the other four. Latching them together
    // throws away protection on paths that provably have it.
    expect(
      isUnsupportedIdempotencyKeyError(
        new Error(coercionRefusalFor(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
        IDEMPOTENT_SEND_INPUTS.lnInvoice,
      ),
    ).toBe(false)

    const mocks = createSendPaymentMocks()
    const refused = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    refused.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await send(mocks)

    const accepted = mocks.lnInvoicePaymentSend as jest.Mock
    accepted.mockResolvedValue({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await sendWith(
      createAmountLightningPaymentDetails({
        paymentRequest: PAYMENT_REQUEST,
        paymentRequestAmount: toBtcMoneyAmount(1000),
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: { currency: WalletCurrency.Usd, id: "usd-wallet" },
      }),
      mocks,
    )

    expect(keysSent(accepted)).toEqual([mocks.idempotencyKey])
  })

  it("does not read one backend's refusal as another backend's", async () => {
    // The app can switch galoyInstance at runtime. A single process-global let
    // one send against staging disarm idempotency for prod for the rest of the
    // session — on the exact path it exists to protect.
    const staging = { ...createSendPaymentMocks(), apiEndpoint: OTHER_ENDPOINT }
    const stagingMutation = staging.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    stagingMutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await send(staging)

    expect(
      idempotencyKeySupported({
        apiEndpoint: OTHER_ENDPOINT,
        inputType: IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice,
      }),
    ).toBe(false)
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(true)

    const prod = createSendPaymentMocks()
    const prodMutation = prod.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    prodMutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await send(prod)

    expect(keysSent(prodMutation)).toEqual([prod.idempotencyKey])
  })

  it("re-arms on foreground, so one stale pod costs one send and not the session", async () => {
    // A refusal is evidence about the pod that answered, not the deployment:
    // mid rolling deploy one stale pod can refuse while the rest of the fleet
    // accepts. Latched for the process lifetime, that pod disarms idempotency
    // even after the deploy finishes and the user comes back.
    const foregroundHandlers: ((state: AppStateStatus) => void)[] = []
    jest
      .spyOn(AppState, "addEventListener")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((_event: string, handler: any) => {
        foregroundHandlers.push(handler)
        return { remove: jest.fn() }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any)

    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(mocks)
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(false)

    expect(foregroundHandlers).not.toHaveLength(0)
    foregroundHandlers.forEach((handler) => handler("background"))
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(false)

    foregroundHandlers.forEach((handler) => handler("active"))
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(true)

    mutation.mockClear()
    await send(mocks)
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey])
  })

  it("re-arms every gate at once", () => {
    rearmIdempotencyKeySupport()
    Object.values(IDEMPOTENT_SEND_INPUTS).forEach((inputType) => {
      expect(idempotencyKeySupported(gate(inputType))).toBe(true)
    })
  })
})

// The keyless fallback is only sound on an attempt's FIRST dispatch, where a
// coercion refusal proves nothing executed. On a RETRY an earlier keyed
// dispatch with an UNKNOWN outcome exists by definition — the mixed-fleet
// shape: tap 1 commits on a new pod, the response is lost (502), the retry
// hits a stale pod that refuses the field. Falling back keyless there would
// silently execute a second payment on exactly the path ENG-533 protects.
describe("a retry of a dispatched attempt", () => {
  const retryMocks = () => ({ ...createSendPaymentMocks(), attemptIsRetry: true })

  it("never falls back keyless on a coercion refusal — the error surfaces instead", async () => {
    const mocks = retryMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error(COERCION_REFUSAL))

    await expect(send(mocks)).rejects.toThrow(
      /may have already been sent.*transaction history/i,
    )
    // Exactly one dispatch, and it carried the key: no silent keyless re-send.
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(keysSent(mutation)).toEqual([mocks.idempotencyKey])
    // The refusal is still recorded, so a NEW attempt degrades as usual.
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(false)
  })

  it("dispatches keyed even when the gate is already latched", async () => {
    // Latch the gate the ordinary way: a first-dispatch refusal.
    const first = createSendPaymentMocks()
    const firstMutation = first.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    firstMutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await send(first)
    expect(
      idempotencyKeySupported(gate(IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice)),
    ).toBe(false)

    // A retry must not read the latch as licence to go keyless: the key is the
    // one spelling the server can recognise as a repeat. If the fleet finished
    // deploying, the keyed retry succeeds; if not, the refusal surfaces.
    const retry = retryMocks()
    const retryMutation = retry.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    retryMutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    const result = await send(retry)

    expect(keysSent(retryMutation)).toEqual([retry.idempotencyKey])
    expect(result.status).toBe("SUCCESS")
  })
})

// The gate must CONFESS every dispatch that goes out without the key. The
// hook records it on the attempt: once an attempt has gone keyless, a later
// retry has no key the server could replay — re-dispatching could execute a
// second payment — so the hook refuses to auto-retry it. That refusal is only
// possible if neither keyless path here goes unreported.
describe("reporting keyless dispatches", () => {
  it("reports the keyless fallback after a first-dispatch refusal", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValueOnce({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(mocks)

    expect(mocks.onKeylessDispatch).toHaveBeenCalledTimes(1)
  })

  it("reports a latched-gate first dispatch, which goes keyless from the start", async () => {
    const first = createSendPaymentMocks()
    const firstMutation = first.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    firstMutation.mockRejectedValueOnce(new Error(COERCION_REFUSAL)).mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })
    await send(first)

    const latched = createSendPaymentMocks()
    const latchedMutation = latched.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    latchedMutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(latched)

    expect(keysSent(latchedMutation)).toEqual([undefined])
    expect(latched.onKeylessDispatch).toHaveBeenCalledTimes(1)
  })

  it("does not report a keyed dispatch", async () => {
    const mocks = createSendPaymentMocks()
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockResolvedValue({
      data: { lnNoAmountUsdInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    })

    await send(mocks)

    expect(mocks.onKeylessDispatch).not.toHaveBeenCalled()
  })

  it("does not report a retry's refusal — nothing keyless was dispatched", async () => {
    const mocks = { ...createSendPaymentMocks(), attemptIsRetry: true }
    const mutation = mocks.lnNoAmountUsdInvoicePaymentSend as jest.Mock
    mutation.mockRejectedValue(new Error(COERCION_REFUSAL))

    await expect(send(mocks)).rejects.toThrow(/transaction history/i)

    expect(mocks.onKeylessDispatch).not.toHaveBeenCalled()
  })
})

// Every send input the app calls, driven through its real builder. The claim
// this replaced — "four of these are long deployed, so they can pass the field
// unconditionally" — was never measured anywhere in this repo, and being wrong
// about one environment takes out every intraledger and USD lightning send.
describe("all five send inputs are gated", () => {
  const usdWallet = { currency: WalletCurrency.Usd, id: "usd-wallet" } as const
  const btcWallet = { currency: WalletCurrency.Btc, id: "btc-wallet" } as const

  const cases: [
    string,
    keyof ReturnType<typeof createSendPaymentMocks>,
    string,
    () => SendableDetail,
  ][] = [
    [
      IDEMPOTENT_SEND_INPUTS.lnInvoice,
      "lnInvoicePaymentSend",
      "lnInvoicePaymentSend",
      () =>
        createAmountLightningPaymentDetails({
          paymentRequest: PAYMENT_REQUEST,
          paymentRequestAmount: toBtcMoneyAmount(1000),
          convertMoneyAmount: convertMoneyAmountMock,
          sendingWalletDescriptor: usdWallet,
        }),
    ],
    [
      IDEMPOTENT_SEND_INPUTS.lnNoAmountInvoice,
      "lnNoAmountInvoicePaymentSend",
      "lnNoAmountInvoicePaymentSend",
      () =>
        createNoAmountLightningPaymentDetails({
          paymentRequest: PAYMENT_REQUEST,
          unitOfAccountAmount: toBtcMoneyAmount(1000),
          convertMoneyAmount: convertMoneyAmountMock,
          sendingWalletDescriptor: btcWallet,
        }),
    ],
    [
      IDEMPOTENT_SEND_INPUTS.lnNoAmountUsdInvoice,
      "lnNoAmountUsdInvoicePaymentSend",
      "lnNoAmountUsdInvoicePaymentSend",
      usdNoAmountDetail,
    ],
    [
      IDEMPOTENT_SEND_INPUTS.intraLedger,
      "intraLedgerPaymentSend",
      "intraLedgerPaymentSend",
      () =>
        createIntraledgerPaymentDetails({
          handle: "payee",
          recipientWalletId: "recipient-wallet",
          unitOfAccountAmount: toBtcMoneyAmount(1000),
          convertMoneyAmount: convertMoneyAmountMock,
          sendingWalletDescriptor: btcWallet,
        }),
    ],
    [
      IDEMPOTENT_SEND_INPUTS.intraLedgerUsd,
      "intraLedgerUsdPaymentSend",
      "intraLedgerUsdPaymentSend",
      () =>
        createIntraledgerPaymentDetails({
          handle: "payee",
          recipientWalletId: "recipient-wallet",
          unitOfAccountAmount: toUsdMoneyAmount(250),
          convertMoneyAmount: convertMoneyAmountMock,
          sendingWalletDescriptor: usdWallet,
        }),
    ],
  ]

  cases.forEach(([inputType, mockName, payloadKey, build]) => {
    it(`${inputType} carries the key, and survives a server that refuses it`, async () => {
      const mocks = createSendPaymentMocks()
      const mutation = mocks[mockName] as jest.Mock
      mutation
        .mockRejectedValueOnce(new Error(coercionRefusalFor(inputType)))
        .mockResolvedValue({ data: { [payloadKey]: { status: "SUCCESS", errors: [] } } })

      const result = await sendWith(build(), mocks)

      // Keyed first — a server that has the field gets the protection...
      expect(keysSent(mutation)[0]).toBe(mocks.idempotencyKey)
      // ...and a server that does not gets today's un-keyed input rather than
      // a mutation that fails outright.
      expect(keysSent(mutation)[1]).toBeUndefined()
      expect(result.status).toBe("SUCCESS")
    })
  })
})

// The other half of the contract: what the server says when it holds a result
// for this key against DIFFERENT parameters. Pinned to the sentence
// lnflash/flash `src/graphql/error-map.ts` builds for IdempotencyKeyReuseError,
// because the accompanying code is the generic INVALID_INPUT that every
// validation error carries.
describe("recognising the backend's refusal to replay", () => {
  const SERVER_MESSAGE =
    "This idempotency key was already used for a different payment. Use a new key for a new payment."

  it("recognises the sentence the server actually builds", () => {
    expect(isIdempotencyKeyReuseError([{ message: SERVER_MESSAGE }])).toBe(true)
  })

  it("finds it alongside other errors", () => {
    expect(
      isIdempotencyKeyReuseError([
        { message: "Something else went wrong" },
        { message: SERVER_MESSAGE },
      ]),
    ).toBe(true)
  })

  it("does not fire on an ordinary failure", () => {
    // Reading a normal failure as a reuse would lock the user out of a payment
    // that never happened.
    expect(isIdempotencyKeyReuseError([{ message: "Insufficient balance" }])).toBe(false)
    expect(isIdempotencyKeyReuseError([])).toBe(false)
    expect(isIdempotencyKeyReuseError(undefined)).toBe(false)
    expect(isIdempotencyKeyReuseError(null)).toBe(false)
  })
})
