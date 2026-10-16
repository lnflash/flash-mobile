import { cardOf, validateCard } from "@app/assistant/cards/types"
import { createAttemptJournal } from "@app/assistant/engine/attempt-journal"
import { createExecutor } from "@app/assistant/engine/executor"
import { createTransactionListReconciler } from "@app/assistant/engine/reconcile"
import {
  prepareConversionRun,
  PrepareConversionArgs,
  SWAP_MEMO,
} from "@app/assistant/registry/actions/prepare-conversion"
import { FEE_PROBE_TTL_MS } from "@app/assistant/registry/actions/shared/expiry"
import { UNRECORDED_INVOICE_SEND } from "@app/assistant/registry/actions/shared/journal"
import type {
  ExecuteContext,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import { resetIdempotencyKeySupport } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { memoryStorage } from "../executor-harness"
import {
  bolt11,
  fakeActionCtx,
  graphqlTx,
  NOW_MS,
  page,
  paymentHashOf,
  recordingTelemetry,
  USD_PRICE,
  wallet,
} from "../fakes"

const BTC_ROW = wallet({
  __typename: "BTCWallet",
  id: "my-btc",
  walletCurrency: "BTC",
  balance: null as never,
  isExternal: true,
})

/** $100 in cash, 1,000,000 sats in BTC; each invoice made is a new one. */
const setup = ({ cents = 10_000 }: { cents?: number } = {}) => {
  const fake = fakeActionCtx()
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: cents }),
    BTC_ROW,
  ])
  fake.graphql.realtimePrice.mockResolvedValue(USD_PRICE)
  fake.btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 1_000_000 })
  let made = 0
  fake.btcRail.createInvoice.mockImplementation(async (sats: number) => {
    made += 1
    return {
      paymentRequest: bolt11({ id: `breez-${made}`, sats, expirySeconds: 3_600 }),
      fee: BigInt(20),
    }
  })
  fake.actions.lnUsdInvoiceCreate.mockImplementation(async () => {
    made += 1
    return { paymentRequest: bolt11({ id: `usd-${made}`, expirySeconds: 300 }) }
  })
  fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
    data: { lnUsdInvoiceFeeProbe: { amount: 3, errors: [] } },
  })
  fake.btcRail.probeFee.mockResolvedValue({ fee: 10, err: null })
  fake.mutations.lnInvoicePaymentSend.mockResolvedValue({
    data: { lnInvoicePaymentSend: { status: PaymentSendResult.Success, errors: [] } },
  })
  fake.btcRail.payInvoice.mockResolvedValue({
    success: true,
    payment: { payment: { status: 0 } },
  })
  return fake
}

const prepared = (result: ToolResult<unknown>): PreparedAction => {
  if (result.kind !== "prepared")
    throw new Error(`not prepared: ${JSON.stringify(result)}`)
  return result.preparedAction
}

const run = (args: PrepareConversionArgs, fake: ReturnType<typeof setup>) =>
  prepareConversionRun(args, fake.ctx)

const confirm = (action: PreparedAction) => {
  const journalDispatch = jest.fn(async (): Promise<void> => undefined)
  const ctx: ExecuteContext = { attempt: action.attempt, journalDispatch }
  return { outcome: action.execute(ctx), journalDispatch }
}

const invoicesMade = (fake: ReturnType<typeof setup>) =>
  fake.btcRail.createInvoice.mock.calls.length +
  fake.actions.lnUsdInvoiceCreate.mock.calls.length

const CASH_TO_BTC: PrepareConversionArgs = {
  from: "USD",
  to: "BTC",
  amount: "5",
  currency: "USD",
}
const BTC_TO_CASH: PrepareConversionArgs = {
  from: "BTC",
  to: "USD",
  amount: "0.0001",
  currency: "BTC",
}

beforeEach(() => {
  resetIdempotencyKeySupport()
})

