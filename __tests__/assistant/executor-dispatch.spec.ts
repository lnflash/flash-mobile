import {
  RECONCILE_MIN_AGE_MS,
  RECONCILE_STALE_AFTER_MS,
} from "@app/assistant/engine/reconcile"
import { PaymentSendResult } from "@app/graphql/generated"
import {
  DISPATCH,
  lostResponse,
  makeAction,
  SENT,
  setupExecutor,
  setupSendingExecutor,
} from "./executor-harness"
import { graphqlTx, page } from "./fakes"

// The executor against earlier dispatches of the same payment
// (docs/ai-assistant-tool-registry.md §5 "Idempotency", §5.1 "Process
// death"): a retry under the same key, a dispatch whose action is still
// held, Confirms of one payment given together, and a dispatch the
// transaction list cannot settle. Most cases run the real journal, the real
// reconciler and the real sendPayment (setupSendingExecutor), not a scripted
// verdict.

/** Let every pending promise callback run. */
const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })

describe("an earlier dispatch of the same payment, with the real journal and reconciler", () => {
  it("waits out a retry under the same key before calling the payment absent", async () => {
    // spec §5.1: A's first dispatch at t0 and its retry at t0 + 150 s both
    // lose their answer. At t0 + 170 s the first is old enough to call
    // absent, but the retry can still land: a new key for B then would
    // pay twice (ENG-533).
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    run.advance(150_000)
    await run.executor.executePreparedAction(a.id)
    const [key] = run.keysSent()
    expect(run.keysSent()).toEqual([key, key])
    // A's card goes; only its record answers for the payment now.
    run.executor.leaveThread("thread-a")

    run.advance(20_000)
    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")
    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(2)

    // Once the retry is as old as the first had to be, and the list read
    // back to the first dispatch does not show it, B goes under a new key.
    run.advance(RECONCILE_MIN_AGE_MS - 20_000)
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)
    await expect(run.executor.executePreparedAction(b.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    expect(run.keysSent()).toHaveLength(3)
    expect(run.keysSent()[2]).not.toBe(key)
    await expect(run.journal.pending()).resolves.toEqual([])
  })

  it("says already sent when the list shows the payment the retry made", async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    run.advance(150_000)
    await run.executor.executePreparedAction(a.id)
    run.executor.leaveThread("thread-a")
    run.graphql.transactions.mockResolvedValue(
      page([
        graphqlTx({
          id: "landed",
          createdAt: Math.floor(run.now() / 1000),
          initiationVia: {
            __typename: "InitiationViaIntraLedger",
            counterPartyWalletId: "alice-wallet",
            counterPartyUsername: "alice",
          },
          settlementVia: {
            __typename: "SettlementViaIntraLedger",
            counterPartyWalletId: "alice-wallet",
            counterPartyUsername: "alice",
          },
        }),
      ]),
    )

    run.advance(20_000)
    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "alreadySent",
      actionId: b.id,
      replyKey: "Assistant.alreadySent",
    })
    expect(run.keysSent()).toHaveLength(2)
    await expect(run.journal.pending()).resolves.toEqual([])
  })
})

