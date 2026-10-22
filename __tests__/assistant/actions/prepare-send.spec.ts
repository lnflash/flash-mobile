jest.mock("@app/screens/send-bitcoin-screen/payment-destination", () => ({
  ...jest.requireActual("@app/screens/send-bitcoin-screen/payment-destination"),
  // The parser reaches LNURL services over the network; each case says what
  // it answers.
  parseDestination: jest.fn(),
}))
// The cases that run the real parser on an LNURL say what its service answers.
jest.mock("js-lnurl", () => ({
  ...jest.requireActual("js-lnurl"),
  getParams: jest.fn(),
}))
jest.mock("lnurl-pay", () => ({
  ...jest.requireActual("lnurl-pay"),
  requestPayServiceParams: jest.fn(),
}))

import { getParams } from "js-lnurl"
import { requestPayServiceParams } from "lnurl-pay"

import { createAttemptJournal } from "@app/assistant/engine/attempt-journal"
import { createExecutor } from "@app/assistant/engine/executor"
import {
  createTransactionListReconciler,
  RECONCILE_MIN_AGE_MS,
} from "@app/assistant/engine/reconcile"
import { runTool } from "@app/assistant/engine/run-tool"
import { assistantRegistry } from "@app/assistant/registry"
import {
  prepareSendRun,
  PrepareSendArgs,
} from "@app/assistant/registry/actions/prepare-send"
import {
  FEE_PROBE_TTL_MS,
  FIXED_CENT_INTRALEDGER_TTL_MS,
  RATE_TTL_MS,
} from "@app/assistant/registry/actions/shared/expiry"
import { BTC_ONCHAIN_FEE_SPEED } from "@app/assistant/registry/actions/shared/fee"
import {
  UNRECORDED_INVOICE_SEND,
  UNRECORDED_ONCHAIN_SEND,
} from "@app/assistant/registry/actions/shared/journal"
import type {
  ExecuteContext,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import { LnurlPayOutcomeUnknownError } from "@app/utils/breez-sdk/lnurl-pay-errors"
import {
  createLightningDestination,
  createOnchainDestination,
  parseDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination"
import { createLnurlPaymentDestination } from "@app/screens/send-bitcoin-screen/payment-destination/lnurl"
import { resetIdempotencyKeySupport } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { memoryStorage } from "../executor-harness"
import {
  accountsOf,
  bolt11,
  failingAccountLookup,
  fakeActionCtx,
  fundedBefore,
  graphqlTx,
  JMD_PRICE,
  NOW_MS,
  page,
  paymentHashOf,
  recordingTelemetry,
  USD_PRICE,
  wallet,
} from "../fakes"

const parse = parseDestination as jest.Mock

const BTC_ROW = wallet({
  __typename: "BTCWallet",
  id: "my-btc",
  walletCurrency: "BTC",
  balance: null as never,
  isExternal: true,
})

const contact = (username: string, alias: string | null = null) => ({
  __typename: "UserContact",
  id: username,
  username,
  alias,
  transactionsCount: 0,
})

/** A Flash user the user has not added (ENG-730). */
const NOT_A_CONTACT = "dreadmax"

/** $100 in the cash wallet, 1,000,000 sats in the BTC wallet, no limits reached. */
const setup = ({
  display = "USD",
  cents = 10_000,
  sats = 1_000_000,
}: { display?: "USD" | "JMD"; cents?: number; sats?: number } = {}) => {
  const fake = fakeActionCtx({ displayCurrency: display })
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: cents }),
    BTC_ROW,
  ])
  fake.graphql.realtimePrice.mockResolvedValue(display === "USD" ? USD_PRICE : JMD_PRICE)
  fake.graphql.contacts.mockResolvedValue([
    contact("alice", "Alice"),
    contact("jane", "mom"),
  ])
  // Every contact a case names has an account, and so does dreadmax, who is
  // no contact; any other word is no one's username.
  fake.graphql.accountDefaultWallet.mockImplementation(
    accountsOf(["alice", "jane", "alina", NOT_A_CONTACT]),
  )
  fake.btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats })
  return fake
}

const prepared = (result: ToolResult<unknown>): PreparedAction => {
  if (result.kind !== "prepared")
    throw new Error(`not prepared: ${JSON.stringify(result)}`)
  return result.preparedAction
}

/** What the executor hands execute(): the action's own AttemptState and a journal hook. */
const confirmCtx = (action: PreparedAction) => {
  const journalDispatch = jest.fn(async (_key: string | null): Promise<void> => undefined)
  const ctx: ExecuteContext = { attempt: action.attempt, journalDispatch }
  return { ctx, journalDispatch }
}

const sentOk = (mutation: string) => ({
  data: { [mutation]: { status: PaymentSendResult.Success, errors: [] } },
})

const LNURL_PARAMS = {
  min: 1,
  max: 1_000_000,
  identifier: "carol@blink.sv",
  description: "Pay carol",
  commentAllowed: 80,
  callback: "https://blink.sv/cb",
  domain: "blink.sv",
  metadata: "",
  image: "",
  rawData: {},
  fixed: false,
  metadataHash: "",
}

const lnurlDestination = (params = LNURL_PARAMS) =>
  createLnurlPaymentDestination({
    paymentType: "lnurl",
    valid: true,
    lnurl: params.identifier,
    lnurlParams: params,
  } as never)

const lightningDestination = (invoice: string, amount?: number) =>
  createLightningDestination({
    paymentType: "lightning",
    valid: true,
    paymentRequest: invoice,
    ...(amount === undefined ? {} : { amount }),
  } as never)

const ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"

const onchainDestination = (amount?: number) =>
  createOnchainDestination({
    paymentType: "onchain",
    valid: true,
    address: ADDRESS,
    ...(amount === undefined ? {} : { amount }),
  } as never)

const run = (args: PrepareSendArgs, fake: ReturnType<typeof setup>) =>
  prepareSendRun(args, fake.ctx)

beforeEach(() => {
  parse.mockReset()
  resetIdempotencyKeySupport()
})