describe("prepareConversion, cash -> BTC (useSwap's prepareUsdToBtc)", () => {
  it("makes the Breez invoice for the amount, then probes it from the cash wallet, never with the Breez probe", async () => {
    const fake = setup()

    const action = prepared(await run(CASH_TO_BTC, fake))

    // $5.00 is 7,937 sats at $63,000 a bitcoin.
    expect(fake.btcRail.createInvoice).toHaveBeenCalledWith(7_937, SWAP_MEMO.cashToBtc)
    const invoice = fake.btcRail.createInvoice.mock.results[0]
    const { paymentRequest } = await invoice.value
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).toHaveBeenCalledTimes(1)
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mock.calls[0][0]).toEqual({
      variables: { input: { paymentRequest, walletId: "my-usd" } },
    })
    expect(fake.btcRail.probeFee).not.toHaveBeenCalled()
    expect(fake.actions.lnUsdInvoiceCreate).not.toHaveBeenCalled()
    expect(action.intent).toBe("prepareConversion")
    expect(validateCard(cardOf(action)).valid).toBe(true)
    expect(action.summary).toMatchObject({
      type: "confirmPayment",
      payeeLabel: "BTC",
      toWallet: "BTC",
      sourceWallet: "USD",
    })
    expect(action.dispatch?.match).toEqual({
      kind: "lightning",
      paymentHash: paymentHashOf("breez-1"),
    })
    // It leaves the cash wallet, whose rows the reconciler reads.
    expect(action.dispatch?.sourceWalletCurrency).toBe("USD")
  })

  it("shows what leaves the cash wallet as amount + fee = total, and what reaches the BTC wallet on its own line", async () => {
    const fake = setup()

    const action = prepared(await run(CASH_TO_BTC, fake))

    // $5.00 asked: the invoice's 7,937 whole sats cost the cash wallet 500.031
    // cents, and the fee to send them 3 more. Fee is only what the cash
    // wallet pays on top of the amount, so the total is the two, 503.031
    // cents ($5.03 on screen). The BTC wallet's 20-sat fee for receiving
    // never leaves the cash wallet: it comes off the 7,937 sats that arrive
    // (7,917 sats, 498.771 cents), on its own line. Counted in Fee, it made
    // Amount $5.00, Fee $0.04, Total $5.03.
    expect(action.summary).toMatchObject({
      amountText: "USD 500",
      feeText: "USD 3",
      totalText: "USD 503.031",
      receiveText: "USD 498.771 (BTC 7917)",
      balanceAfterText: "USD 9496",
    })
    expect(validateCard(cardOf(action)).valid).toBe(true)
  })

  it("refuses a conversion the BTC wallet's fee for receiving would swallow", async () => {
    const fake = setup()
    fake.btcRail.createInvoice.mockImplementation(async (sats: number) => ({
      paymentRequest: bolt11({ id: "swallowed", sats, expirySeconds: 3_600 }),
      fee: BigInt(sats),
    }))

    await expect(run({ ...CASH_TO_BTC, amount: "0.01" }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.amountTooSmall",
    })
  })

  it("holds the card 60 s from the probe and the rate", async () => {
    const action = prepared(await run(CASH_TO_BTC, setup()))

    expect(action.expiresAt).toBe(NOW_MS + FEE_PROBE_TTL_MS)
  })

  it("executes the pay leg only: lnInvoicePaymentSend under a key, and no invoice made", async () => {
    const fake = setup()
    const action = prepared(await run(CASH_TO_BTC, fake))
    const before = invoicesMade(fake)

    const { outcome } = confirm(action)
    await expect(outcome).resolves.toEqual({ status: "succeeded" })

    expect(invoicesMade(fake)).toBe(before)
    const input = fake.mutations.lnInvoicePaymentSend.mock.calls[0][0].variables.input
    expect(input).toMatchObject({
      walletId: "my-usd",
      paymentRequest: (await fake.btcRail.createInvoice.mock.results[0].value)
        .paymentRequest,
      memo: SWAP_MEMO.cashToBtc,
      idempotencyKey: expect.any(String),
    })
  })

  it("refreshes into a new invoice and a new key, never the old ones", async () => {
    const fake = setup()
    const action = prepared(await run(CASH_TO_BTC, fake))
    await confirm(action).outcome
    const firstKey =
      fake.mutations.lnInvoicePaymentSend.mock.calls[0][0].variables.input.idempotencyKey

    const refreshed = prepared(await action.refresh())
    await confirm(refreshed).outcome

    expect(fake.btcRail.createInvoice).toHaveBeenCalledTimes(2)
    const second = fake.mutations.lnInvoicePaymentSend.mock.calls[1][0].variables.input
    expect(second.paymentRequest).not.toBe(
      fake.mutations.lnInvoicePaymentSend.mock.calls[0][0].variables.input.paymentRequest,
    )
    expect(second.idempotencyKey).not.toBe(firstKey)
    // The same request is the same conversion to the executor, whatever
    // invoice each card pays (hashConversion): the identity leaves the
    // minted invoice out, and the match is each invoice's own.
    expect(refreshed.dispatch?.paymentDetailHash).toBe(action.dispatch?.paymentDetailHash)
    expect(refreshed.dispatch?.match).toEqual({
      kind: "lightning",
      paymentHash: paymentHashOf("breez-2"),
    })
  })

  it("names a conversion by its request: direction, both wallets and the amount as asked", async () => {
    const fake = setup()
    const fiveDollars = prepared(await run(CASH_TO_BTC, fake))
    const again = prepared(await run(CASH_TO_BTC, fake))
    const sixDollars = prepared(await run({ ...CASH_TO_BTC, amount: "6" }, fake))
    const inSats = prepared(
      // The same 7,937 sats, asked for in bitcoin: another request.
      await run({ ...CASH_TO_BTC, amount: "0.00007937", currency: "BTC" }, fake),
    )

    expect(again.dispatch?.paymentDetailHash).toBe(
      fiveDollars.dispatch?.paymentDetailHash,
    )
    for (const other of [sixDollars, inSats]) {
      expect(other.dispatch?.paymentDetailHash).not.toBe(
        fiveDollars.dispatch?.paymentDetailHash,
      )
    }
  })

  it("fails closed on a probe error or a probe with no fee", async () => {
    for (const probe of [
      { amount: null, errors: [{ message: "no route" }] },
      { amount: null, errors: [] },
    ]) {
      const fake = setup()
      fake.actions.feeProbes.lnUsdInvoiceFeeProbe.mockResolvedValue({
        data: { lnUsdInvoiceFeeProbe: probe },
      })

      await expect(run(CASH_TO_BTC, fake)).resolves.toEqual({
        kind: "error",
        userMessage: "Assistant.feeUnavailable",
      })
    }
  })

  it("refuses a shortfall and a conversion over the convert limit", async () => {
    await expect(run(CASH_TO_BTC, setup({ cents: 400 }))).rejects.toMatchObject({
      reason: "insufficientBalance",
    })
    const limited = setup()
    limited.graphql.accountLimits.mockResolvedValue({
      withdrawal: [],
      internalSend: [],
      convert: [{ totalLimit: 1_000, remainingLimit: 100, interval: 86_400 }],
    })
    await expect(run(CASH_TO_BTC, limited)).rejects.toMatchObject({
      reason: "limitExceeded",
    })
  })

  it("answers a BTC wallet that is off with its reply, making no invoice", async () => {
    const fake = setup()
    fake.btcRail.getBalanceSats.mockResolvedValue({ state: "disabled" })

    await expect(run(CASH_TO_BTC, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.btcDisabled",
    })
    expect(invoicesMade(fake)).toBe(0)
  })
})