describe("an earlier dispatch whose action is still held (spec §5, Idempotency)", () => {
  // A's send lost its answer: A is unresolved, and its own card retries it
  // under its key. B is a new card for the same payment. Five minutes on,
  // the list would call A's dispatch absent were it asked.
  const unresolvedAndANewCard = async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementationOnce(lostResponse)
    const a = run.prepare()
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    run.advance(5 * 60_000)
    const b = run.prepare()
    run.executor.addPrepared(b, "text")
    return { run, a, b }
  }

  const cases: {
    order: "A's retry first" | "B's Confirm first"
    retry: "is lost again" | "goes through"
    bGets: "pendingDispatch" | "alreadySent"
  }[] = [
    { order: "A's retry first", retry: "is lost again", bGets: "pendingDispatch" },
    { order: "A's retry first", retry: "goes through", bGets: "alreadySent" },
    { order: "B's Confirm first", retry: "is lost again", bGets: "pendingDispatch" },
    { order: "B's Confirm first", retry: "goes through", bGets: "pendingDispatch" },
  ]
  cases.forEach(({ order, retry, bGets }) =>
    it(`sends once when A's retry and B are confirmed together, ${order}, and the retry ${retry}`, async () => {
      const { run, a, b } = await unresolvedAndANewCard()
      run.intraLedgerUsdPaymentSend.mockImplementation(
        retry === "goes through" ? async () => SENT : lostResponse,
      )
      const taps = order === "A's retry first" ? [a, b] : [b, a]

      const [first, second] = await Promise.all(
        taps.map((action) => run.executor.executePreparedAction(action.id)),
      )
      const results = { [taps[0].id]: first, [taps[1].id]: second }

      // One send since the first: A's retry, under A's own key.
      const [key] = run.keysSent()
      expect(run.keysSent()).toEqual([key, key])
      expect(results[a.id]).toMatchObject({ kind: "executed", actionId: a.id })
      expect(results[b.id]).toMatchObject({ kind: bGets, actionId: b.id })
      // A's record was never reconciled, and so never cleared, while A could
      // still be retried.
      expect(run.reconcile).not.toHaveBeenCalled()
    }),
  )

  it("is not reconciled, nor cleared, while its card is open", async () => {
    const { run, a, b } = await unresolvedAndANewCard()

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.reconcile).not.toHaveBeenCalled()
    expect(
      (await run.journal.pending()).map((record) => record.preparedActionId),
    ).toEqual([a.id])
    // A's card still retries it, under its key.
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)
    await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    const [key] = run.keysSent()
    expect(run.keysSent()).toEqual([key, key])
  })

  it("is reconciled once its card is gone", async () => {
    const { run, b } = await unresolvedAndANewCard()
    run.executor.leaveThread("thread-1")
    const again = run.prepare("thread-2")
    run.executor.addPrepared(again, "text")
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    // The list is read in full, five minutes on, and does not show it.
    await expect(run.executor.executePreparedAction(again.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    expect(run.reconcile).toHaveBeenCalledTimes(1)
    expect(b.execute).not.toHaveBeenCalled()
  })
})

describe("Confirms of one payment, one at a time", () => {
  it("lets a second card for the payment wait, and send nothing once the first went through", async () => {
    const run = setupSendingExecutor()
    let answer: (value: unknown) => void = () => undefined
    run.intraLedgerUsdPaymentSend.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const a = run.prepare()
    const b = run.prepare()
    run.executor.addPrepared(a, "text")
    run.executor.addPrepared(b, "text")

    const confirmA = run.executor.executePreparedAction(a.id)
    const confirmB = run.executor.executePreparedAction(b.id)
    await flush()
    // A is on the wire; B waits for its outcome before reading anything.
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
    expect(b.execute).not.toHaveBeenCalled()
    answer(SENT)

    await expect(confirmA).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    // B was tapped before A's outcome was known: it was the same payment.
    await expect(confirmB).resolves.toEqual({
      kind: "alreadySent",
      actionId: b.id,
      replyKey: "Assistant.alreadySent",
    })
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
    await expect(run.executor.canConfirm(b.id)).resolves.toMatchObject({
      enabled: false,
    })
  })

  it("blocks the second card while the first's outcome is unknown", async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare()
    const b = run.prepare()
    run.executor.addPrepared(a, "text")
    run.executor.addPrepared(b, "text")

    const [resultA, resultB] = await Promise.all([
      run.executor.executePreparedAction(a.id),
      run.executor.executePreparedAction(b.id),
    ])

    expect(resultA).toMatchObject({ kind: "executed", outcome: { status: "unknown" } })
    expect(resultB).toMatchObject({ kind: "pendingDispatch", actionId: b.id })
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
  })

  it("lets the second card send after the first failed, since nothing moved", async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend
      .mockResolvedValueOnce({
        data: {
          intraLedgerUsdPaymentSend: {
            status: PaymentSendResult.Failure,
            errors: [{ message: "Insufficient balance" }],
          },
        },
      })
      .mockResolvedValueOnce(SENT)
    const a = run.prepare()
    const b = run.prepare()
    run.executor.addPrepared(a, "text")
    run.executor.addPrepared(b, "text")

    const [resultA, resultB] = await Promise.all([
      run.executor.executePreparedAction(a.id),
      run.executor.executePreparedAction(b.id),
    ])

    expect(resultA).toMatchObject({ outcome: { status: "failed" } })
    expect(resultB).toMatchObject({ outcome: { status: "succeeded" } })
    expect(new Set(run.keysSent()).size).toBe(2)
  })

  it("sends a later Confirm of the same payment as a payment of its own", async () => {
    // Only a Confirm tapped while another of its payment was running is
    // taken for that payment. Paying alice $5 twice, one after the other,
    // is two payments.
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)
    const a = run.prepare()
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    const b = run.prepare()
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(2)
  })

  it("does not hold up a Confirm of another payment", async () => {
    const { executor } = setupExecutor()
    const slow = makeAction({ execute: jest.fn(() => new Promise<never>(() => {})) })
    const other = makeAction({
      dispatch: { ...DISPATCH, paymentDetailHash: "hash:bob:500:USD" },
    })
    executor.addPrepared(slow, "text")
    executor.addPrepared(other, "text")

    executor.executePreparedAction(slow.id)
    await expect(executor.executePreparedAction(other.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
  })
})

