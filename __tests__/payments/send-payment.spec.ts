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

// PaymentStatus.Failed in the Spark SDK's generated enum.
const SPARK_PAYMENT_STATUS_FAILED = 2

const lnurlParams = () =>
  createMock<LnUrlPayServiceResponse>({ min: 1 as Satoshis, max: 100000 as Satoshis })

// The server's own sentence for IdempotencyKeyReuseError.
const KEY_REUSE_ERROR = {
  message:
    "This idempotency key was already used for a different payment. Use a new key for a new payment.",
}

const fakeClient = () => {
  const mutate = jest.fn()
  return { mutate, client: { mutate } as unknown as ApolloClient<unknown> }
}

const mockRail = () => ({
  payInvoice: jest.fn().mockResolvedValue({ success: true }),
  payLnurl: jest.fn().mockResolvedValue({ payment: {}, successAction: undefined }),
  payOnchain: jest.fn().mockResolvedValue({ success: true }),
  probeFee: jest.fn(),
  createInvoice: jest.fn(),
  getOnchainAddress: jest.fn(),
  getBalanceSats: jest.fn(),
  listPayments: jest.fn(),
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
      expect(options).toStrictEqual({
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
      expect(options).toStrictEqual({
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
    it(`onchain: payOnchain(destination, amount, fee) with ${label}`, async () => {
      const ctx = sendBtc(onchain(), selectedFeeType)

      await expect(ctx.outcome).resolves.toEqual({
        status: PaymentSendResult.Success,
        errorsMessage: undefined,
      })
      expect(ctx.rail.payOnchain.mock.calls).toEqual([
        [ADDRESS, testAmount.amount, expectedFee],
      ])
      expectNoGraphql(ctx)
    })
  })

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

  // Pinned, not endorsed. The LNURL/intraledger branch never reads payLnurl's
  // answer, so any answer that resolves is reported as Success. The real
  // payLnurlBreez throws on the failures it can see, but a resolved answer is
  // still not proof of payment. ENG-686 moves this branch unchanged
  // (ENG-684 decision 3). The fix is ENG-694, and it should flip these cases.
  const failedAnswers: [string, unknown][] = [
    ["a { success: false } answer", { success: false, error: "no route" }],
    [
      "a payment whose status is Failed",
      { payment: { status: SPARK_PAYMENT_STATUS_FAILED }, successAction: undefined },
    ],
  ]
  failedAnswers.forEach(([label, railAnswer]) => {
    it(`lnurl and intraledger report Success even for ${label} (preserved; ENG-694)`, async () => {
      for (const detail of [lnurl(), intraledger()]) {
        const ctx = setup()
        ctx.rail.payLnurl.mockResolvedValue(railAnswer)

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

  it("refuses to retry an attempt that went out keyless, without dispatching", async () => {
    const { mutate, deps, state } = setup()
    // First dispatch: this server refuses the key during coercion, so the gate
    // falls back to a keyless send, and that send's response is lost.
    mutate
      .mockRejectedValueOnce(
        new Error(
          'Variable "$input" got invalid value { idempotencyKey: "uuid-1" }; Field "idempotencyKey" is not defined by type "LnInvoicePaymentInput".',
        ),
      )
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
})