describe("prepareConversion, BTC -> cash (useSwap's prepareBtcToUsd)", () => {
  // The pay leg is a BTC-wallet bolt11 send, open since ENG-720 (spec v0.2.11
  // §5.1): sendPayment keeps Confirm disarmed when it may already have left.
  it("makes a no-amount USD invoice on the cash wallet, then probes it with the Breez probe", async () => {
    const fake = setup()

    const action = prepared(await run(BTC_TO_CASH, fake))

    expect(fake.actions.lnUsdInvoiceCreate).toHaveBeenCalledWith({
      walletId: "my-usd",
      amount: 0,
      memo: SWAP_MEMO.btcToCash,
    })
    const { paymentRequest } = await fake.actions.lnUsdInvoiceCreate.mock.results[0].value
    expect(fake.btcRail.probeFee).toHaveBeenCalledWith({
      paymentType: "lightning",
      paymentRequest,
      amountSats: 10_000,
    })
    expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).not.toHaveBeenCalled()
    expect(fake.btcRail.createInvoice).not.toHaveBeenCalled()
    expect(action.summary).toMatchObject({ toWallet: "USD", sourceWallet: "BTC" })
    // The cash wallet takes no fee for receiving: no line for what arrives.
    expect(action.summary).not.toHaveProperty("receiveText")
    expect(action.dispatch?.match).toEqual({ kind: "btcRail" })
    expect(action.dispatch?.sourceWalletCurrency).toBe("BTC")
  })

  it("executes the pay leg only, through the rail, journaled first", async () => {
    const fake = setup()
    const action = prepared(await run(BTC_TO_CASH, fake))
    const before = invoicesMade(fake)

    const { outcome, journalDispatch } = confirm(action)
    await expect(outcome).resolves.toEqual({ status: "succeeded" })

    expect(invoicesMade(fake)).toBe(before)
    const { paymentRequest } = await fake.actions.lnUsdInvoiceCreate.mock.results[0].value
    expect(fake.btcRail.payInvoice).toHaveBeenCalledWith(paymentRequest, 10_000)
    expect(journalDispatch).toHaveBeenCalledWith(null)
  })

  it("disarms the card when the payment may have left (ENG-720), offering no re-prepare", async () => {
    for (const answer of [
      () => Promise.resolve({ success: false, error: "socket", outcomeUnknown: true }),
      () => Promise.reject(new Error("bridge")),
    ]) {
      const fake = setup()
      fake.btcRail.payInvoice.mockImplementation(answer)
      const action = prepared(await run(BTC_TO_CASH, fake))

      await expect(confirm(action).outcome).resolves.toEqual({
        status: "unknown",
        replyKey: "Assistant.checkHistory",
        next: "checkHistory",
      })
    }
  })

  it("sends nothing, and offers a fresh prepare, when the payment cannot be written down", async () => {
    const fake = setup()
    const action = prepared(await run(BTC_TO_CASH, fake))
    const journalDispatch = jest.fn(async (): Promise<void> => {
      throw new Error("disk full")
    })

    await expect(
      action.execute({ attempt: action.attempt, journalDispatch }),
    ).resolves.toEqual({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "reprepare",
    })
    expect(fake.btcRail.payInvoice).not.toHaveBeenCalled()
    expect(UNRECORDED_INVOICE_SEND).toMatch(/not sent/)
  })

  it("names the conversion by its request, not the invoice minted for it", async () => {
    const fake = setup()

    const first = prepared(await run(BTC_TO_CASH, fake))
    const second = prepared(await run(BTC_TO_CASH, fake))

    expect(second.dispatch?.paymentDetailHash).toBe(first.dispatch?.paymentDetailHash)
    const cashToBtc = prepared(await run(CASH_TO_BTC, fake))
    expect(cashToBtc.dispatch?.paymentDetailHash).not.toBe(
      first.dispatch?.paymentDetailHash,
    )
  })
})