describe("a dispatch the list cannot settle (spec §5.1)", () => {
  // A's send lost its answer and its card is gone. Since then more than
  // RECONCILE_MAX_PAGES pages of other payments came in, so the list never
  // reads back far enough to settle A's dispatch either way.
  const lostAndBuried = async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    run.graphql.transactions.mockImplementation(async ({ after }: { after?: string }) => {
      const index = Number(after ?? 0)
      const newest = Math.floor(run.now() / 1000)
      return page(
        Array.from({ length: 20 }, (_, i) =>
          graphqlTx({
            id: `in-${index}-${i}`,
            createdAt: newest - index * 20 - i,
            direction: "RECEIVE",
            settlementAmount: 100,
          }),
        ),
        String(index + 1),
      )
    })
    return { run, a }
  }

  const confirmNew = (run: ReturnType<typeof setupSendingExecutor>, options = {}) => {
    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")
    return { b, result: run.executor.executePreparedAction(b.id, options) }
  }

  it("lets the user clear a day-old dispatch on their word that their history does not show it", async () => {
    const { run, a } = await lostAndBuried()
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_STALE_AFTER_MS)
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const { b, result } = confirmNew(run)
    await expect(result).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: true,
    })
    expect(run.keysSent()).toHaveLength(1)
    expect(
      (await run.journal.pending()).map((record) => record.preparedActionId),
    ).toEqual([a.id])

    await expect(
      run.executor.executePreparedAction(b.id, { historyChecked: true }),
    ).resolves.toMatchObject({ kind: "executed", outcome: { status: "succeeded" } })
    expect(run.keysSent()).toHaveLength(2)
    expect(run.keysSent()[1]).not.toBe(run.keysSent()[0])
    await expect(run.journal.pending()).resolves.toEqual([])
  })

  it("does not take the user's word for a dispatch less than a day old", async () => {
    const { run, a } = await lostAndBuried()
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_STALE_AFTER_MS - 1)

    const { b, result } = confirmNew(run, { historyChecked: true })

    await expect(result).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    expect(
      (await run.journal.pending()).map((record) => record.preparedActionId),
    ).toEqual([a.id])
  })

  it("counts the day from the latest retry", async () => {
    const { run, a } = await lostAndBuried()
    run.advance(RECONCILE_STALE_AFTER_MS - 60 * 60_000)
    await run.executor.executePreparedAction(a.id)
    run.executor.leaveThread("thread-a")
    run.advance(60 * 60_000)

    const { result } = confirmNew(run, { historyChecked: true })

    await expect(result).resolves.toMatchObject({
      kind: "pendingDispatch",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(2)
  })

  it("never offers it while the dispatch's card is open", async () => {
    const { run } = await lostAndBuried()
    run.advance(RECONCILE_STALE_AFTER_MS)

    const { result } = confirmNew(run, { historyChecked: true })

    await expect(result).resolves.toMatchObject({
      kind: "pendingDispatch",
      historyCheckable: false,
    })
    expect(run.reconcile).not.toHaveBeenCalled()
    expect(run.keysSent()).toHaveLength(1)
  })
})
