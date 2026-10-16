import { cardOf, validateCard } from "@app/assistant/cards/types"
import { createAttemptJournal } from "@app/assistant/engine/attempt-journal"
import { createExecutor } from "@app/assistant/engine/executor"
import {
  createTransactionListReconciler,
  RECONCILE_STALE_AFTER_MS,
} from "@app/assistant/engine/reconcile"
import {
  OFFER_ALREADY_EXECUTED,
  prepareCashoutRun,
  PrepareCashoutArgs,
} from "@app/assistant/registry/actions/prepare-cashout"
import type {
  ExecuteContext,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { memoryStorage } from "../executor-harness"
import {
  fakeActionCtx,
  graphqlTx,
  JMD_PRICE,
  NOW_MS,
  page,
  recordingTelemetry,
  USD_PRICE,
  wallet,
} from "../fakes"

/** An offer's expiry as the API sends it: ms, through a scalar documented as seconds. */
const OFFER_EXPIRES_AT = NOW_MS + 600_000

const OFFER = {
  __typename: "CashoutOffer",
  offerId: "offer-1",
  walletId: "my-usd",
  send: 10_000,
  flashFee: 200,
  receiveUsd: null,
  receiveJmd: 1_538_600,
  exchangeRate: 15_700,
  expiresAt: OFFER_EXPIRES_AT,
}

const ACCOUNTS = [
  {
    __typename: "BankAccount",
    id: "jm-1",
    bankName: "NCB",
    accountNumber: "000123454321",
    currency: "JMD",
    isDefault: true,
  },
  {
    __typename: "BankAccount",
    id: "us-1",
    bankName: "Chase",
    accountNumber: "9999888877",
    currency: "USD",
    isDefault: false,
  },
]

/** $500 in cash; the account may settle; the offer above comes back. */
const setup = ({
  display = "USD",
  bankPayout = true,
}: { display?: "USD" | "JMD"; bankPayout?: boolean } = {}) => {
  const fake = fakeActionCtx({ displayCurrency: display })
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: 50_000 }),
  ])
  fake.graphql.realtimePrice.mockResolvedValue(display === "USD" ? USD_PRICE : JMD_PRICE)
  fake.actions.accountCapabilities.mockResolvedValue({ bankPayout })
  fake.actions.bankAccounts.mockResolvedValue(ACCOUNTS)
  fake.actions.requestCashout.mockResolvedValue(OFFER)
  fake.actions.initiateCashout.mockResolvedValue({ id: "cashout-1", errors: [] })
  return fake
}

const prepared = (result: ToolResult<unknown>): PreparedAction => {
  if (result.kind !== "prepared")
    throw new Error(`not prepared: ${JSON.stringify(result)}`)
  return result.preparedAction
}

const run = (args: PrepareCashoutArgs, fake: ReturnType<typeof setup>) =>
  prepareCashoutRun(args, fake.ctx)

const confirm = (action: PreparedAction) => {
  const ctx: ExecuteContext = {
    attempt: action.attempt,
    journalDispatch: jest.fn(async (): Promise<void> => undefined),
  }
  return action.execute(ctx)
}

const HUNDRED: PrepareCashoutArgs = { amount: "100", currency: "USD" }

