/**
 * ENG-686: the headless send.
 *
 * `sendPayment` is useSendPayment's dispatch moved out of React. These tests
 * drive it directly, with no component and no hooks, the way the assistant
 * will.
 *
 * The variant table is the regression net for the move. Every payment a USD
 * or USDT wallet can make is built with the real payment-details builders and
 * sent against a fake `client.mutate`. The one call that reaches Apollo must
 * carry the right document, the HomeAuthed refetch and the builder's exact
 * variables. The payment-details specs cannot catch a document swapped inside
 * createGraphqlMutationFns: they hand the builders mock triggers by NAME, so
 * a swap passes all of them.
 */

let uuidCounter = 0
jest.mock("uuid", () => ({
  v4: () => {
    uuidCounter += 1
    return `uuid-${uuidCounter}`
  },
}))

import type { ApolloClient, DocumentNode } from "@apollo/client"
// The manual mock, which mirrors the generated enum: see
// __tests__/mocks/breez-sdk-spark-mock-parity.spec.ts.
import { PaymentStatus } from "@breeztech/breez-sdk-spark-react-native"
import { OperationDefinitionNode } from "graphql"
import { LnUrlPayServiceResponse, Satoshis } from "lnurl-pay/dist/types/types"
import { createMock } from "ts-auto-mock"

import {
  HomeAuthedDocument,
  IntraLedgerUsdPaymentSendDocument,
  LnInvoicePaymentSendDocument,
  LnNoAmountUsdInvoicePaymentSendDocument,
  OnChainPaymentSendAllDocument,
  OnChainUsdPaymentSendAsBtcDenominatedDocument,
  OnChainUsdPaymentSendDocument,
  PaymentSendResult,
  WalletCurrency,
} from "@app/graphql/generated"
import { breezBtcRail } from "@app/payments/btc-rail"
import {
  AttemptState,
  GraphqlMutationFns,
  SendPaymentDeps,
  createGraphqlMutationFns,
  sendPayment,
} from "@app/payments/send-payment"
import {
  PaymentDetail,
  SendPaymentMutation,
  SendPaymentMutationParams,
  createAmountLightningPaymentDetails,
  createAmountOnchainPaymentDetails,
  createIntraledgerPaymentDetails,
  createLnurlPaymentDetails,
  createNoAmountLightningPaymentDetails,
  createNoAmountOnchainPaymentDetails,
} from "@app/screens/send-bitcoin-screen/payment-details"
import {
  CHECK_TRANSACTION_HISTORY_MESSAGE,
  resetIdempotencyKeySupport,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { WalletDescriptor } from "@app/types/wallets"
// The shared manual mock (__mocks__/breez-sdk.js), which jest.config.js maps
// @app/utils/breez-sdk to. breezBtcRail calls it.
import { payLightningBreez } from "@app/utils/breez-sdk"
// The real class, by the deep path payLnurlBreez and sendPayment use: Jest maps
// the @app/utils/breez-sdk barrel to a mock that does not export it.
import { LnurlPayOutcomeUnknownError } from "@app/utils/breez-sdk/lnurl-pay-errors"
import {
  btcSendingWalletDescriptor,
  convertMoneyAmountMock,
  testAmount,
  usdSendingWalletDescriptor,
} from "../payment-details/helpers"

const GRAPHQL_URI = "https://api.test.flashapp.me/graphql"
const LN_ADDRESS_HOSTNAME = "flashapp.me"

const INVOICE = "lnbc1invoice"
const LNURL = "bob@example.com"
const ADDRESS = "bc1qdestination"
const HANDLE = "alice"
const RECIPIENT_WALLET_ID = "recipient-wallet-id"
const MEMO = "lunch"

// Typed wide so the generic builders return PaymentDetail<WalletCurrency>,
// which is what sendPayment takes.
const USD: WalletDescriptor<WalletCurrency> = usdSendingWalletDescriptor
const USDT: WalletDescriptor<WalletCurrency> = {
  currency: WalletCurrency.Usdt,
  id: "usdt-wallet",
}
const BTC: WalletDescriptor<WalletCurrency> = btcSendingWalletDescriptor

const lnurlParams = () =>
  createMock<LnUrlPayServiceResponse>({ min: 1 as Satoshis, max: 100000 as Satoshis })

// The server's own sentence for IdempotencyKeyReuseError.
const KEY_REUSE_ERROR = {
  message:
    "This idempotency key was already used for a different payment. Use a new key for a new payment.",
}

// graphql-js refusing the key during input coercion, on a server whose
// LnInvoicePaymentInput predates the field. The gate answers it with a
// keyless fallback.
const KEY_REFUSED_IN_COERCION =
  'Variable "$input" got invalid value { idempotencyKey: "uuid-1" }; Field "idempotencyKey" is not defined by type "LnInvoicePaymentInput".'

const fakeClient = () => {
  const mutate = jest.fn()
  return { mutate, client: { mutate } as unknown as ApolloClient<unknown> }
}

const mockRail = () => ({
  // The rail's two reads (ENG-687). A send never calls them.
  getBalanceSats: jest.fn(),
  listPayments: jest.fn(),
  // payInvoice resolves with payLightningBreez's { success, error, payment },
  // where payment is the SDK's SendPaymentResponse. Only a success: true
  // answer whose payment went out (Completed or Pending) reads as Success
  // (ENG-712).
  payInvoice: jest.fn().mockResolvedValue({
    success: true,
    payment: { payment: { status: PaymentStatus.Completed } },
  }),
  // payLnurl resolves with the SDK's LnurlPayResponse. Only a payment that
  // went out (Completed or Pending) reads as Success (ENG-694).
  payLnurl: jest.fn().mockResolvedValue({
    payment: { status: PaymentStatus.Completed },
    successAction: undefined,
  }),
  payOnchain: jest.fn().mockResolvedValue({ success: true }),
})

const freshState = () => ({
  inFlightRef: { current: false },
  attemptRef: { current: null } as AttemptState["attemptRef"],
  setHasAttemptedSend: jest.fn(),
})

const setup = () => {
  const { mutate, client } = fakeClient()
  const rail = mockRail()
  const deps: SendPaymentDeps = {
    mutations: createGraphqlMutationFns(client),
    btcRail: rail,
    graphqlUri: GRAPHQL_URI,
    lnAddressHostname: LN_ADDRESS_HOSTNAME,
  }
  return { mutate, rail, deps, state: freshState() }
}

const sendable = (detail: PaymentDetail<WalletCurrency>): SendPaymentMutation => {
  if (!detail.canSendPayment) throw new Error(`${detail.paymentType} detail cannot send`)
  return detail.sendPaymentMutation
}

const operationName = (doc: DocumentNode): string | undefined =>
  doc.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === "OperationDefinition",
  )?.name?.value