describe("prepareSend to a contact from the cash wallet", () => {
  it("builds the intraledger detail, probes nothing, and holds the fixed-cent card 10 minutes", async () => {
    const fake = setup()

    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD", memo: "Lunch" }, fake),
    )

    expect(action.intent).toBe("prepareSend")
    expect(action.threadId).toBe("thread-1")
    expect(action.summary).toEqual({
      type: "confirmPayment",
      payeeLabel: "Alice",
      payeeUsername: "alice",
      amountText: "USD 500",
      feeText: "USD 0",
      totalText: "USD 500",
      balanceAfterText: "USD 9500",
      sourceWallet: "USD",
      memo: "Lunch",
    })
    expect(action.expiresAt).toBe(NOW_MS + FIXED_CENT_INTRALEDGER_TTL_MS)
    // A send to a Flash user from cash costs nothing and asks no network.
    Object.values(fake.actions.feeProbes).forEach((probe) =>
      expect(probe).not.toHaveBeenCalled(),
    )
    expect(action.dispatch).toEqual({
      paymentDetailHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      match: {
        kind: "intraledger",
        counterPartyWalletId: "alice-wallet",
        settlementCurrency: "USD",
        amount: 500,
      },
      // The wallet it leaves, whose rows the reconciler reads (reconcile.ts).
      sourceWalletCurrency: "USD",
    })
  })

  it("names the USDT cash wallet as the paying wallet once the account is cut over", async () => {
    // The API shows this client the active settlement wallet, USDT after the
    // cutover, and the send leaves it: its rows, not the legacy USD
    // wallet's, are the ones the list must show (reconcile.ts).
    const fake = setup()
    fake.graphql.wallets.mockResolvedValue([
      wallet({
        __typename: "UsdtWallet",
        id: "my-usdt",
        walletCurrency: "USDT",
        balance: 10_000,
      }),
      BTC_ROW,
    ])

    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    )

    expect(action.summary).toMatchObject({ sourceWallet: "USDT" })
    expect(action.dispatch?.sourceWalletCurrency).toBe("USDT")
  })

  it("executes through sendPayment, under the action's key, writing the dispatch down first", async () => {
    const fake = setup()
    const order: string[] = []
    fake.mutations.intraLedgerUsdPaymentSend.mockImplementation(async () => {
      order.push("send")
      return sentOk("intraLedgerUsdPaymentSend")
    })
    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    )
    const { ctx, journalDispatch } = confirmCtx(action)
    journalDispatch.mockImplementation(async () => {
      order.push("journal")
    })

    await expect(action.execute(ctx)).resolves.toEqual({ status: "succeeded" })

    expect(order).toEqual(["journal", "send"])
    const input =
      fake.mutations.intraLedgerUsdPaymentSend.mock.calls[0][0].variables.input
    expect(input).toMatchObject({
      walletId: "my-usd",
      recipientWalletId: "alice-wallet",
      amount: 500,
      idempotencyKey: expect.any(String),
    })
    expect(journalDispatch).toHaveBeenCalledWith(input.idempotencyKey)
  })

  it("retries a lost answer under the same key, and a refreshed action gets a new one", async () => {
    const fake = setup()
    fake.mutations.intraLedgerUsdPaymentSend
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue(sentOk("intraLedgerUsdPaymentSend"))
    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    )
    const { ctx } = confirmCtx(action)

    await expect(action.execute(ctx)).resolves.toEqual({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "retrySameAttempt",
    })
    await expect(action.execute(ctx)).resolves.toEqual({ status: "succeeded" })

    const keys = fake.mutations.intraLedgerUsdPaymentSend.mock.calls.map(
      ([options]) => options.variables.input.idempotencyKey,
    )
    expect(keys[0]).toBe(keys[1])

    const refreshed = prepared(await action.refresh())
    expect(refreshed.id).not.toBe(action.id)
    expect(refreshed.attempt).not.toBe(action.attempt)
    expect(refreshed.dispatch?.paymentDetailHash).toBe(action.dispatch?.paymentDetailHash)
    await refreshed.execute(confirmCtx(refreshed).ctx)
    const refreshedKey =
      fake.mutations.intraLedgerUsdPaymentSend.mock.calls[2][0].variables.input
        .idempotencyKey
    expect(refreshedKey).not.toBe(keys[0])
  })

  it("answers a key reuse error with check-history, never a plain failure", async () => {
    const fake = setup()
    fake.mutations.intraLedgerUsdPaymentSend.mockResolvedValue({
      data: {
        intraLedgerUsdPaymentSend: {
          status: PaymentSendResult.Failure,
          errors: [
            { message: "This idempotency key was already used for a different payment" },
          ],
        },
      },
    })
    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    )

    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    })
  })

  it("lets a keyed send the server refused be confirmed again, nothing having moved", async () => {
    const fake = setup()
    fake.mutations.intraLedgerUsdPaymentSend.mockResolvedValue({
      data: {
        intraLedgerUsdPaymentSend: {
          status: PaymentSendResult.Failure,
          errors: [{ message: "Recipient wallet is locked" }],
        },
      },
    })
    const action = prepared(
      await run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    )

    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "confirmAgain",
    })
  })

  it("reads a bare amount in the display currency, which makes the card rate-bound", async () => {
    const fake = setup({ display: "JMD" })

    const action = prepared(await run({ payee: "Alice", amount: "785" }, fake))

    // J$785 is $5.00 at J$157 to the dollar; the amount leads in J$.
    expect(action.summary).toMatchObject({ amountText: "JMD 78500 (USD 500)" })
    expect(action.expiresAt).toBe(NOW_MS + RATE_TTL_MS)
  })

  it("passes a clarification from the contact lookup through, options re-issuing their picks", async () => {
    const fake = setup()
    fake.graphql.contacts.mockResolvedValue([contact("alice", "Alice"), contact("alina")])

    await expect(
      run({ payee: "ali", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "clarification",
      card: expect.objectContaining({
        prompt: "Assistant.pickContact",
        options: expect.arrayContaining([
          expect.objectContaining({ id: "contact:alice", sublabel: "alice" }),
        ]),
      }),
    })
  })

  it("prepares a picked contact without asking again", async () => {
    const fake = setup()
    fake.graphql.contacts.mockResolvedValue([contact("alice", "Alice"), contact("alina")])

    const action = prepared(
      await run({ payee: "contact:alice", amount: "5", currency: "USD" }, fake),
    )

    expect(action.summary).toMatchObject({ payeeLabel: "Alice", payeeUsername: "alice" })
  })

  it("asks for an amount when the payee does not fix one", async () => {
    const fake = setup()

    await expect(run({ payee: "Alice" }, fake)).resolves.toEqual({
      kind: "clarification",
      card: { type: "clarification", prompt: "Assistant.amountRequired", options: [] },
    })
  })
})