describe("prepareCashout", () => {
  it("asks for no offer at all when the server says the account may not settle", async () => {
    const fake = setup({ bankPayout: false })

    await expect(run(HUNDRED, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.cashoutUnavailable",
    })
    expect(fake.actions.requestCashout).not.toHaveBeenCalled()
    expect(fake.actions.bankAccounts).not.toHaveBeenCalled()
  })

  it("asks for an offer for the amount, to the settle screen's pick of account, from the cash wallet", async () => {
    const fake = setup()

    prepared(await run(HUNDRED, fake))

    expect(fake.actions.requestCashout).toHaveBeenCalledWith({
      amount: 10_000,
      bankAccountId: "jm-1",
      walletId: "my-usd",
    })
  })

  it("maps the offer onto the card, the bank label from the bank-accounts query", async () => {
    const fake = setup()

    const action = prepared(await run(HUNDRED, fake))

    expect(action.intent).toBe("prepareCashout")
    expect(action.summary).toEqual({
      type: "cashoutOffer",
      amountText: "USD 10000",
      feeText: "USD 200",
      receiveText: "J$15386.00",
      bankLabel: "NCB ••4321",
    })
    expect(validateCard(cardOf(action)).valid).toBe(true)
  })

  it("expires when the offer does, read in ms as the API sends it", async () => {
    const action = prepared(await run(HUNDRED, setup()))

    expect(action.expiresAt).toBe(OFFER_EXPIRES_AT)
  })

  it("writes a USD payout, with its JMD alongside when there is one, as the settle screen does", async () => {
    const fake = setup()
    fake.actions.requestCashout.mockResolvedValueOnce({
      ...OFFER,
      receiveUsd: 9_800,
      receiveJmd: null,
    })
    fake.actions.requestCashout.mockResolvedValueOnce({ ...OFFER, receiveUsd: 9_800 })

    expect(prepared(await run(HUNDRED, fake)).summary.receiveText).toBe("USD 9800")
    expect(prepared(await run(HUNDRED, fake)).summary.receiveText).toBe(
      "USD 9800 (J$15386.00)",
    )
  })

  it("settles to the account the call names", async () => {
    const fake = setup()

    const action = prepared(await run({ ...HUNDRED, bankAccountId: "us-1" }, fake))

    expect(fake.actions.requestCashout).toHaveBeenCalledWith(
      expect.objectContaining({ bankAccountId: "us-1" }),
    )
    expect(action.summary.bankLabel).toBe("Chase ••8877")
  })

  it("refuses an account that is not the user's, and says so when there is none", async () => {
    const fake = setup()
    await expect(
      run({ ...HUNDRED, bankAccountId: "someone-else" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.invalidArguments",
    })
    fake.actions.bankAccounts.mockResolvedValue([])
    await expect(run(HUNDRED, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.noBankAccount",
    })
    expect(fake.actions.requestCashout).not.toHaveBeenCalled()
  })

  it("refuses more than the cash balance with the shortfall card, asking for no offer", async () => {
    const fake = setup()

    await expect(run({ amount: "500.01", currency: "USD" }, fake)).rejects.toMatchObject({
      reason: "insufficientBalance",
    })
    expect(fake.actions.requestCashout).not.toHaveBeenCalled()
  })

  it("reads a bare amount in the display currency, in whole US cents", async () => {
    const fake = setup({ display: "JMD" })

    // J$15,700 is $100.00 at J$157 to the dollar.
    prepared(await run({ amount: "15700" }, fake))

    expect(fake.actions.requestCashout).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10_000 }),
    )
  })

  it("executes initiateCashout with the offer's id and wallet", async () => {
    const fake = setup()
    const action = prepared(await run(HUNDRED, fake))

    await expect(confirm(action)).resolves.toEqual({ status: "succeeded" })
    expect(fake.actions.initiateCashout).toHaveBeenCalledWith({
      offerId: "offer-1",
      walletId: "my-usd",
    })
  })

  it("is single use: a second Confirm sends nothing, whatever the first did", async () => {
    const fake = setup()
    fake.actions.initiateCashout.mockResolvedValue({
      id: null,
      errors: [{ code: "PAYMENT_FAILED", message: "Bank declined" }],
    })
    const action = prepared(await run(HUNDRED, fake))

    await expect(confirm(action)).resolves.toEqual({
      status: "failed",
      replyKey: "Assistant.cashoutFailed",
      next: "reprepare",
    })
    await expect(confirm(action)).resolves.toMatchObject({ status: "unknown" })
    expect(fake.actions.initiateCashout).toHaveBeenCalledTimes(1)
  })

  it("points to the history when the offer was already used, the answer was lost, or it said nothing", async () => {
    const used = setup()
    used.actions.initiateCashout.mockResolvedValue({
      id: null,
      errors: [
        { code: OFFER_ALREADY_EXECUTED, message: "This offer has already been used." },
      ],
    })
    const lost = setup()
    lost.actions.initiateCashout.mockRejectedValue(new Error("Network request failed"))
    // Neither an id nor an error: nothing says the offer did not go.
    const silent = setup()
    silent.actions.initiateCashout.mockResolvedValue({ id: null, errors: [] })

    for (const fake of [used, lost, silent]) {
      await expect(confirm(prepared(await run(HUNDRED, fake)))).resolves.toEqual({
        status: "unknown",
        replyKey: "Assistant.checkHistory",
        next: "checkHistory",
      })
    }
  })

  it("refreshes into a new offer", async () => {
    const fake = setup()
    const action = prepared(await run(HUNDRED, fake))

    await action.refresh()

    expect(fake.actions.requestCashout).toHaveBeenCalledTimes(2)
  })
})