const answer = (field: string, status: string, errors: unknown[] = []) => ({
  data: { [field]: { status, errors } },
})

// The triggers build their options with Apollo's mergeOptions, whose compact()
// returns null-prototype objects: the options themselves and their
// `variables`. toStrictEqual compares constructors, so both are copied onto
// plain objects before a comparison. The values inside are left as they are.
const plainOptions = ({ variables, ...options }: Record<string, unknown>) =>
  variables === undefined
    ? options
    : { ...options, variables: { ...(variables as Record<string, unknown>) } }

beforeEach(() => {
  jest.clearAllMocks()
  uuidCounter = 0
})

afterEach(() => {
  // The idempotency gate keeps its refusals in module state.
  resetIdempotencyKeySupport()
})

describe("createGraphqlMutationFns", () => {
  const TRIGGERS: (keyof GraphqlMutationFns)[] = [
    "intraLedgerPaymentSend",
    "intraLedgerUsdPaymentSend",
    "lnInvoicePaymentSend",
    "lnNoAmountInvoicePaymentSend",
    "lnNoAmountUsdInvoicePaymentSend",
    "onChainPaymentSend",
    "onChainPaymentSendAll",
    "onChainUsdPaymentSend",
    "onChainUsdPaymentSendAsBtcDenominated",
  ]

  it("returns exactly the nine triggers SendPaymentMutationParams declares", () => {
    const { client } = fakeClient()
    expect(Object.keys(createGraphqlMutationFns(client)).sort()).toEqual(
      [...TRIGGERS].sort(),
    )
  })

  // Covers the three BTC-wallet triggers too, which sendPayment never reaches
  // today (a BTC send goes to the Breez rail).
  TRIGGERS.forEach((trigger) => {
    it(`${trigger} sends the operation it is named after, with the HomeAuthed refetch`, async () => {
      const { mutate, client } = fakeClient()
      const response = answer(trigger, "SUCCESS")
      mutate.mockResolvedValue(response)
      const variables = { input: { walletId: "wallet-id" } }

      const fns = createGraphqlMutationFns(client)
      await expect(fns[trigger]({ variables } as never)).resolves.toBe(response)

      expect(mutate).toHaveBeenCalledTimes(1)
      const [options] = mutate.mock.calls[0]
      expect(operationName(options.mutation)).toBe(trigger)
      expect(plainOptions(options)).toStrictEqual({
        mutation: options.mutation,
        refetchQueries: [HomeAuthedDocument],
        variables,
      })
    })
  })

  it("rejects with client.mutate's own error, as the hook's trigger did", async () => {
    // useMutation rethrew the same error when no onError was set, and the
    // idempotency gate reads that error's message. It must arrive untouched.
    const { mutate, client } = fakeClient()
    const dropped = new Error("Network request failed")
    mutate.mockRejectedValue(dropped)

    await expect(
      createGraphqlMutationFns(client).lnInvoicePaymentSend({
        variables: { input: { walletId: "w", paymentRequest: INVOICE } },
      }),
    ).rejects.toBe(dropped)
  })

  it("lets the call's options override the defaults, in mergeOptions order", async () => {
    const { mutate, client } = fakeClient()
    mutate.mockResolvedValue(answer("onChainPaymentSendAll", "SUCCESS"))

    await createGraphqlMutationFns(client).onChainPaymentSendAll({
      variables: { input: { walletId: "w", address: ADDRESS } },
      refetchQueries: [],
    })

    expect(mutate.mock.calls[0][0].refetchQueries).toEqual([])
  })

  it("keeps the HomeAuthed refetch when a call passes refetchQueries: undefined, as mergeOptions did", async () => {
    // mergeOptions skips undefined values, so the hook's trigger kept its
    // default here. A plain spread would send `refetchQueries: undefined`
    // and leave the home balance stale after the send.
    const { mutate, client } = fakeClient()
    mutate.mockResolvedValue(answer("onChainPaymentSendAll", "SUCCESS"))
    const variables = { input: { walletId: "w", address: ADDRESS } }

    await createGraphqlMutationFns(client).onChainPaymentSendAll({
      variables,
      refetchQueries: undefined,
    })

    expect(plainOptions(mutate.mock.calls[0][0])).toStrictEqual({
      mutation: OnChainPaymentSendAllDocument,
      refetchQueries: [HomeAuthedDocument],
      variables,
    })
  })

  it("sends the document with the HomeAuthed refetch when called with no options", async () => {
    // The hook's trigger defaulted a missing argument to {}; mergeOptions
    // itself would throw reading `variables` off undefined.
    const { mutate, client } = fakeClient()
    mutate.mockResolvedValue(answer("onChainPaymentSendAll", "SUCCESS"))

    await createGraphqlMutationFns(client).onChainPaymentSendAll()

    expect(plainOptions(mutate.mock.calls[0][0])).toStrictEqual({
      mutation: OnChainPaymentSendAllDocument,
      refetchQueries: [HomeAuthedDocument],
    })
  })
})

type WalletName = "USD" | "USDT"

type Variant = {
  name: string
  build: (wallet: WalletDescriptor<WalletCurrency>) => PaymentDetail<WalletCurrency>
  // The mutation's payload field, which is also its operation name.
  field: string
  document: DocumentNode
  // The exact input the builder must send for `walletId`. Every send that
  // takes an idempotency key carries this attempt's key, "uuid-1".
  input: (walletId: string) => Record<string, unknown>
}