describe("prepareSend to someone who is not a contact (ENG-730)", () => {
  // Beside the amount question above: a payee is resolved before it (spec
  // §5.1, "Payee resolution before a card"). The grammar never emits a send
  // with no amount, so these guard the order against a refactor.
  it("refuses a name that is no contact's and no Flash user's before asking for an amount", async () => {
    const fake = setup()

    await expect(run({ payee: "mallory" }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.payeeNotFound",
      card: { type: "prepareRefused", reason: "payeeNotFound" },
    })
  })

  it("asks which Flash user before asking for an amount, and asks for the amount once the user picks", async () => {
    const fake = setup()

    const asked = await run({ payee: NOT_A_CONTACT }, fake)

    expect(asked).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "contact:dreadmax", label: "dreadmax", sublabel: "dreadmax" }],
        about: "dreadmax",
      },
    })
    if (asked.kind !== "clarification") throw new Error("expected a question")

    // The tap re-issues the call with the pick, still with no amount.
    await expect(run({ payee: asked.card.options[0].id }, fake)).resolves.toEqual({
      kind: "clarification",
      card: { type: "clarification", prompt: "Assistant.amountRequired", options: [] },
    })
  })

  it("answers the user's own username with the self-payment reply, never a picker, before reading a price", async () => {
    // Signed in as dreadmax, the user names dreadmax: the send screen refuses
    // that at lookup time (payment-destination/intraledger.ts:39-45), and the
    // picker's one option would only be refused at the tap (ENG-730 review).
    const fake = setup()
    fake.graphql.wallets.mockResolvedValue([
      wallet({ id: "dreadmax-wallet", walletCurrency: "USD", balance: 10_000 }),
      BTC_ROW,
    ])

    await expect(
      run({ payee: NOT_A_CONTACT, amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.selfPayment" })
    expect(fake.graphql.realtimePrice).not.toHaveBeenCalled()
    Object.values(fake.actions.feeProbes).forEach((probe) =>
      expect(probe).not.toHaveBeenCalled(),
    )
  })

  it("asks with a picker of one for a Flash user, then prepares the pick's card for that user", async () => {
    // The dogfood ask: "Send 0.05 usd to dreadmax", dreadmax being a Flash
    // user the user has not added.
    const fake = setup()
    const args: PrepareSendArgs = { payee: "dreadmax", amount: "0.05", currency: "USD" }

    const asked = await run(args, fake)

    expect(asked).toEqual({
      kind: "clarification",
      card: {
        type: "clarification",
        prompt: "Assistant.pickContact",
        options: [{ id: "contact:dreadmax", label: "dreadmax", sublabel: "dreadmax" }],
        about: "dreadmax",
      },
    })
    // A question prices nothing and probes nothing.
    expect(fake.graphql.realtimePrice).not.toHaveBeenCalled()
    if (asked.kind !== "clarification") throw new Error("expected a question")

    // The tap re-issues the call with the pick in place of the name.
    const action = prepared(await run({ ...args, payee: asked.card.options[0].id }, fake))

    expect(action.summary).toEqual({
      type: "confirmPayment",
      payeeLabel: "dreadmax",
      payeeUsername: "dreadmax",
      amountText: "USD 5",
      feeText: "USD 0",
      totalText: "USD 5",
      balanceAfterText: "USD 9995",
      sourceWallet: "USD",
    })
    expect(action.dispatch?.match).toEqual({
      kind: "intraledger",
      counterPartyWalletId: "dreadmax-wallet",
      settlementCurrency: "USD",
      amount: 5,
    })

    // Confirmed, it pays that Flash user's wallet, as the send screen would.
    fake.mutations.intraLedgerUsdPaymentSend.mockResolvedValue(
      sentOk("intraLedgerUsdPaymentSend"),
    )
    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "succeeded",
    })
    expect(
      fake.mutations.intraLedgerUsdPaymentSend.mock.calls[0][0].variables.input,
    ).toMatchObject({
      walletId: "my-usd",
      recipientWalletId: "dreadmax-wallet",
      amount: 5,
    })
  })

  it("refuses with the not-found card a name that is no contact's and no Flash user's, before reading a balance, price, limit or fee", async () => {
    // From the BTC wallet, whose balance would be read past the payee.
    const fake = setup()

    await expect(
      run({ payee: "mallory", amount: "5", currency: "USD", sourceWallet: "BTC" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.payeeNotFound",
      card: { type: "prepareRefused", reason: "payeeNotFound" },
    })
    expect(fake.graphql.accountDefaultWallet.mock.calls).toEqual([["mallory"]])
    // The wallet list is read once, for the account's own wallet ids; nothing
    // past the payee runs.
    expect(fake.graphql.wallets).toHaveBeenCalledTimes(1)
    expect(fake.btcRail.getBalanceSats).not.toHaveBeenCalled()
    expect(fake.graphql.realtimePrice).not.toHaveBeenCalled()
    expect(fake.graphql.accountLimits).not.toHaveBeenCalled()
    expect(fake.btcRail.probeFee).not.toHaveBeenCalled()
    Object.values(fake.actions.feeProbes).forEach((probe) =>
      expect(probe).not.toHaveBeenCalled(),
    )
  })

  it("ends a picked Flash user's expired card with the not-found reply when they are gone by the refresh, sending nothing", async () => {
    const fake = setup()
    let clock = NOW_MS
    const now = () => clock
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal: createAttemptJournal({ storage: memoryStorage() }),
      reconcile: jest.fn(async () => "unknown" as const),
      telemetry: recordingTelemetry().telemetry,
      now,
    })
    const { graphql, displayCurrency, now: _fixed, ...actionDeps } = fake.ctx
    const action = prepared(
      await runTool(
        {
          intent: "prepareSend",
          args: { payee: "contact:dreadmax", amount: "5", currency: "USD" },
        },
        {
          registry: assistantRegistry,
          graphql,
          btcRail: fake.btcRail,
          displayCurrency,
          lnAddressHostname: actionDeps.send.lnAddressHostname,
          now,
          telemetry: recordingTelemetry().telemetry,
          actionDeps,
        },
      ),
    )
    executor.addPrepared(action, "text")
    // The card expires, and dreadmax's account is gone by the Confirm that
    // prepares it again: the refresh looks the pick up again and refuses.
    clock += FIXED_CENT_INTRALEDGER_TTL_MS + 1_000
    fake.graphql.accountDefaultWallet.mockImplementation(accountsOf(["alice", "jane"]))

    await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
      kind: "expired",
      actionId: action.id,
      replyKey: "Assistant.payeeNotFound",
      refresh: {
        kind: "error",
        userMessage: "Assistant.payeeNotFound",
        card: { type: "prepareRefused", reason: "payeeNotFound" },
      },
    })
    expect(fake.mutations.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
    // A refusal ends the action, as a shortfall's does; it is not left
    // expired for another try.
    await expect(executor.canConfirm(action.id)).resolves.toMatchObject({
      enabled: false,
    })
  })

  it("leaves a picked Flash user's expired card expired, for another try, when the refresh's lookup fails", async () => {
    // The server fails dreadmax's lookup at the Confirm that prepares the
    // card again: a GraphQL error on an HTTP 200 (DB_ERROR), through the
    // real rail (ENG-730 review). Read as no account, it was the not-found
    // refusal, and the action ended for good. It is a failed read: the
    // action stays, expired, and the next Confirm prepares it again.
    const fake = setup()
    let clock = NOW_MS
    const now = () => clock
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal: createAttemptJournal({ storage: memoryStorage() }),
      reconcile: jest.fn(async () => "unknown" as const),
      telemetry: recordingTelemetry().telemetry,
      now,
    })
    const { graphql, displayCurrency, now: _fixed, ...actionDeps } = fake.ctx
    const action = prepared(
      await runTool(
        {
          intent: "prepareSend",
          args: { payee: "contact:dreadmax", amount: "5", currency: "USD" },
        },
        {
          registry: assistantRegistry,
          graphql,
          btcRail: fake.btcRail,
          displayCurrency,
          lnAddressHostname: actionDeps.send.lnAddressHostname,
          now,
          telemetry: recordingTelemetry().telemetry,
          actionDeps,
        },
      ),
    )
    executor.addPrepared(action, "text")
    clock += FIXED_CENT_INTRALEDGER_TTL_MS + 1_000
    fake.graphql.accountDefaultWallet.mockImplementation(failingAccountLookup())

    await expect(executor.executePreparedAction(action.id)).resolves.toEqual({
      kind: "expired",
      actionId: action.id,
      replyKey: "Assistant.expired",
      refresh: { kind: "error", userMessage: "Assistant.toolFailed" },
    })
    expect(fake.mutations.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
    await expect(executor.canConfirm(action.id)).resolves.toEqual({
      enabled: true,
      state: "armed",
    })

    // The lookup answers again: the next Confirm prepares the same card, and
    // with the numbers unchanged it pays dreadmax.
    fake.graphql.accountDefaultWallet.mockImplementation(
      accountsOf(["alice", "jane", NOT_A_CONTACT]),
    )
    fake.mutations.intraLedgerUsdPaymentSend.mockResolvedValue(
      sentOk("intraLedgerUsdPaymentSend"),
    )

    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      kind: "executed",
      replacedActionId: action.id,
      outcome: { status: "succeeded" },
    })
    expect(
      fake.mutations.intraLedgerUsdPaymentSend.mock.calls[0][0].variables.input,
    ).toMatchObject({ recipientWalletId: "dreadmax-wallet", amount: 500 })
  })

  it("refuses a pick whose Flash user is gone by the tap with the not-found card", async () => {
    const fake = setup()
    fake.graphql.accountDefaultWallet.mockImplementation(accountsOf(["alice", "jane"]))

    await expect(
      run({ payee: "contact:dreadmax", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.payeeNotFound",
      card: { type: "prepareRefused", reason: "payeeNotFound" },
    })
    expect(fake.graphql.realtimePrice).not.toHaveBeenCalled()
  })
})