describe("prepareCashout through the executor", () => {
  it("retires the offer after a failure, and disarms it after an unknown outcome", async () => {
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal: createAttemptJournal({ storage: memoryStorage() }),
      reconcile: jest.fn(async () => "unknown" as const),
      telemetry: recordingTelemetry().telemetry,
      now: () => NOW_MS,
    })
    const failing = setup()
    failing.actions.initiateCashout.mockResolvedValue({
      id: null,
      errors: [{ code: "X" }],
    })
    const retired = prepared(await run(HUNDRED, failing))
    const lost = setup()
    lost.actions.initiateCashout.mockRejectedValue(new Error("Network request failed"))
    const disarmed = prepared(await run(HUNDRED, lost))
    executor.addPrepared(retired, "text")
    executor.addPrepared(disarmed, "text")

    await executor.executePreparedAction(retired.id)
    await executor.executePreparedAction(disarmed.id)

    await expect(executor.executePreparedAction(retired.id)).resolves.toMatchObject({
      kind: "notFound",
    })
    await expect(executor.executePreparedAction(disarmed.id)).resolves.toMatchObject({
      kind: "disarmed",
    })
    expect(failing.actions.initiateCashout).toHaveBeenCalledTimes(1)
    expect(lost.actions.initiateCashout).toHaveBeenCalledTimes(1)
  })
})

describe("prepareCashout's identity as a settlement (spec §5.1)", () => {
  it("names the request, not the offer: two offers for the same request are one settlement", async () => {
    const fake = setup()
    fake.actions.requestCashout
      .mockResolvedValueOnce(OFFER)
      .mockResolvedValueOnce({ ...OFFER, offerId: "offer-2", flashFee: 250 })

    const first = prepared(await run(HUNDRED, fake))
    const second = prepared(await run(HUNDRED, fake))

    expect(first.dispatch).toEqual({
      paymentDetailHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      match: { kind: "cashout" },
      // The cash wallet it leaves.
      sourceWalletCurrency: "USD",
    })
    expect(second.dispatch?.paymentDetailHash).toBe(first.dispatch?.paymentDetailHash)
  })

  it("is another settlement for another bank account or another amount", async () => {
    const fake = setup()

    const hundred = prepared(await run(HUNDRED, fake))
    const toChase = prepared(await run({ ...HUNDRED, bankAccountId: "us-1" }, fake))
    const fifty = prepared(await run({ amount: "50", currency: "USD" }, fake))

    expect(toChase.dispatch?.paymentDetailHash).not.toBe(
      hundred.dispatch?.paymentDetailHash,
    )
    expect(fifty.dispatch?.paymentDetailHash).not.toBe(
      hundred.dispatch?.paymentDetailHash,
    )
  })

  it("is the same settlement for a display-currency amount whatever the rate does", async () => {
    // J$15,700 at J$157 and then at J$158 to the dollar: other cents, the
    // same request.
    const fake = setup({ display: "JMD" })
    const first = prepared(await run({ amount: "15700" }, fake))
    fake.graphql.realtimePrice.mockResolvedValue({
      ...JMD_PRICE,
      usdCentPrice: { ...JMD_PRICE.usdCentPrice, base: 158_000_000 },
    })
    const second = prepared(await run({ amount: "15700" }, fake))

    expect(fake.actions.requestCashout.mock.calls.map(([input]) => input.amount)).toEqual(
      [10_000, 9_936],
    )
    expect(second.dispatch?.paymentDetailHash).toBe(first.dispatch?.paymentDetailHash)
  })

  it("writes the settlement down before it goes, and sends nothing when it cannot", async () => {
    const fake = setup()
    const order: string[] = []
    fake.actions.initiateCashout.mockImplementation(async () => {
      order.push("settle")
      return { id: "cashout-1", errors: [] }
    })
    const action = prepared(await run(HUNDRED, fake))
    const journalDispatch = jest.fn(async (key: string | null) => {
      order.push(`journal:${key}`)
    })

    await expect(
      action.execute({ attempt: action.attempt, journalDispatch }),
    ).resolves.toEqual({ status: "succeeded" })
    expect(order).toEqual(["journal:null", "settle"])

    const unrecorded = prepared(await run(HUNDRED, fake))
    await expect(
      unrecorded.execute({
        attempt: unrecorded.attempt,
        journalDispatch: jest.fn(async () => {
          throw new Error("disk full")
        }),
      }),
    ).resolves.toEqual({
      status: "failed",
      replyKey: "Assistant.cashoutFailed",
      next: "reprepare",
    })
    expect(fake.actions.initiateCashout).toHaveBeenCalledTimes(1)
  })
})