const variants: Variant[] = [
  {
    name: "intraledger",
    build: (wallet) =>
      createIntraledgerPaymentDetails({
        handle: HANDLE,
        recipientWalletId: RECIPIENT_WALLET_ID,
        unitOfAccountAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "intraLedgerUsdPaymentSend",
    document: IntraLedgerUsdPaymentSendDocument,
    input: (walletId) => ({
      walletId,
      recipientWalletId: RECIPIENT_WALLET_ID,
      amount: testAmount.amount,
      memo: MEMO,
      idempotencyKey: "uuid-1",
    }),
  },
  {
    name: "lightning invoice with an amount",
    build: (wallet) =>
      createAmountLightningPaymentDetails({
        paymentRequest: INVOICE,
        paymentRequestAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "lnInvoicePaymentSend",
    document: LnInvoicePaymentSendDocument,
    input: (walletId) => ({
      walletId,
      paymentRequest: INVOICE,
      memo: MEMO,
      idempotencyKey: "uuid-1",
    }),
  },
  {
    name: "lightning invoice without an amount",
    build: (wallet) =>
      createNoAmountLightningPaymentDetails({
        paymentRequest: INVOICE,
        unitOfAccountAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "lnNoAmountUsdInvoicePaymentSend",
    document: LnNoAmountUsdInvoicePaymentSendDocument,
    input: (walletId) => ({
      walletId,
      paymentRequest: INVOICE,
      amount: testAmount.amount,
      memo: MEMO,
      idempotencyKey: "uuid-1",
    }),
  },
  {
    name: "lnurl with its invoice minted",
    build: (wallet) =>
      createLnurlPaymentDetails({
        lnurl: LNURL,
        lnurlParams: lnurlParams(),
        paymentRequest: INVOICE,
        paymentRequestAmount: testAmount,
        unitOfAccountAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "lnInvoicePaymentSend",
    document: LnInvoicePaymentSendDocument,
    input: (walletId) => ({
      walletId,
      paymentRequest: INVOICE,
      memo: MEMO,
      idempotencyKey: "uuid-1",
    }),
  },
  {
    name: "onchain, amount entered",
    build: (wallet) =>
      createNoAmountOnchainPaymentDetails({
        address: ADDRESS,
        unitOfAccountAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "onChainUsdPaymentSend",
    document: OnChainUsdPaymentSendDocument,
    input: (walletId) => ({ walletId, address: ADDRESS, amount: testAmount.amount }),
  },
  {
    name: "onchain, send all",
    build: (wallet) =>
      createNoAmountOnchainPaymentDetails({
        address: ADDRESS,
        isSendingMax: true,
        unitOfAccountAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "onChainPaymentSendAll",
    document: OnChainPaymentSendAllDocument,
    input: (walletId) => ({ walletId, address: ADDRESS, memo: MEMO }),
  },
  {
    name: "onchain, amount set by the destination (USD as BTC-denominated)",
    build: (wallet) =>
      createAmountOnchainPaymentDetails({
        address: ADDRESS,
        destinationSpecifiedAmount: testAmount,
        convertMoneyAmount: convertMoneyAmountMock,
        sendingWalletDescriptor: wallet,
        senderSpecifiedMemo: MEMO,
      }),
    field: "onChainUsdPaymentSendAsBtcDenominated",
    document: OnChainUsdPaymentSendAsBtcDenominatedDocument,
    input: (walletId) => ({ walletId, address: ADDRESS, amount: testAmount.amount }),
  },
]

const wallets: [WalletName, WalletDescriptor<WalletCurrency>][] = [
  ["USD", USD],
  ["USDT", USDT],
]

const table = wallets.flatMap(([walletName, wallet]) =>
  variants.map((variant) => ({ walletName, wallet, variant })),
)

describe("sendPayment: every USD and USDT variant reaches Apollo exactly once", () => {
  table.forEach(({ walletName, wallet, variant }) => {
    it(`${walletName} wallet, ${variant.name}`, async () => {
      const { mutate, rail, deps, state } = setup()
      mutate.mockResolvedValue(answer(variant.field, "SUCCESS"))
      const detail = variant.build(wallet)

      const outcome = await sendPayment(
        { sendPaymentMutation: sendable(detail), paymentDetail: detail },
        deps,
        state,
      )

      expect(outcome.status).toBe(PaymentSendResult.Success)
      expect(mutate).toHaveBeenCalledTimes(1)
      const [options] = mutate.mock.calls[0]
      // Identity first: a swapped document is the failure this table exists
      // to catch, and this names it directly.
      expect(operationName(options.mutation)).toBe(variant.field)
      expect(options.mutation).toBe(variant.document)
      expect(plainOptions(options)).toStrictEqual({
        mutation: variant.document,
        refetchQueries: [HomeAuthedDocument],
        variables: { input: variant.input(wallet.id) },
      })
      // A GraphQL send never touches the BTC rail.
      Object.values(rail).forEach((method) => expect(method).not.toHaveBeenCalled())
      // A known outcome finishes the attempt; SUCCESS keeps the button disarmed.
      expect(state.attemptRef.current).toBeNull()
      expect(state.inFlightRef.current).toBe(true)
      expect(state.setHasAttemptedSend.mock.calls).toEqual([[true]])
    })
  })
})

describe("sendPayment: the BTC wallet goes through the BtcRail", () => {
  const lightning = () =>
    createAmountLightningPaymentDetails({
      paymentRequest: INVOICE,
      paymentRequestAmount: testAmount,
      convertMoneyAmount: convertMoneyAmountMock,
      sendingWalletDescriptor: BTC,
    })
  const lnurl = () =>
    createLnurlPaymentDetails({
      lnurl: LNURL,
      lnurlParams: lnurlParams(),
      unitOfAccountAmount: testAmount,
      convertMoneyAmount: convertMoneyAmountMock,
      sendingWalletDescriptor: BTC,
    })
  const intraledger = () =>
    createIntraledgerPaymentDetails({
      handle: HANDLE,
      recipientWalletId: RECIPIENT_WALLET_ID,
      unitOfAccountAmount: testAmount,
      convertMoneyAmount: convertMoneyAmountMock,
      sendingWalletDescriptor: BTC,
    })
  const onchain = () =>
    createNoAmountOnchainPaymentDetails({
      address: ADDRESS,
      unitOfAccountAmount: testAmount,
      convertMoneyAmount: convertMoneyAmountMock,
      sendingWalletDescriptor: BTC,
    })

  // The Breez branch never runs the GraphQL closure; hand it a spy so the
  // tests can say so.
  const sendBtc = (
    detail: PaymentDetail<WalletCurrency>,
    selectedFeeType?: "fast" | "medium" | "slow",
  ) => {
    const ctx = setup()
    const graphqlSend = jest.fn()
    const outcome = sendPayment(
      { sendPaymentMutation: graphqlSend, paymentDetail: detail, selectedFeeType },
      ctx.deps,
      ctx.state,
    )
    return { ...ctx, graphqlSend, outcome }
  }

  const expectNoGraphql = (ctx: { mutate: jest.Mock; graphqlSend: jest.Mock }) => {
    expect(ctx.graphqlSend).not.toHaveBeenCalled()
    expect(ctx.mutate).not.toHaveBeenCalled()
  }

  const expectRearmed = (state: ReturnType<typeof freshState>) => {
    expect(state.inFlightRef.current).toBe(false)
    expect(state.setHasAttemptedSend.mock.calls).toEqual([[true], [false]])
  }

  it("lightning: payInvoice(destination, amount)", async () => {
    const ctx = sendBtc(lightning())

    await expect(ctx.outcome).resolves.toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    expect(ctx.rail.payInvoice.mock.calls).toEqual([[INVOICE, testAmount.amount]])
    expectNoGraphql(ctx)
    // Success keeps the button disarmed.
    expect(ctx.state.inFlightRef.current).toBe(true)
    expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
  })

  it("lightning: a failed payInvoice is a Failure with its error, and re-arms", async () => {
    const ctx = setup()
    ctx.rail.payInvoice.mockResolvedValue({ success: false, error: "no route" })

    const outcome = await sendPayment(
      { sendPaymentMutation: jest.fn(), paymentDetail: lightning() },
      ctx.deps,
      ctx.state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "no route",
    })
    expectRearmed(ctx.state)
  })

  // ENG-712. payLightningBreez waits up to 60 s for the payment to settle, so
  // a payment that fails inside that wait resolves with status Failed. The
  // wrapper answered success: true for it. It now answers success: false
  // (__tests__/utils/spark-pay-lightning.spec.ts), and the branch also reads
  // the payment's status, with the LNURL branch's table, as a second guard.
  // The Failed case pinned the old answer, Success, as a known gap; it is
  // flipped on purpose.
  //
  // Each call of `send` is one tap on the same state, so a case can tap twice.
  const invoiceSender = () => {
    const ctx = setup()
    const graphqlSend = jest.fn()
    const send = () =>
      sendPayment(
        { sendPaymentMutation: graphqlSend, paymentDetail: lightning() },
        ctx.deps,
        ctx.state,
      )
    return { ...ctx, graphqlSend, send }
  }

  // The wrapper's own answer for a Failed payment: success: false with the
  // payment and no error, since the SDK gives no reason. It shows the same
  // copy as a Failed status behind success: true below.
  it("lightning: a success: false answer whose payment is Failed is a Failure with the screen's copy, and re-arms", async () => {
    const ctx = invoiceSender()
    ctx.rail.payInvoice.mockResolvedValue({
      success: false,
      payment: { payment: { status: PaymentStatus.Failed } },
    })

    await expect(ctx.send()).resolves.toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "Something went wrong",
    })
    expectRearmed(ctx.state)
    // A Breez send holds no GraphQL attempt, so the retry is a new send.
    expect(ctx.state.attemptRef.current).toBeNull()
    // Re-armed: the next tap sends again.
    await ctx.send()
    expect(ctx.rail.payInvoice.mock.calls).toEqual([
      [INVOICE, testAmount.amount],
      [INVOICE, testAmount.amount],
    ])
    expectNoGraphql(ctx)
  })

  const sentInvoicePayments: [string, PaymentStatus][] = [
    ["Completed", PaymentStatus.Completed],
    // Still in flight when the wait ended. Reporting it as a Failure would
    // re-arm the button while the money is on its way, and the next tap
    // would pay again.
    ["Pending", PaymentStatus.Pending],
  ]
  sentInvoicePayments.forEach(([label, status]) => {
    it(`lightning: a success: true answer whose payment is ${label} is a Success, and stays disarmed`, async () => {
      const ctx = invoiceSender()
      ctx.rail.payInvoice.mockResolvedValue({
        success: true,
        payment: { payment: { status } },
      })

      await expect(ctx.send()).resolves.toEqual({
        status: PaymentSendResult.Success,
        errorsMessage: undefined,
      })
      expect(ctx.state.inFlightRef.current).toBe(true)
      expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
      // Disarmed: the next tap sends nothing.
      await expect(ctx.send()).resolves.toEqual({
        status: undefined,
        errorsMessage: undefined,
        ignored: true,
      })
      expect(ctx.rail.payInvoice.mock.calls).toEqual([[INVOICE, testAmount.amount]])
      expectNoGraphql(ctx)
    })
  })

  const unsentInvoiceAnswers: [string, unknown][] = [
    [
      "a payment whose status is Failed",
      { success: true, payment: { payment: { status: PaymentStatus.Failed } } },
    ],
    // The SDK always sets a status, so an answer without one did not come
    // from it and proves nothing. Read as in the LNURL branch.
    ["a payment with no status", { success: true, payment: { payment: {} } }],
    ["a SendPaymentResponse with no payment", { success: true, payment: {} }],
    // The shared mock's answer before ENG-712.
    ["no payment at all", { success: true, error: undefined }],
  ]
  unsentInvoiceAnswers.forEach(([label, railAnswer]) => {
    it(`lightning: a success: true answer with ${label} is a Failure with the screen's copy, and re-arms`, async () => {
      const ctx = invoiceSender()
      ctx.rail.payInvoice.mockResolvedValue(railAnswer)

      await expect(ctx.send()).resolves.toEqual({
        status: PaymentSendResult.Failure,
        errorsMessage: "Something went wrong",
      })
      expectRearmed(ctx.state)
      // A Breez send holds no GraphQL attempt, so the retry is a new send.
      expect(ctx.state.attemptRef.current).toBeNull()
      // Re-armed: the next tap sends again.
      await ctx.send()
      expect(ctx.rail.payInvoice.mock.calls).toEqual([
        [INVOICE, testAmount.amount],
        [INVOICE, testAmount.amount],
      ])
      expectNoGraphql(ctx)
    })
  })

  // The shared @app/utils/breez-sdk mock gives payLightningBreez a Completed
  // payment by default, so a test that sends a BTC invoice through the real
  // rail still reads a Success now that the branch reads the status.
  it("lightning through breezBtcRail: the shared mock's default answer is a Success", async () => {
    const ctx = setup()

    const outcome = await sendPayment(
      { sendPaymentMutation: jest.fn(), paymentDetail: lightning() },
      { ...ctx.deps, btcRail: breezBtcRail },
      ctx.state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    expect(payLightningBreez).toHaveBeenCalledTimes(1)
    expect(payLightningBreez).toHaveBeenCalledWith(INVOICE, testAmount.amount)
    expect(ctx.rail.payInvoice).not.toHaveBeenCalled()
    expect(ctx.state.inFlightRef.current).toBe(true)
    expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
  })

  it('lnurl: payLnurl(destination, amount, "")', async () => {
    const ctx = sendBtc(lnurl())

    await expect(ctx.outcome).resolves.toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    expect(ctx.rail.payLnurl.mock.calls).toEqual([[LNURL, testAmount.amount, ""]])
    expectNoGraphql(ctx)
  })

  it('intraledger: payLnurl(handle@lnAddressHostname, amount, "")', async () => {
    const ctx = sendBtc(intraledger())

    await expect(ctx.outcome).resolves.toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    expect(ctx.rail.payLnurl.mock.calls).toEqual([
      [`${HANDLE}@${LN_ADDRESS_HOSTNAME}`, testAmount.amount, ""],
    ])
    expectNoGraphql(ctx)
  })

  const feeCases: [string, "slow" | undefined, string][] = [
    ["the selected fee", "slow", "slow"],
    ['"fast" when none is selected', undefined, "fast"],
  ]
  feeCases.forEach(([label, selectedFeeType, expectedFee]) => {
    // The fourth argument is the attempt's key (ENG-714): the uuid mock's
    // first value, minted for this send.
    it(`onchain: payOnchain(destination, amount, fee, key) with ${label}`, async () => {
      const ctx = sendBtc(onchain(), selectedFeeType)

      await expect(ctx.outcome).resolves.toEqual({
        status: PaymentSendResult.Success,
        errorsMessage: undefined,
      })
      expect(ctx.rail.payOnchain.mock.calls).toEqual([
        [ADDRESS, testAmount.amount, expectedFee, "uuid-1"],
      ])
      expectNoGraphql(ctx)
    })
  })

  // A refusal before sdk.sendPayment dispatched: payOnchainBreez answers it
  // without outcomeUnknown, and nothing left the wallet, so re-arming is
  // right. The attempt ends with it, so the next tap mints a new key.
  it("onchain: a failed payOnchain is a Failure with its error, and re-arms", async () => {
    const ctx = setup()
    ctx.rail.payOnchain.mockResolvedValue({ success: false, error: "insufficient funds" })

    const outcome = await sendPayment(
      { sendPaymentMutation: jest.fn(), paymentDetail: onchain() },
      ctx.deps,
      ctx.state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "insufficient funds",
    })
    expectRearmed(ctx.state)
    expect(ctx.state.attemptRef.current).toBeNull()
  })

  // ENG-714. payOnchainBreez answers a rejection from sdk.sendPayment itself
  // with outcomeUnknown: in spark-sdk 0.22.3 the cooperative exit can already
  // be out by then (a lost complete_coop_exit answer). The old branch re-armed
  // on it, and the next tap withdrew a second time. Each call of `send` is
  // one tap on the same state, so a case can tap twice.
  const onchainSender = () => {
    const ctx = setup()
    const graphqlSend = jest.fn()
    const send = () =>
      sendPayment(
        { sendPaymentMutation: graphqlSend, paymentDetail: onchain() },
        ctx.deps,
        ctx.state,
      )
    return { ...ctx, graphqlSend, send }
  }

  // payOnchainBreez's answer for a rejection after the dispatch. `error` is
  // the SDK's own message, which the screen must never show.
  const unknownOutcome = () => ({
    success: false,
    error: "SdkError.SparkError",
    outcomeUnknown: true,
  })

  it("onchain: a rejection after dispatch (outcomeUnknown) sends the user to their history and stays disarmed (ENG-714)", async () => {
    const ctx = onchainSender()
    ctx.rail.payOnchain.mockResolvedValueOnce(unknownOutcome())

    await expect(ctx.send()).resolves.toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
    })
    // Not re-armed: the inverse of expectRearmed.
    expect(ctx.state.inFlightRef.current).toBe(true)
    expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
    // The attempt is kept, holding the key the withdrawal carried.
    expect(ctx.rail.payOnchain.mock.calls).toEqual([
      [ADDRESS, testAmount.amount, "fast", "uuid-1"],
    ])
    expect(ctx.state.attemptRef.current).toEqual({
      key: "uuid-1",
      dispatched: true,
      wentKeyless: false,
    })
    expectNoGraphql(ctx)
  })

  it("onchain: after an unknown outcome, a second call is ignored and dispatches nothing (ENG-714)", async () => {
    const ctx = onchainSender()
    ctx.rail.payOnchain.mockResolvedValueOnce(unknownOutcome())
    await ctx.send()

    // The re-tap that used to be a second withdrawal.
    await expect(ctx.send()).resolves.toEqual({
      status: undefined,
      errorsMessage: undefined,
      ignored: true,
    })
    expect(ctx.rail.payOnchain).toHaveBeenCalledTimes(1)
    expect(ctx.state.inFlightRef.current).toBe(true)
    expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
    expect(ctx.state.attemptRef.current).toMatchObject({ key: "uuid-1" })
  })

  // ENG-714. payOnchainBreez answers every refusal before sdk.sendPayment
  // instead of rejecting, so a rejection from the rail itself comes from past
  // the dispatch or from a broken rail, and cannot prove that nothing left the
  // wallet. The shared catch used to re-arm Confirm on it while the attempt
  // still held its key, and the re-tap sent that key again: a keyed retry that
  // nothing may rely on until ENG-715. It is answered as outcomeUnknown is.
  const railFailures: [string, (rail: ReturnType<typeof mockRail>) => void][] = [
    [
      "rejects",
      (rail) =>
        rail.payOnchain.mockRejectedValueOnce(
          new Error("complete_coop_exit: connection reset"),
        ),
    ],
    [
      // A broken delegate, before any promise exists.
      "throws",
      (rail) =>
        rail.payOnchain.mockImplementationOnce(() => {
          throw new TypeError("payOnchainBreez is not a function")
        }),
    ],
  ]
  railFailures.forEach(([label, fail]) => {
    it(`onchain: a payOnchain that ${label} sends the user to their history, stays disarmed and keeps the attempt (ENG-714)`, async () => {
      const ctx = onchainSender()
      fail(ctx.rail)

      await expect(ctx.send()).resolves.toEqual({
        status: PaymentSendResult.Failure,
        errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
      })
      // Not re-armed: the inverse of expectRearmed.
      expect(ctx.state.inFlightRef.current).toBe(true)
      expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
      // The attempt is kept, holding the key the withdrawal carried.
      expect(ctx.state.attemptRef.current).toEqual({
        key: "uuid-1",
        dispatched: true,
        wentKeyless: false,
      })

      // The re-tap that used to send the same key a second time.
      await expect(ctx.send()).resolves.toEqual({
        status: undefined,
        errorsMessage: undefined,
        ignored: true,
      })
      expect(ctx.rail.payOnchain.mock.calls).toEqual([
        [ADDRESS, testAmount.amount, "fast", "uuid-1"],
      ])
      expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
      expectNoGraphql(ctx)
    })
  })

  it("onchain: a retained attempt reuses its key", async () => {
    // An attempt kept from an earlier on-chain call, with the button armed:
    // the state a keyed retry (ENG-715) would start from. Whether the SDK
    // then replays the withdrawal is that ticket's to prove.
    const ctx = onchainSender()
    ctx.state.attemptRef.current = {
      key: "kept-key",
      dispatched: true,
      wentKeyless: false,
    }

    await expect(ctx.send()).resolves.toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    expect(ctx.rail.payOnchain.mock.calls).toEqual([
      [ADDRESS, testAmount.amount, "fast", "kept-key"],
    ])
    // No key was minted, and the known outcome ends the attempt.
    expect(uuidCounter).toBe(0)
    expect(ctx.state.attemptRef.current).toBeNull()
  })

  it("onchain: two separate attempt states mint different keys", async () => {
    const first = onchainSender()
    const second = onchainSender()

    await first.send()
    await second.send()

    expect(first.rail.payOnchain.mock.calls).toEqual([
      [ADDRESS, testAmount.amount, "fast", "uuid-1"],
    ])
    expect(second.rail.payOnchain.mock.calls).toEqual([
      [ADDRESS, testAmount.amount, "fast", "uuid-2"],
    ])
  })

  it("onchain: success clears the attempt and stays disarmed", async () => {
    const ctx = onchainSender()
    ctx.rail.payOnchain.mockResolvedValueOnce({
      success: true,
      payment: { payment: { status: PaymentStatus.Pending } },
    })

    await expect(ctx.send()).resolves.toEqual({
      status: PaymentSendResult.Success,
      errorsMessage: undefined,
    })
    // The withdrawal carried this attempt's key, and the attempt is over.
    expect(ctx.rail.payOnchain.mock.calls).toEqual([
      [ADDRESS, testAmount.amount, "fast", "uuid-1"],
    ])
    expect(ctx.state.attemptRef.current).toBeNull()
    expect(ctx.state.inFlightRef.current).toBe(true)
    expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])

    // A second tap is ignored: the withdrawal is not sent twice.
    await expect(ctx.send()).resolves.toEqual({
      status: undefined,
      errorsMessage: undefined,
      ignored: true,
    })
    expect(ctx.rail.payOnchain).toHaveBeenCalledTimes(1)
  })

  it('an unknown payment type is "Wrong invoice type" and touches no rail', async () => {
    const unknown = {
      ...lightning(),
      paymentType: "bolt12",
    } as unknown as PaymentDetail<WalletCurrency>
    const ctx = sendBtc(unknown)

    await expect(ctx.outcome).resolves.toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "Wrong invoice type",
    })
    Object.values(ctx.rail).forEach((method) => expect(method).not.toHaveBeenCalled())
    expectNoGraphql(ctx)
    expectRearmed(ctx.state)
  })

  it("a rail that throws is a Failure with the thrown message, and re-arms", async () => {
    const ctx = setup()
    ctx.rail.payInvoice.mockRejectedValue(new Error("Breez SDK not initialized"))

    const outcome = await sendPayment(
      { sendPaymentMutation: jest.fn(), paymentDetail: lightning() },
      ctx.deps,
      ctx.state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "Breez SDK not initialized",
    })
    expectRearmed(ctx.state)
  })

  // ENG-694. The first two cases here pinned the always-Success answer that
  // ENG-686 moved over unchanged; they are flipped on purpose. payLnurl either
  // resolves with the SDK's LnurlPayResponse, whose payment status can be
  // Failed, or rejects. Only a Completed or Pending payment is a Success. Any
  // other answer it resolves with is a Failure with the screen's own copy, and
  // re-arms the button like every other Breez Failure.
  const failedAnswers: [string, unknown][] = [
    // The other two sends' answer, never payLnurl's, so its `error` is not read.
    ["a { success: false } answer", { success: false, error: "no route" }],
    [
      "a payment whose status is Failed",
      { payment: { status: PaymentStatus.Failed }, successAction: undefined },
    ],
    // The SDK always sets a status, so an answer without one did not come
    // from it and proves nothing.
    ["a payment with no status", { payment: {}, successAction: undefined }],
    ["no answer at all", undefined],
  ]
  failedAnswers.forEach(([label, railAnswer]) => {
    it(`lnurl and intraledger report Failure for ${label}, and re-arm`, async () => {
      for (const detail of [lnurl(), intraledger()]) {
        const ctx = setup()
        ctx.rail.payLnurl.mockResolvedValue(railAnswer)

        const outcome = await sendPayment(
          { sendPaymentMutation: jest.fn(), paymentDetail: detail },
          ctx.deps,
          ctx.state,
        )

        expect(outcome).toEqual({
          status: PaymentSendResult.Failure,
          errorsMessage: "Something went wrong",
        })
        expectRearmed(ctx.state)
        // A Breez send holds no GraphQL attempt, so the retry is a new send.
        expect(ctx.state.attemptRef.current).toBeNull()
      }
    })
  })

  // A rejection before sdk.lnurlPay dispatches, like the one here, proves that
  // nothing was sent, so re-arming is right. payLnurlBreez lets every such
  // rejection through as it is, and its own refusal, here, is a plain Error.
  // One from lnurlPay itself proves nothing (it can come after the send left):
  // payLnurlBreez rethrows it as LnurlPayOutcomeUnknownError, which stays
  // disarmed (ENG-711, the next case).
  it("lnurl and intraledger: a payLnurl that rejects is a Failure with the thrown message, and re-arms", async () => {
    for (const detail of [lnurl(), intraledger()]) {
      const ctx = setup()
      // payLnurlBreez's own refusal of an input that is not LNURL-pay.
      ctx.rail.payLnurl.mockRejectedValue(new Error("Unsupported input type"))

      const outcome = await sendPayment(
        { sendPaymentMutation: jest.fn(), paymentDetail: detail },
        ctx.deps,
        ctx.state,
      )

      expect(outcome).toEqual({
        status: PaymentSendResult.Failure,
        errorsMessage: "Unsupported input type",
      })
      expectRearmed(ctx.state)
    }
  })

  // ENG-711. This case pinned the known double pay, and is flipped on
  // purpose. A dropped connection after the leaves went to the SSP rejects
  // lnurlPay with an SdkError.SparkError, whose message the React Native
  // binding builds from the type and variant only, and payLnurlBreez rethrows
  // it as LnurlPayOutcomeUnknownError. The payment may have left, and the old
  // re-arm let the next tap prepare and pay a fresh invoice. Now the button
  // stays disarmed and the user is sent to their history, as the GraphQL
  // branch does for an outcome it cannot prove: the next call is ignored, and
  // payLnurl runs once.
  it("lnurl and intraledger: a rejection from lnurlPay itself sends the user to their history and stays disarmed (ENG-711)", async () => {
    for (const detail of [lnurl(), intraledger()]) {
      const ctx = setup()
      ctx.rail.payLnurl.mockRejectedValueOnce(
        new LnurlPayOutcomeUnknownError(new Error("SdkError.SparkError")),
      )
      const graphqlSend = jest.fn()
      const send = () =>
        sendPayment(
          { sendPaymentMutation: graphqlSend, paymentDetail: detail },
          ctx.deps,
          ctx.state,
        )

      await expect(send()).resolves.toEqual({
        status: PaymentSendResult.Failure,
        errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
      })
      // Not re-armed: the inverse of expectRearmed.
      expect(ctx.state.inFlightRef.current).toBe(true)
      expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])

      // A second tap is ignored and pays nothing.
      await expect(send()).resolves.toEqual({
        status: undefined,
        errorsMessage: undefined,
        ignored: true,
      })
      expect(ctx.rail.payLnurl).toHaveBeenCalledTimes(1)
      expect(ctx.state.inFlightRef.current).toBe(true)
      expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
      // A Breez send holds no GraphQL attempt, and none was started.
      expect(ctx.state.attemptRef.current).toBeNull()
      expectNoGraphql({ mutate: ctx.mutate, graphqlSend })
    }
  })

  // Pending is the usual answer: the SDK's LNURL pay does not wait for the
  // payment to settle. Reporting it as a Failure would re-arm the button
  // while the money is on its way, and the next tap would pay again.
  const sentStatuses: [string, PaymentStatus][] = [
    ["Completed", PaymentStatus.Completed],
    ["Pending", PaymentStatus.Pending],
  ]
  sentStatuses.forEach(([label, status]) => {
    it(`lnurl and intraledger report Success for a ${label} payment, and stay disarmed`, async () => {
      for (const detail of [lnurl(), intraledger()]) {
        const ctx = setup()
        ctx.rail.payLnurl.mockResolvedValue({
          payment: { status },
          successAction: undefined,
        })

        const outcome = await sendPayment(
          { sendPaymentMutation: jest.fn(), paymentDetail: detail },
          ctx.deps,
          ctx.state,
        )

        expect(outcome).toEqual({
          status: PaymentSendResult.Success,
          errorsMessage: undefined,
        })
        expect(ctx.state.inFlightRef.current).toBe(true)
        expect(ctx.state.setHasAttemptedSend.mock.calls).toEqual([[true]])
      }
    })
  })
})