describe("prepareSend affordability and limits (spec §5.1)", () => {
  it("refuses with the shortfall card, before any card, when the amount is over the balance", async () => {
    const fake = setup({ cents: 499 })

    await expect(
      run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    ).rejects.toMatchObject({ reason: "insufficientBalance" })
  })

  it("counts the probed fee: amount plus fee over the balance is a shortfall", async () => {
    const fake = setup({ cents: 1_000 })
    const invoice = bolt11({ id: "fee", sats: 15_000 })
    parse.mockResolvedValue(lightningDestination(invoice, 15_000))
    // 15,000 sats is $9.45; a 60 cent fee takes the total over $10.
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 60, errors: [] } },
    })

    await expect(run({ payee: invoice }, fake)).rejects.toMatchObject({
      reason: "insufficientBalance",
    })
  })

  it("refuses a payment over its bucket's remaining limit: internalSend for a Flash user", async () => {
    const fake = setup()
    fake.graphql.accountLimits.mockResolvedValue({
      withdrawal: [],
      internalSend: [{ totalLimit: 1_000, remainingLimit: 499, interval: 86_400 }],
      convert: [],
    })

    await expect(
      run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    ).rejects.toMatchObject({ reason: "limitExceeded" })
  })

  it("counts a Lightning send against withdrawal", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "wd", sats: 1_000 })
    parse.mockResolvedValue(lightningDestination(invoice, 1_000))
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 0, errors: [] } },
    })
    fake.graphql.accountLimits.mockResolvedValue({
      withdrawal: [{ totalLimit: 1_000, remainingLimit: 10, interval: 86_400 }],
      internalSend: [],
      convert: [],
    })

    await expect(run({ payee: invoice }, fake)).rejects.toMatchObject({
      reason: "limitExceeded",
    })
  })
})

describe("prepareSend to a Lightning invoice from the cash wallet", () => {
  it("uses the amount builder, probes once with lnUsdInvoiceFeeProbe, and the earliest input expiry wins", async () => {
    const fake = setup()
    // The invoice dies in 30 s, before the 60 s probe and rate TTLs.
    const invoice = bolt11({ id: "amt", sats: 7_937, expirySeconds: 30 })
    parse.mockResolvedValue(lightningDestination(invoice, 7_937))
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 3, errors: [] } },
    })

    const action = prepared(await run({ payee: invoice }, fake))

    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).toHaveBeenCalledTimes(1)
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mock.calls[0][0]).toEqual({
      variables: { input: { paymentRequest: invoice, walletId: "my-usd" } },
    })
    expect(action.expiresAt).toBe(NOW_MS + 30_000)
    expect(action.summary).toMatchObject({ feeText: "USD 3" })
    expect(action.dispatch?.match).toEqual({
      kind: "lightning",
      paymentHash: paymentHashOf("amt"),
    })
  })

  it("holds a card 60 s from the probe when the invoice lives longer", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "long", sats: 1_000, expirySeconds: 3_600 })
    parse.mockResolvedValue(lightningDestination(invoice, 1_000))
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 0, errors: [] } },
    })

    const action = prepared(await run({ payee: invoice }, fake))

    expect(action.expiresAt).toBe(NOW_MS + Math.min(FEE_PROBE_TTL_MS, RATE_TTL_MS))
  })

  it("uses the no-amount builder and its own probe for an invoice with no amount", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "open" })
    parse.mockResolvedValue(lightningDestination(invoice))
    fake.actions.feeProbes.lnNoAmountUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnNoAmountUsdInvoiceFeeProbe: { amount: 1, errors: [] } },
    })
    fake.mutations.lnNoAmountUsdInvoicePaymentSend.mockResolvedValue(
      sentOk("lnNoAmountUsdInvoicePaymentSend"),
    )

    const action = prepared(
      await run({ payee: invoice, amount: "2", currency: "USD" }, fake),
    )
    await action.execute(confirmCtx(action).ctx)

    expect(fake.actions.feeProbes.lnNoAmountUsdInvoiceFeeProbe.mock.calls[0][0]).toEqual({
      variables: { input: { amount: 200, paymentRequest: invoice, walletId: "my-usd" } },
    })
    expect(
      fake.mutations.lnNoAmountUsdInvoicePaymentSend.mock.calls[0][0].variables.input,
    ).toMatchObject({
      amount: 200,
      paymentRequest: invoice,
      idempotencyKey: expect.any(String),
    })
  })

  it("returns an error, not a card with a fee of 0, when the probe fails", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "noroute", sats: 1_000 })
    parse.mockResolvedValue(lightningDestination(invoice, 1_000))
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: null, errors: [{ message: "No route" }] } },
    })

    await expect(run({ payee: invoice }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.feeUnavailable",
    })
  })

  it("refuses a second amount for an invoice that sets its own", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "fixed", sats: 1_000 })
    parse.mockResolvedValue(lightningDestination(invoice, 1_000))

    await expect(
      run({ payee: invoice, amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.amountFixedByRequest" })
  })
})