describe("prepareConversion through the executor (spec §5.1)", () => {
  // The executor, the journal, the reconciler and prepareConversion all
  // real. Each card mints its own invoice; the request is what makes two
  // cards one conversion (hashConversion).
  const wire = () => {
    const fake = setup()
    let clock = NOW_MS
    const now = () => clock
    fake.ctx.now = now
    const journal = createAttemptJournal({ storage: memoryStorage() })
    const reconcile = jest.fn(
      createTransactionListReconciler({ graphql: fake.graphql as never, now }),
    )
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal,
      reconcile,
      telemetry: recordingTelemetry().telemetry,
      now,
    })
    return {
      fake,
      journal,
      reconcile,
      executor,
      advance: (ms: number) => {
        clock += ms
      },
    }
  }

  it("gives one conversion for two cards confirmed together; the second is already sent", async () => {
    const { fake, executor } = wire()
    const first = prepared(await run(CASH_TO_BTC, fake))
    const second = prepared(await run(CASH_TO_BTC, fake))
    executor.addPrepared(first, "text")
    executor.addPrepared(second, "text")

    const [one, two] = await Promise.all([
      executor.executePreparedAction(first.id),
      executor.executePreparedAction(second.id),
    ])

    expect(one).toMatchObject({ kind: "executed", outcome: { status: "succeeded" } })
    expect(two).toEqual({
      kind: "alreadySent",
      actionId: second.id,
      replyKey: "Assistant.alreadySent",
    })
    expect(fake.mutations.lnInvoicePaymentSend).toHaveBeenCalledTimes(1)
  })

  it("blocks the same conversion asked again after a lost answer and a thread left", async () => {
    const { fake, journal, reconcile, executor, advance } = wire()
    fake.mutations.lnInvoicePaymentSend.mockRejectedValueOnce(
      new Error("Network request failed"),
    )
    const first = prepared(await run(CASH_TO_BTC, fake))
    executor.addPrepared(first, "text")
    await expect(executor.executePreparedAction(first.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    executor.leaveThread("thread-1")
    // It landed, as lnflash/flash lists it: an IBEX Lightning send whose
    // payment hash is blank.
    fake.graphql.transactions.mockResolvedValue(
      page([
        graphqlTx({
          id: "ibex-swap",
          createdAt: Math.floor(NOW_MS / 1000) + 1,
          settlementAmount: -500,
          initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
          settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
        }),
      ]),
    )

    advance(3 * 60_000)
    const again = prepared(await run(CASH_TO_BTC, fake))
    executor.addPrepared(again, "text")

    await expect(executor.executePreparedAction(again.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: again.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    // The first conversion's record was consulted, and still answers for it.
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ preparedActionId: first.id }),
    )
    expect(fake.mutations.lnInvoicePaymentSend).toHaveBeenCalledTimes(1)
    await expect(journal.pending()).resolves.toEqual([
      expect.objectContaining({ preparedActionId: first.id }),
    ])
  })

  it("blocks a BTC -> cash conversion asked again while the first one's outcome is unknown", async () => {
    // A BTC-rail payment is never in the GraphQL list, so its record
    // reconciles to unknown until the day-old history check.
    const { fake, executor } = wire()
    fake.btcRail.payInvoice.mockResolvedValueOnce({
      success: false,
      error: "socket",
      outcomeUnknown: true,
    })
    const first = prepared(await run(BTC_TO_CASH, fake))
    executor.addPrepared(first, "text")
    await expect(executor.executePreparedAction(first.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "checkHistory" },
    })
    executor.leaveThread("thread-1")

    const again = prepared(await run(BTC_TO_CASH, fake))
    executor.addPrepared(again, "text")

    await expect(executor.executePreparedAction(again.id)).resolves.toMatchObject({
      kind: "pendingDispatch",
      actionId: again.id,
    })
    expect(fake.btcRail.payInvoice).toHaveBeenCalledTimes(1)
  })
})

describe("prepareConversion input", () => {
  it("converts only between the cash wallet and the BTC wallet", async () => {
    for (const [from, to] of [
      ["BTC", "BTC"],
      ["USD", "USDT"],
      ["USDT", "USD"],
    ] as const) {
      await expect(
        run({ from, to, amount: "5", currency: "USD" }, setup()),
      ).resolves.toEqual({
        kind: "error",
        userMessage: "Assistant.invalidArguments",
      })
    }
  })
})
