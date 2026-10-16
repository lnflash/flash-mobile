import { cardOf, validateCard } from "@app/assistant/cards/types"
import {
  prepareConversionRun,
  PrepareConversionArgs,
  SWAP_MEMO,
} from "@app/assistant/registry/actions/prepare-conversion"
import { FEE_PROBE_TTL_MS } from "@app/assistant/registry/actions/shared/expiry"
import { BREEZ_SEND_GATES } from "@app/assistant/registry/actions/shared/gates"
import type {
  ExecuteContext,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import { resetIdempotencyKeySupport } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { bolt11, fakeActionCtx, NOW_MS, paymentHashOf, USD_PRICE, wallet } from "../fakes"

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
  })

  it("counts the BTC wallet's receive fee in the fee line, as the conversion screen does", async () => {
    const fake = setup()

    const action = prepared(await run(CASH_TO_BTC, fake))

    // 3 cents to send, 20 sats (1.26 cents) to receive.
    expect(action.summary.feeText).toBe("USD 4.26")
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
    // A new invoice is a new payment: the executor shows the refreshed card
    // rather than run it unseen.
    expect(refreshed.dispatch?.paymentDetailHash).not.toBe(
      action.dispatch?.paymentDetailHash,
    )
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
  it("answers the not-available card, making no invoice, while ENG-720 gates BTC-wallet bolt11 sends", async () => {
    const fake = setup()

    await expect(run(BTC_TO_CASH, fake)).rejects.toMatchObject({
      reason: "notAvailableYet",
    })
    expect(invoicesMade(fake)).toBe(0)
    expect(fake.btcRail.probeFee).not.toHaveBeenCalled()
  })

  describe("once ENG-720 opens the bolt11 branch", () => {
    const gate = BREEZ_SEND_GATES.lightning
    beforeEach(() => {
      BREEZ_SEND_GATES.lightning = null
    })
    afterEach(() => {
      BREEZ_SEND_GATES.lightning = gate
    })

    it("makes a no-amount USD invoice on the cash wallet, then probes it with the Breez probe", async () => {
      const fake = setup()

      const action = prepared(await run(BTC_TO_CASH, fake))

      expect(fake.actions.lnUsdInvoiceCreate).toHaveBeenCalledWith({
        walletId: "my-usd",
        amount: 0,
        memo: SWAP_MEMO.btcToCash,
      })
      const { paymentRequest } = await fake.actions.lnUsdInvoiceCreate.mock.results[0]
        .value
      expect(fake.btcRail.probeFee).toHaveBeenCalledWith({
        paymentType: "lightning",
        paymentRequest,
        amountSats: 10_000,
      })
      expect(fake.actions.feeProbes.lnUsdInvoiceFeeProbe).not.toHaveBeenCalled()
      expect(fake.btcRail.createInvoice).not.toHaveBeenCalled()
      expect(action.summary).toMatchObject({ toWallet: "USD", sourceWallet: "BTC" })
      expect(action.dispatch?.match).toEqual({ kind: "btcRail" })
    })

    it("executes the pay leg only, through the rail, journaled first", async () => {
      const fake = setup()
      const action = prepared(await run(BTC_TO_CASH, fake))
      const before = invoicesMade(fake)

      const { outcome, journalDispatch } = confirm(action)
      await expect(outcome).resolves.toEqual({ status: "succeeded" })

      expect(invoicesMade(fake)).toBe(before)
      const { paymentRequest } = await fake.actions.lnUsdInvoiceCreate.mock.results[0]
        .value
      expect(fake.btcRail.payInvoice).toHaveBeenCalledWith(paymentRequest, 10_000)
      expect(journalDispatch).toHaveBeenCalledWith(null)
    })
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