describe("prepareSend to an LNURL payee from the cash wallet", () => {
  const minted = (sats: number) =>
    bolt11({ id: `lnurl-${sats}`, sats, expirySeconds: 600 })

  it("mints the invoice at the amount, sends the memo as the comment, then probes it", async () => {
    const fake = setup()
    parse.mockResolvedValue(lnurlDestination())
    // $5.00 is 7,937 sats at $63,000 a bitcoin.
    fake.requestLnurlInvoice.mockResolvedValue({ invoice: minted(7_937) })
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 2, errors: [] } },
    })

    const action = prepared(
      await run(
        { payee: "carol@blink.sv", amount: "5", currency: "USD", memo: "Thanks" },
        fake,
      ),
    )

    expect(fake.requestLnurlInvoice).toHaveBeenCalledWith({
      lnUrlOrAddress: "carol@blink.sv",
      sats: 7_937,
      comment: "Thanks",
    })
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).toHaveBeenCalledTimes(1)
    expect(action.summary).toMatchObject({ payeeLabel: "carol@blink.sv", memo: "Thanks" })
    expect(action.dispatch?.match).toEqual({
      kind: "lightning",
      paymentHash: paymentHashOf("lnurl-7937"),
    })
  })

  it("refuses an invoice for another amount than it asked for", async () => {
    const fake = setup()
    parse.mockResolvedValue(lnurlDestination())
    fake.requestLnurlInvoice.mockResolvedValue({ invoice: minted(7_900) })

    await expect(
      run({ payee: "carol@blink.sv", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.recipientInvoiceFailed" })
  })

  it("says the recipient cannot take an amount outside its bounds, without asking it", async () => {
    const fake = setup()
    parse.mockResolvedValue(lnurlDestination({ ...LNURL_PARAMS, min: 10_000 }))

    await expect(
      run({ payee: "carol@blink.sv", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.amountOutsideRecipientLimits",
    })
    expect(fake.requestLnurlInvoice).not.toHaveBeenCalled()
  })

  it("answers a service that mints nothing with its reply", async () => {
    const fake = setup()
    parse.mockResolvedValue(lnurlDestination())
    fake.requestLnurlInvoice.mockRejectedValue(new Error("timed out"))

    await expect(
      run({ payee: "carol@blink.sv", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.recipientInvoiceFailed" })
  })
})

describe("prepareSend to a Flash user's address when the username lookup fails (ENG-730 review)", () => {
  // The send flow's real parser, over the real rail failing every lookup as
  // lnflash/flash fails one for an account that may exist (failingAccountLookup).
  const { parseDestination: realParse } = jest.requireActual(
    "@app/screens/send-bitcoin-screen/payment-destination",
  )

  /** A Flash user's LNURL-pay link: https://flashapp.me/.well-known/lnurlp/dreadmax. */
  const FLASH_LNURL =
    "LNURL1DP68GURN8GHJ7ENVV9EKSCTSWQHX6EF09EMK2MRV944KUMMHDCHKCMN4WFK8QTMYWFJKZERDV9UQGM6W09"

  const failingLookups = () => {
    const fake = setup()
    fake.graphql.accountDefaultWallet.mockImplementation(failingAccountLookup())
    parse.mockImplementation(realParse)
    return fake
  }

  it("prepares a Flash user's LNURL as LNURL-pay, as the send screen does, never refusing it as unsupported", async () => {
    // The send screen's lazy query resolves on an error, so its parser falls
    // back from the Flash user to the LNURL-pay request, which still pays
    // them (payment-destination/lnurl.ts:56-79).
    const fake = failingLookups()
    ;(getParams as jest.Mock).mockResolvedValue({ tag: "payRequest" })
    ;(requestPayServiceParams as jest.Mock).mockResolvedValue({
      ...LNURL_PARAMS,
      identifier: "dreadmax@flashapp.me",
      description: "Pay dreadmax",
      callback: "https://flashapp.me/lnurlp/dreadmax/callback",
      domain: "flashapp.me",
    })
    // $5.00 is 7,937 sats at $63,000 a bitcoin.
    fake.requestLnurlInvoice.mockResolvedValue({
      invoice: bolt11({ id: "dreadmax-7937", sats: 7_937, expirySeconds: 600 }),
    })
    fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
      data: { lnUsdInvoiceFeeProbe: { amount: 2, errors: [] } },
    })

    const action = prepared(
      await run({ payee: FLASH_LNURL, amount: "5", currency: "USD" }, fake),
    )

    expect(fake.graphql.accountDefaultWallet).toHaveBeenCalledWith("dreadmax")
    expect(fake.requestLnurlInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ lnUrlOrAddress: FLASH_LNURL.toLowerCase(), sats: 7_937 }),
    )
    expect(action.summary).toMatchObject({ payeeLabel: "dreadmax@flashapp.me" })
  })

  it("answers a Flash Lightning address with a failed read, never calling a real user unknown", async () => {
    // The parser takes the address as that username and reads the failed
    // lookup as no account: UsernameDoesNotExist, which prepareSend would
    // answer with invalidDestination about a user who exists.
    const fake = failingLookups()
    const { graphql, displayCurrency, now, ...actionDeps } = fake.ctx

    const result = await runTool(
      {
        intent: "prepareSend",
        args: { payee: "dreadmax@flashapp.me", amount: "5", currency: "USD" },
      },
      {
        registry: assistantRegistry,
        graphql,
        btcRail: fake.btcRail,
        displayCurrency,
        lnAddressHostname: actionDeps.send.lnAddressHostname,
        now,
        telemetry: recordingTelemetry().telemetry,
        actionDeps,
      },
    )

    expect(result).toEqual({ kind: "error", userMessage: "Assistant.toolFailed" })
    expect(fake.graphql.accountDefaultWallet).toHaveBeenCalledWith("dreadmax")
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).not.toHaveBeenCalled()
  })
})

describe("prepareSend to an on-chain address from the cash wallet", () => {
  it("probes onChainUsdTxFee, and never retries the keyless send after a lost answer", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination())
    fake.actions.feeProbes.onChainUsdTxFee.mockResolvedValue({
      data: { onChainUsdTxFee: { amount: 120 } },
    })
    fake.mutations.onChainUsdPaymentSend.mockRejectedValue(
      new Error("Network request failed"),
    )

    const action = prepared(
      await run({ payee: ADDRESS, amount: "50", currency: "USD" }, fake),
    )

    expect(fake.actions.feeProbes.onChainUsdTxFee.mock.calls[0][0]).toEqual({
      variables: { walletId: "my-usd", address: ADDRESS, amount: 5_000 },
    })
    expect(action.summary).toMatchObject({ feeText: "USD 120", totalText: "USD 5120" })
    expect(action.dispatch?.match).toEqual({ kind: "onchain", address: ADDRESS })
    // On-chain inputs carry no key: a lost answer is never retried.
    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    })
  })

  it("refuses a send under the cash wallet's on-chain floor", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination())

    await expect(
      run({ payee: ADDRESS, amount: "1.99", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.onchainBelowMinimum",
    })
  })

  it("refuses an on-chain request that sets a bitcoin amount: the API pays none from cash", async () => {
    const fake = setup()
    parse.mockResolvedValue(onchainDestination(50_000))

    await expect(
      run({ payee: `bitcoin:${ADDRESS}?amount=0.0005` }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.onchainAmountUnsupported",
    })
  })
})