describe("prepareCashout's settlements through the executor, journal and reconciler", () => {
  const wire = () => {
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
    })
    let offers = 0
    fake.actions.requestCashout.mockImplementation(async () => {
      offers += 1
      return { ...OFFER, offerId: `offer-${offers}`, expiresAt: clock + 600_000 }
    })
    fake.ctx.now = now
    const settledOffers = () =>
      fake.actions.initiateCashout.mock.calls.map(([input]) => input.offerId)
    const advance = (ms: number) => {
      clock += ms
    }
    return { fake, executor, journal, settledOffers, advance }
  }

  /** An answer the test hands out when it chooses. */
  const deferred = <T>() => {
    let resolve: (value: T) => void = () => undefined
    let reject: (reason: unknown) => void = () => undefined
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it("settles once when two cards for the same amount are confirmed together", async () => {
    const { fake, executor, settledOffers } = wire()
    const answer = deferred<{ id: string; errors: never[] }>()
    fake.actions.initiateCashout.mockReturnValueOnce(answer.promise)
    const a = prepared(await run(HUNDRED, fake))
    const b = prepared(await run(HUNDRED, fake))
    executor.addPrepared(a, "text")
    executor.addPrepared(b, "text")

    const confirmA = executor.executePreparedAction(a.id)
    const confirmB = executor.executePreparedAction(b.id)
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    // B waits behind A: only A's offer has gone to the server.
    expect(settledOffers()).toEqual(["offer-1"])
    answer.resolve({ id: "cashout-1", errors: [] })

    await expect(confirmA).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    await expect(confirmB).resolves.toEqual({
      kind: "alreadySent",
      actionId: b.id,
      replyKey: "Assistant.alreadySent",
    })
    expect(settledOffers()).toEqual(["offer-1"])
  })

  it("keeps the second card back while the first's answer is lost", async () => {
    const { fake, executor, settledOffers } = wire()
    fake.actions.initiateCashout.mockRejectedValueOnce(
      new Error("Network request failed"),
    )
    const a = prepared(await run(HUNDRED, fake))
    const b = prepared(await run(HUNDRED, fake))
    executor.addPrepared(a, "text")
    executor.addPrepared(b, "text")

    const [resultA, resultB] = await Promise.all([
      executor.executePreparedAction(a.id),
      executor.executePreparedAction(b.id),
    ])

    expect(resultA).toMatchObject({
      outcome: { status: "unknown", next: "checkHistory" },
    })
    expect(resultB).toMatchObject({ kind: "pendingDispatch", historyCheckable: false })
    expect(settledOffers()).toEqual(["offer-1"])
  })

  it("blocks asking again after a lost answer until the user has checked their history", async () => {
    const { fake, executor, journal, settledOffers, advance } = wire()
    fake.actions.initiateCashout
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue({ id: "cashout-2", errors: [] })
    const first = prepared(await run(HUNDRED, fake))
    executor.addPrepared(first, "text")
    await executor.executePreparedAction(first.id)
    executor.leaveThread("thread-1")
    // The settlement went out as an IBEX payment: a row that names nothing.
    fake.graphql.transactions.mockResolvedValue(
      page([
        graphqlTx({
          id: "ibex-settle",
          createdAt: Math.floor(NOW_MS / 1000) + 1,
          settlementAmount: -10_000,
          initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
          settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
        }),
      ]),
    )

    // Asked again at once, and three minutes on: a new offer each time, and
    // neither goes while the first may have.
    for (const wait of [0, 3 * 60_000]) {
      advance(wait)
      const again = prepared(await run(HUNDRED, fake))
      executor.addPrepared(again, "text")
      await expect(executor.executePreparedAction(again.id)).resolves.toEqual({
        kind: "pendingDispatch",
        actionId: again.id,
        replyKey: "Assistant.checkHistory",
        historyCheckable: false,
      })
    }
    expect(settledOffers()).toEqual(["offer-1"])

    // A day on, the user's word that the history does not show it clears it.
    advance(RECONCILE_STALE_AFTER_MS)
    const later = prepared(await run(HUNDRED, fake))
    executor.addPrepared(later, "text")
    await expect(executor.executePreparedAction(later.id)).resolves.toMatchObject({
      kind: "pendingDispatch",
      historyCheckable: true,
    })
    await expect(
      executor.executePreparedAction(later.id, { historyChecked: true }),
    ).resolves.toMatchObject({ kind: "executed", outcome: { status: "succeeded" } })
    expect(settledOffers()).toEqual(["offer-1", "offer-4"])
    await expect(journal.pending()).resolves.toEqual([])
  })
})