describe("sendPayment: the ENG-533 attempt lifecycle", () => {
  const usdInvoice = () =>
    createAmountLightningPaymentDetails({
      paymentRequest: INVOICE,
      paymentRequestAmount: testAmount,
      convertMoneyAmount: convertMoneyAmountMock,
      sendingWalletDescriptor: USD,
    })

  it("ignores a call while one is in flight, and dispatches nothing", async () => {
    const { mutate, deps, state } = setup()
    state.inFlightRef.current = true
    const run = jest.fn()

    const outcome = await sendPayment({ sendPaymentMutation: run }, deps, state)

    expect(outcome).toEqual({
      status: undefined,
      errorsMessage: undefined,
      ignored: true,
    })
    expect(run).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(state.setHasAttemptedSend).not.toHaveBeenCalled()
  })

  it("an IdempotencyKeyReuseError FAILURE sends the user to their history and stays disarmed", async () => {
    const { mutate, deps, state } = setup()
    mutate.mockResolvedValue(answer("lnInvoicePaymentSend", "FAILURE", [KEY_REUSE_ERROR]))
    const detail = usdInvoice()

    const outcome = await sendPayment(
      { sendPaymentMutation: sendable(detail), paymentDetail: detail },
      deps,
      state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
    })
    // The server holds an outcome for this key: no re-arm, so no fresh-key tap.
    expect(state.inFlightRef.current).toBe(true)
    expect(state.setHasAttemptedSend).not.toHaveBeenCalledWith(false)
  })

  it("an ordinary FAILURE finishes the attempt and re-arms the button", async () => {
    const { mutate, deps, state } = setup()
    mutate.mockResolvedValue(
      answer("lnInvoicePaymentSend", "FAILURE", [{ message: "Insufficient balance" }]),
    )
    const detail = usdInvoice()

    const outcome = await sendPayment(
      { sendPaymentMutation: sendable(detail), paymentDetail: detail },
      deps,
      state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: "Insufficient balance",
    })
    expect(state.attemptRef.current).toBeNull()
    expect(state.inFlightRef.current).toBe(false)
    expect(state.setHasAttemptedSend.mock.calls).toEqual([[true], [false]])
  })

  it("a throw keeps the attempt: the retry re-runs the SAME closure with the SAME key, as a retry", async () => {
    const { mutate, deps, state } = setup()
    const dropped = new Error("Network request failed")
    mutate
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce(answer("lnInvoicePaymentSend", "SUCCESS"))
    const detail = usdInvoice()
    const run = jest.fn(sendable(detail))

    await expect(
      sendPayment({ sendPaymentMutation: run, paymentDetail: detail }, deps, state),
    ).rejects.toBe(dropped)

    // Outcome unknown: the attempt is retained and the button re-armed.
    expect(state.attemptRef.current).toMatchObject({ key: "uuid-1", dispatched: true })
    expect(state.inFlightRef.current).toBe(false)
    expect(state.setHasAttemptedSend.mock.calls).toEqual([[true], [false]])

    // The retry arrives with a different closure (the screen re-rendered);
    // the frozen attempt ignores it.
    const reRendered = jest.fn()
    const outcome = await sendPayment(
      { sendPaymentMutation: reRendered, paymentDetail: detail },
      deps,
      state,
    )

    expect(outcome.status).toBe(PaymentSendResult.Success)
    expect(reRendered).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls.map(([params]) => params.idempotencyKey)).toEqual([
      "uuid-1",
      "uuid-1",
    ])
    expect(run.mock.calls.map(([params]) => params.attemptIsRetry)).toEqual([false, true])
    expect(run.mock.calls.map(([params]) => params.apiEndpoint)).toEqual([
      GRAPHQL_URI,
      GRAPHQL_URI,
    ])
    // Both dispatches carried the key on the wire.
    expect(
      mutate.mock.calls.map(([options]) => options.variables.input.idempotencyKey),
    ).toEqual(["uuid-1", "uuid-1"])
    expect(state.attemptRef.current).toBeNull()
  })

  // ENG-714: an attempt with no closure is a Breez on-chain one, kept because
  // its withdrawal may have left. The GraphQL branch has nothing to replay it
  // with, so it answers as for a keyless retry: disarmed, history message,
  // nothing dispatched, and no throw.
  it("a retained attempt with no closure stays disarmed with the history message, and calls neither the closure nor Apollo", async () => {
    const { mutate, deps, state } = setup()
    const breezAttempt = { key: "breez-key", dispatched: true, wentKeyless: false }
    state.attemptRef.current = breezAttempt
    const run = jest.fn()
    const detail = usdInvoice()

    const outcome = await sendPayment(
      { sendPaymentMutation: run, paymentDetail: detail },
      deps,
      state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
    })
    expect(run).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(state.inFlightRef.current).toBe(true)
    expect(state.setHasAttemptedSend.mock.calls).toEqual([[true]])
    // The attempt is left exactly as it was.
    expect(state.attemptRef.current).toBe(breezAttempt)
    expect(breezAttempt).toEqual({
      key: "breez-key",
      dispatched: true,
      wentKeyless: false,
    })
  })

  it("refuses to retry an attempt that went out keyless, without dispatching", async () => {
    const { mutate, deps, state } = setup()
    // First dispatch: this server refuses the key during coercion, so the gate
    // falls back to a keyless send, and that send's response is lost.
    mutate
      .mockRejectedValueOnce(new Error(KEY_REFUSED_IN_COERCION))
      .mockRejectedValueOnce(new Error("Network request failed"))
    const detail = usdInvoice()

    await expect(
      sendPayment(
        { sendPaymentMutation: sendable(detail), paymentDetail: detail },
        deps,
        state,
      ),
    ).rejects.toThrow("Network request failed")
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[1][0].variables.input.idempotencyKey).toBeUndefined()
    expect(state.attemptRef.current).toMatchObject({ wentKeyless: true })

    // The server never saw this attempt's key, so a retry has nothing to
    // replay. It must not dispatch at all.
    const outcome = await sendPayment(
      { sendPaymentMutation: sendable(detail), paymentDetail: detail },
      deps,
      state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
    })
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(state.inFlightRef.current).toBe(true)
    expect(state.setHasAttemptedSend.mock.calls).toEqual([[true], [false], [true]])
  })

  // `GraphqlMutationFns` is a structural Pick, so a whole
  // `SendPaymentMutationParams` held in a variable type-checks as `mutations`
  // (createSendPaymentMocks() returns one). Its four attempt fields belong to
  // no attempt of sendPayment's, and they must never reach the closure in
  // place of the attempt's own. A stale `attemptIsRetry: false` reopens the
  // gate's keyless fallback on a retry, and a stale recorder hides a keyless
  // dispatch from the retry refusal. Either way a retry can pay twice
  // (ENG-533).
  const STALE_ENDPOINT = "https://stale.example.com/graphql"
  const withStaleAttemptFields = (
    deps: SendPaymentDeps,
    onKeylessDispatch: () => void,
  ): SendPaymentDeps => {
    const mutations: SendPaymentMutationParams = {
      ...deps.mutations,
      idempotencyKey: "stale",
      attemptIsRetry: false,
      onKeylessDispatch,
      apiEndpoint: STALE_ENDPOINT,
    }
    return { ...deps, mutations }
  }

  it("the attempt's own key, retry flag and endpoint reach the closure even when `mutations` carries stale ones", async () => {
    const { mutate, deps, state } = setup()
    const staleRecorder = jest.fn()
    const dropped = new Error("Network request failed")
    mutate
      .mockRejectedValueOnce(dropped)
      .mockResolvedValueOnce(answer("lnInvoicePaymentSend", "SUCCESS"))
    const detail = usdInvoice()
    const run = jest.fn(sendable(detail))
    const staleDeps = withStaleAttemptFields(deps, staleRecorder)

    await expect(
      sendPayment({ sendPaymentMutation: run, paymentDetail: detail }, staleDeps, state),
    ).rejects.toBe(dropped)
    const outcome = await sendPayment(
      { sendPaymentMutation: run, paymentDetail: detail },
      staleDeps,
      state,
    )

    expect(outcome.status).toBe(PaymentSendResult.Success)
    const params = run.mock.calls.map(([sent]) => sent)
    expect(params.map((sent) => sent.idempotencyKey)).toEqual(["uuid-1", "uuid-1"])
    expect(params.map((sent) => sent.attemptIsRetry)).toEqual([false, true])
    expect(params.map((sent) => sent.apiEndpoint)).toEqual([GRAPHQL_URI, GRAPHQL_URI])
    params.forEach((sent) => expect(sent.onKeylessDispatch).not.toBe(staleRecorder))
    // The attempt's key is the one on the wire, both times.
    expect(
      mutate.mock.calls.map(([options]) => options.variables.input.idempotencyKey),
    ).toEqual(["uuid-1", "uuid-1"])
  })

  it("a keyless dispatch marks the attempt even when `mutations` carries its own onKeylessDispatch", async () => {
    const { mutate, deps, state } = setup()
    const staleRecorder = jest.fn()
    // As in "refuses to retry an attempt that went out keyless": the gate
    // falls back to a keyless send, and that send's response is lost.
    mutate
      .mockRejectedValueOnce(new Error(KEY_REFUSED_IN_COERCION))
      .mockRejectedValueOnce(new Error("Network request failed"))
    const detail = usdInvoice()
    const staleDeps = withStaleAttemptFields(deps, staleRecorder)

    await expect(
      sendPayment(
        { sendPaymentMutation: sendable(detail), paymentDetail: detail },
        staleDeps,
        state,
      ),
    ).rejects.toThrow("Network request failed")
    expect(mutate.mock.calls[1][0].variables.input.idempotencyKey).toBeUndefined()
    expect(staleRecorder).not.toHaveBeenCalled()
    expect(state.attemptRef.current).toMatchObject({ wentKeyless: true })

    // So the retry is refused, and nothing goes out a third time.
    const outcome = await sendPayment(
      { sendPaymentMutation: sendable(detail), paymentDetail: detail },
      staleDeps,
      state,
    )

    expect(outcome).toEqual({
      status: PaymentSendResult.Failure,
      errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
    })
    expect(mutate).toHaveBeenCalledTimes(2)
  })
})