describe("prepareSend from the BTC wallet", () => {
  it("probes a contact send through the rail at the contact's Lightning address", async () => {
    const fake = setup()
    fake.btcRail.probeFee.mockResolvedValue({ fee: 4, err: null })

    const action = prepared(
      await run(
        { payee: "Alice", amount: "0.0001", currency: "BTC", sourceWallet: "BTC" },
        fake,
      ),
    )

    expect(fake.btcRail.probeFee).toHaveBeenCalledWith({
      paymentType: "intraledger",
      paymentRequest: "alice@flashapp.me",
      amountSats: 10_000,
    })
    // In the display currency first, then the wallet's own sats.
    expect(action.summary).toMatchObject({
      sourceWallet: "BTC",
      amountText: "BTC 10000 (USD 630)",
      feeText: "USD 0.252 (BTC 4)",
      totalText: "USD 630.252 (BTC 10004)",
    })
    // A Breez probe holds 60 s; the BTC wallet's payments are not in the
    // GraphQL list.
    expect(action.expiresAt).toBe(NOW_MS + FEE_PROBE_TTL_MS)
    expect(action.dispatch?.match).toEqual({ kind: "btcRail" })
    expect(action.dispatch?.sourceWalletCurrency).toBe("BTC")
  })

  it("pays through the rail's payLnurl, journaled first, with no memo", async () => {
    const fake = setup()
    fake.btcRail.probeFee.mockResolvedValue({ fee: 4, err: null })
    fake.btcRail.payLnurl.mockResolvedValue({ payment: { status: 0 } })
    const action = prepared(
      await run(
        {
          payee: "Alice",
          amount: "0.0001",
          currency: "BTC",
          sourceWallet: "BTC",
          memo: "x",
        },
        fake,
      ),
    )
    const { ctx, journalDispatch } = confirmCtx(action)

    await expect(action.execute(ctx)).resolves.toEqual({ status: "succeeded" })

    expect(journalDispatch).toHaveBeenCalledWith(null)
    expect(fake.btcRail.payLnurl).toHaveBeenCalledWith("alice@flashapp.me", 10_000, "")
    // The rail sends no memo, so the card showed none.
    expect(action.summary).not.toHaveProperty("memo")
  })

  it("disarms the card after a rejection from lnurlPay itself: the payment may have left (ENG-711)", async () => {
    const fake = setup()
    fake.btcRail.probeFee.mockResolvedValue({ fee: 4, err: null })
    fake.btcRail.payLnurl.mockRejectedValue(
      new LnurlPayOutcomeUnknownError(new Error("socket")),
    )
    const action = prepared(
      await run(
        { payee: "Alice", amount: "0.0001", currency: "BTC", sourceWallet: "BTC" },
        fake,
      ),
    )

    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    })
  })

  it("offers a fresh prepare after a refusal before dispatch: nothing left", async () => {
    const fake = setup()
    fake.btcRail.probeFee.mockResolvedValue({ fee: 4, err: null })
    fake.btcRail.payLnurl.mockRejectedValue(new Error("Unsupported input type"))
    const action = prepared(
      await run(
        { payee: "Alice", amount: "0.0001", currency: "BTC", sourceWallet: "BTC" },
        fake,
      ),
    )

    await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "reprepare",
    })
  })

  describe("to a bolt11 invoice (ENG-720 merged, spec v0.2.11 §5.1)", () => {
    // sendPayment's lightning branch keeps Confirm disarmed when the payment
    // may already have left: payLightningBreez's outcomeUnknown, and any
    // rejection out of payInvoice itself (send-payment.ts, ENG-720). These
    // cases run that real sendPayment over the fake rail.
    const INVOICE = bolt11({ id: "btc-bolt11", sats: 1_000 })
    const BOLT11_BTC = { payee: INVOICE, sourceWallet: "BTC" } as const

    const preparedBolt11 = async () => {
      const fake = setup()
      parse.mockResolvedValue(lightningDestination(INVOICE, 1_000))
      fake.btcRail.probeFee.mockResolvedValue({ fee: 3, err: null })
      return { fake, action: prepared(await run(BOLT11_BTC, fake)) }
    }

    it("probes the invoice through the rail, and holds the card 60 s", async () => {
      const { fake, action } = await preparedBolt11()

      expect(fake.btcRail.probeFee).toHaveBeenCalledWith({
        paymentType: "lightning",
        paymentRequest: INVOICE,
        amountSats: 1_000,
      })
      // The invoice names the amount, so it leads in the display currency.
      expect(action.summary).toMatchObject({
        sourceWallet: "BTC",
        amountText: "USD 63 (BTC 1000)",
        feeText: "USD 0.189 (BTC 3)",
        totalText: "USD 63.189 (BTC 1003)",
      })
      expect(action.expiresAt).toBe(NOW_MS + FEE_PROBE_TTL_MS)
      expect(action.dispatch?.match).toEqual({ kind: "btcRail" })
    })

    it("pays through the rail's payInvoice, journaled first", async () => {
      const { fake, action } = await preparedBolt11()
      const order: string[] = []
      fake.btcRail.payInvoice.mockImplementation(async () => {
        order.push("pay")
        return { success: true, payment: { payment: { status: 0 } } }
      })
      const { ctx, journalDispatch } = confirmCtx(action)
      journalDispatch.mockImplementation(async (key) => {
        order.push(`journal:${key}`)
      })

      await expect(action.execute(ctx)).resolves.toEqual({ status: "succeeded" })

      expect(order).toEqual(["journal:null", "pay"])
      expect(fake.btcRail.payInvoice).toHaveBeenCalledWith(INVOICE, 1_000)
    })

    it("disarms the card when the payment may have left (ENG-720), offering no re-prepare", async () => {
      // payLightningBreez answers a rejection from sdk.sendPayment itself
      // with outcomeUnknown; a rejection from the rail itself is unknown too.
      for (const answer of [
        () => Promise.resolve({ success: false, error: "socket", outcomeUnknown: true }),
        () => Promise.reject(new Error("bridge")),
      ]) {
        const { fake, action } = await preparedBolt11()
        fake.btcRail.payInvoice.mockImplementation(answer)

        await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        })
        // The second Confirm finds the attempt still in flight: nothing goes.
        await expect(action.execute(confirmCtx(action).ctx)).resolves.toMatchObject({
          status: "unknown",
          next: "checkHistory",
        })
        expect(fake.btcRail.payInvoice).toHaveBeenCalledTimes(1)
      }
    })

    it("offers a fresh prepare after a refusal before dispatch, or a payment that resolved Failed", async () => {
      for (const answer of [
        { success: false, error: "Failed to prepare the payment." },
        // ENG-712: a Failed payment is a known failure.
        { success: false, payment: { payment: { status: 2 } } },
      ]) {
        const { fake, action } = await preparedBolt11()
        fake.btcRail.payInvoice.mockResolvedValue(answer)

        await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
          status: "failed",
          replyKey: "Assistant.paymentFailed",
          next: "reprepare",
        })
      }
    })

    it("sends nothing, and offers a fresh prepare, when the payment cannot be written down", async () => {
      // A rejection out of payInvoice would read as a payment that may have
      // left: the journal answers the refusal instead (shared/journal.ts).
      const { fake, action } = await preparedBolt11()
      const { ctx, journalDispatch } = confirmCtx(action)
      journalDispatch.mockRejectedValue(new Error("disk full"))

      await expect(action.execute(ctx)).resolves.toEqual({
        status: "failed",
        replyKey: "Assistant.paymentFailed",
        next: "reprepare",
      })
      expect(fake.btcRail.payInvoice).not.toHaveBeenCalled()
      expect(UNRECORDED_INVOICE_SEND).toMatch(/not sent/)
    })
  })

  describe("to an on-chain address (ENG-714 merged, spec v0.2.10 §5.1)", () => {
    const ONCHAIN_BTC = {
      payee: ADDRESS,
      amount: "0.001",
      currency: "BTC",
      sourceWallet: "BTC",
    } as const

    it("probes the fee at the one speed the withdrawal pays for, and shows that fee", async () => {
      const fake = setup()
      parse.mockResolvedValue(onchainDestination())
      fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })

      const action = prepared(await run(ONCHAIN_BTC, fake))

      expect(fake.btcRail.probeFee).toHaveBeenCalledWith({
        paymentType: "onchain",
        paymentRequest: ADDRESS,
        amountSats: 100_000,
        selectedFeeType: BTC_ONCHAIN_FEE_SPEED,
      })
      expect(action.summary).toMatchObject({
        sourceWallet: "BTC",
        amountText: "BTC 100000 (USD 6300)",
        feeText: "USD 28.35 (BTC 450)",
        totalText: "USD 6328.35 (BTC 100450)",
      })
      expect(action.expiresAt).toBe(NOW_MS + FEE_PROBE_TTL_MS)
      expect(action.dispatch?.match).toEqual({ kind: "btcRail" })
    })

    it("withdraws through the rail at that same speed, under the attempt's key, journaled first", async () => {
      const fake = setup()
      parse.mockResolvedValue(onchainDestination())
      fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })
      const order: string[] = []
      fake.btcRail.payOnchain.mockImplementation(async () => {
        order.push("withdraw")
        return { success: true, payment: { payment: { status: 0 } } }
      })
      const action = prepared(await run(ONCHAIN_BTC, fake))
      const { ctx, journalDispatch } = confirmCtx(action)
      journalDispatch.mockImplementation(async (key) => {
        order.push(`journal:${key}`)
      })

      await expect(action.execute(ctx)).resolves.toEqual({ status: "succeeded" })

      expect(order).toEqual(["journal:null", "withdraw"])
      expect(fake.btcRail.payOnchain).toHaveBeenCalledWith(
        ADDRESS,
        100_000,
        BTC_ONCHAIN_FEE_SPEED,
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      )
      // The speed probed is the speed paid: the card's fee is the withdrawal's.
      expect(fake.btcRail.probeFee.mock.calls[0][0].selectedFeeType).toBe(
        fake.btcRail.payOnchain.mock.calls[0][2],
      )
    })

    it("refuses a withdrawal under the send screen's 5,500-sat floor", async () => {
      const fake = setup()
      parse.mockResolvedValue(onchainDestination())
      fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })

      await expect(run({ ...ONCHAIN_BTC, amount: "0.00005499" }, fake)).resolves.toEqual({
        kind: "error",
        userMessage: "Assistant.btcOnchainBelowMinimum",
      })
      expect(fake.btcRail.probeFee).not.toHaveBeenCalled()

      prepared(await run({ ...ONCHAIN_BTC, amount: "0.000055" }, fake))
      expect(fake.btcRail.probeFee).toHaveBeenCalledWith(
        expect.objectContaining({ amountSats: 5_500 }),
      )
    })

    it("disarms the card when the withdrawal may have left (ENG-714), offering no re-prepare", async () => {
      // payOnchainBreez answers a rejection from sdk.sendPayment itself with
      // outcomeUnknown; a rejection from the rail itself is unknown too.
      for (const answer of [
        () => Promise.resolve({ success: false, error: "socket", outcomeUnknown: true }),
        () => Promise.reject(new Error("bridge")),
      ]) {
        const fake = setup()
        parse.mockResolvedValue(onchainDestination())
        fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })
        fake.btcRail.payOnchain.mockImplementation(answer)
        const action = prepared(await run(ONCHAIN_BTC, fake))

        await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
          status: "unknown",
          replyKey: "Assistant.checkHistory",
          next: "checkHistory",
        })
      }
    })

    it("offers a fresh prepare after a refusal before the withdrawal: nothing left", async () => {
      const fake = setup()
      parse.mockResolvedValue(onchainDestination())
      fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })
      fake.btcRail.payOnchain.mockResolvedValue({
        success: false,
        error: "Failed to pay the invoice.",
      })
      const action = prepared(await run(ONCHAIN_BTC, fake))

      await expect(action.execute(confirmCtx(action).ctx)).resolves.toEqual({
        status: "failed",
        replyKey: "Assistant.paymentFailed",
        next: "reprepare",
      })
    })

    it("sends nothing, and offers a fresh prepare, when the withdrawal cannot be written down", async () => {
      const fake = setup()
      parse.mockResolvedValue(onchainDestination())
      fake.btcRail.probeFee.mockResolvedValue({ fee: 450, err: null })
      const action = prepared(await run(ONCHAIN_BTC, fake))
      const { ctx, journalDispatch } = confirmCtx(action)
      journalDispatch.mockRejectedValue(new Error("disk full"))

      await expect(action.execute(ctx)).resolves.toEqual({
        status: "failed",
        replyKey: "Assistant.paymentFailed",
        next: "reprepare",
      })
      expect(fake.btcRail.payOnchain).not.toHaveBeenCalled()
      expect(UNRECORDED_ONCHAIN_SEND).toMatch(/not sent/)
    })
  })

  it("answers a BTC wallet that is off with its reply, never a zero balance", async () => {
    const fake = setup()
    fake.btcRail.getBalanceSats.mockResolvedValue({ state: "disabled" })

    await expect(
      run(
        { payee: "Alice", amount: "0.0001", currency: "BTC", sourceWallet: "BTC" },
        fake,
      ),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.btcDisabled" })
  })
})

describe("prepareSend input", () => {
  it("refuses a unit with no amount", async () => {
    await expect(run({ payee: "Alice", currency: "USD" }, setup())).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.invalidArguments",
    })
  })

  it("refuses a payment to the user's own wallet", async () => {
    const fake = setup()
    fake.graphql.accountDefaultWallet.mockResolvedValue({
      id: "my-usd",
      walletCurrency: "USD",
    })

    await expect(
      run({ payee: "Alice", amount: "5", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.selfPayment",
    })
  })
})

describe("prepareSend through runTool and the executor", () => {
  const wire = () => {
    const fake = setup()
    const storage = memoryStorage()
    const journal = createAttemptJournal({ storage })
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal,
      reconcile: jest.fn(async () => "unknown" as const),
      telemetry: recordingTelemetry().telemetry,
      now: () => NOW_MS,
    })
    const { graphql, displayCurrency, now, ...actionDeps } = fake.ctx
    const prepare = async (args: PrepareSendArgs) =>
      prepared(
        await runTool(
          { intent: "prepareSend", args },
          {
            registry: assistantRegistry,
            graphql,
            btcRail: fake.btcRail,
            displayCurrency,
            lnAddressHostname: actionDeps.send.lnAddressHostname,
            now,
            telemetry: recordingTelemetry().telemetry,
            actionDeps,
          },
        ),
      )
    return { fake, executor, journal, prepare }
  }

  it("hands back a payee that names no one as the refusal card, never a bare reply (ENG-730)", async () => {
    const fake = setup()
    const { graphql, displayCurrency, now, ...actionDeps } = fake.ctx

    const result = await runTool(
      { intent: "prepareSend", args: { payee: "mallory", amount: "5", currency: "USD" } },
      {
        registry: assistantRegistry,
        graphql,
        btcRail: fake.btcRail,
        displayCurrency,
        lnAddressHostname: actionDeps.send.lnAddressHostname,
        now,
        telemetry: recordingTelemetry().telemetry,
        actionDeps,
      },
    )

    expect(result).toEqual({
      kind: "error",
      userMessage: "Assistant.payeeNotFound",
      card: { type: "prepareRefused", reason: "payeeNotFound" },
    })
  })

  it("confirms a contact send end to end: one dispatch, under one key, journaled and crossed off", async () => {
    const { fake, executor, journal, prepare } = wire()
    fake.mutations.intraLedgerUsdPaymentSend.mockResolvedValue(
      sentOk("intraLedgerUsdPaymentSend"),
    )
    const action = await prepare({ payee: "Alice", amount: "5", currency: "USD" })
    executor.addPrepared(action, "text")

    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    expect(fake.mutations.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
    await expect(journal.pending()).resolves.toEqual([])
  })

  it("retries a dropped answer from the card under the same key, keeping its record until it lands", async () => {
    const { fake, executor, journal, prepare } = wire()
    fake.mutations.intraLedgerUsdPaymentSend
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue(sentOk("intraLedgerUsdPaymentSend"))
    const action = await prepare({ payee: "Alice", amount: "5", currency: "USD" })
    executor.addPrepared(action, "text")

    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    await expect(journal.pending()).resolves.toHaveLength(1)
    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      outcome: { status: "succeeded" },
    })

    const keys = fake.mutations.intraLedgerUsdPaymentSend.mock.calls.map(
      ([options]) => options.variables.input.idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    await expect(journal.pending()).resolves.toEqual([])
  })

  it("blocks a second card for the same payment while the first's dispatch is unresolved", async () => {
    const { fake, executor, prepare } = wire()
    fake.mutations.intraLedgerUsdPaymentSend.mockRejectedValue(
      new Error("Network request failed"),
    )
    const first = await prepare({ payee: "Alice", amount: "5", currency: "USD" })
    const second = await prepare({
      payee: "Alice",
      amount: "5",
      currency: "USD",
      memo: "again",
    })
    executor.addPrepared(first, "text")
    executor.addPrepared(second, "text")

    await executor.executePreparedAction(first.id)

    await expect(executor.executePreparedAction(second.id)).resolves.toMatchObject({
      kind: "pendingDispatch",
    })
    expect(fake.mutations.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
  })
})

describe("prepareSend after a lost answer, with the real reconciler", () => {
  // The executor, the journal, the reconciler and prepareSend all real. The
  // first send's answer is lost, the user leaves the thread, and three
  // minutes later asks for the same $5 to Alice again. The transaction list
  // answers the way lnflash/flash main does: an IBEX row whose identifiers
  // are blank (paymentHash "", src/app/wallets/get-transactions-for-wallet.ts),
  // the Flash-to-Flash send being an IBEX Lightning payment.
  const wireOverTheList = () => {
    const fake = setup()
    let clock = NOW_MS
    const now = () => clock
    const journal = createAttemptJournal({ storage: memoryStorage() })
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal,
      reconcile: createTransactionListReconciler({
        graphql: fake.graphql as never,
        now,
      }),
      telemetry: recordingTelemetry().telemetry,
      now,
      // The phone's clock is the server's.
      serverClockOffsetMs: () => 0,
    })
    const { graphql, displayCurrency, now: _fixed, ...actionDeps } = fake.ctx
    const prepare = async (args: PrepareSendArgs) =>
      prepared(
        await runTool(
          { intent: "prepareSend", args },
          {
            registry: assistantRegistry,
            graphql,
            btcRail: fake.btcRail,
            displayCurrency,
            lnAddressHostname: actionDeps.send.lnAddressHostname,
            now,
            telemetry: recordingTelemetry().telemetry,
            actionDeps,
          },
        ),
      )
    const keysSent = () =>
      fake.mutations.intraLedgerUsdPaymentSend.mock.calls.map(
        ([options]) => options.variables.input.idempotencyKey as string,
      )
    return {
      fake,
      executor,
      journal,
      prepare,
      keysSent,
      advance: (ms: number) => {
        clock += ms
      },
    }
  }

  /** The first send, as lnflash/flash lists it once it landed. */
  const landedAsIbexRow = () =>
    graphqlTx({
      id: "ibex-1",
      createdAt: Math.floor(NOW_MS / 1000) + 1,
      settlementAmount: -500,
      initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
      settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
    })

  const ALICE_5 = { payee: "Alice", amount: "5", currency: "USD" } as const

  it("never sends the same payment again under a new key while the list shows a row that could be it", async () => {
    const run = wireOverTheList()
    run.fake.mutations.intraLedgerUsdPaymentSend.mockRejectedValueOnce(
      new Error("Network request failed"),
    )
    const first = await run.prepare(ALICE_5)
    run.executor.addPrepared(first, "text")
    await expect(run.executor.executePreparedAction(first.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    run.executor.leaveThread("thread-1")
    // It landed: the list shows it, with no hash and no counterparty.
    run.fake.graphql.transactions.mockResolvedValue(page([landedAsIbexRow()]))

    run.advance(3 * 60_000)
    const again = await run.prepare(ALICE_5)
    run.executor.addPrepared(again, "text")

    await expect(run.executor.executePreparedAction(again.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: again.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    await expect(run.journal.pending()).resolves.toEqual([
      expect.objectContaining({ preparedActionId: first.id }),
    ])
  })

  it("lets it go under a new key once the list shows nothing sent since the dispatch", async () => {
    const run = wireOverTheList()
    run.fake.mutations.intraLedgerUsdPaymentSend
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue(sentOk("intraLedgerUsdPaymentSend"))
    const first = await run.prepare(ALICE_5)
    run.executor.addPrepared(first, "text")
    await run.executor.executePreparedAction(first.id)
    run.executor.leaveThread("thread-1")
    // Only a receipt since the dispatch, nothing that could be the send, and
    // the deposit that funded the cash wallet, from before it: the wallet's
    // rows are read back past the dispatch.
    run.fake.graphql.transactions.mockResolvedValue(
      page([
        { ...landedAsIbexRow(), id: "in", direction: "RECEIVE", settlementAmount: 900 },
        fundedBefore(NOW_MS, "USD"),
      ]),
    )

    run.advance(RECONCILE_MIN_AGE_MS + 60_000)
    const again = await run.prepare(ALICE_5)
    run.executor.addPrepared(again, "text")

    await expect(run.executor.executePreparedAction(again.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    const [firstKey, secondKey] = run.keysSent()
    expect(secondKey).not.toBe(firstKey)
    await expect(run.journal.pending()).resolves.toEqual([])
  })
})
