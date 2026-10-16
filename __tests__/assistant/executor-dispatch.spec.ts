import { ApolloLink, execute, gql, Observable } from "@apollo/client"

import {
  RECONCILE_MIN_AGE_MS,
  RECONCILE_PAGE_SIZE,
  RECONCILE_STALE_AFTER_MS,
} from "@app/assistant/engine/reconcile"
import { createExecutor } from "@app/assistant/engine/executor"
import type { TransactionRow } from "@app/assistant/rails/graphql-rail"
import type { ExecuteContext, ExecutionOutcome } from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import { createServerClock, ServerClock, serverClock } from "@app/graphql/server-clock"
import { i18nObject } from "@app/i18n/i18n-util"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import {
  ATTEMPT_JOURNAL_KEY,
  createAttemptJournal,
} from "@app/assistant/engine/attempt-journal"
import {
  DISPATCH,
  lostResponse,
  makeAction,
  memoryStorage,
  SENT,
  setupExecutor,
  setupSendingExecutor,
  T0,
} from "./executor-harness"
import { fundedBefore, graphqlTx, page, recordingTelemetry } from "./fakes"

// The executor against earlier dispatches of the same payment
// (docs/ai-assistant-tool-registry.md §5 "Idempotency", §5.1 "Process
// death"): a retry under the same key, a dispatch whose action is still
// held, Confirms of one payment given together, and a dispatch the
// transaction list cannot settle. Most cases run the real journal, the real
// reconciler and the real sendPayment (setupSendingExecutor), not a scripted
// verdict.

loadLocale("en")
/** The thread's replies, in English, as the cards will show them. */
const LL = i18nObject("en")

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

    // Once the retry is as old as the first had to be, and the list, which
    // shows the cash wallet's rows back past the first dispatch (the deposit
    // that funded it), does not show it, B goes under a new key.
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

describe("an earlier dispatch, over the rows lnflash/flash lists", () => {
  // Account.transactions on lnflash/flash main comes from IBEX with every
  // identifier blank: a Flash-to-Flash send is a Lightning row with
  // paymentHash "" and no counterparty (get-transactions-for-wallet.ts).
  const ibexSendSince = (nowMs: number) =>
    graphqlTx({
      id: "ibex-send",
      createdAt: Math.floor(nowMs / 1000) - 60,
      settlementAmount: -500,
      initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
      settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
    })

  it("never calls a lost send absent while the list shows a send since it that names nothing", async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_MIN_AGE_MS + 60_000)
    run.graphql.transactions.mockResolvedValue(page([ibexSendSince(run.now())]))
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
  })

  it("never calls a lost send absent when the one page the list serves is full of receipts since it", async () => {
    // lnflash/flash serves a cash wallet's newest 20 rows, with hasNextPage
    // false, and no page after them (reconcile.ts). The answer to $5 to
    // Alice is lost, the user leaves the thread, 20 receipts land, and they
    // ask for the same $5 to Alice again. The send, if it went, is the 21st
    // row: not seeing it proves nothing, so B must not go under a new key.
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_MIN_AGE_MS + 60_000)
    const newest = Math.floor(run.now() / 1000)
    run.graphql.transactions.mockResolvedValue(
      page(
        Array.from({ length: RECONCILE_PAGE_SIZE }, (_, i) => ({
          ...ibexSendSince(run.now()),
          id: `in-${i}`,
          createdAt: newest - i,
          direction: "RECEIVE" as const,
          settlementAmount: 100,
        })),
      ),
    )
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
    // A's record still answers for the payment.
    expect(
      (await run.journal.pending()).map((record) => record.preparedActionId),
    ).toEqual([a.id])
  })

  it("never calls a lost send absent when the list comes back empty, as it does for a wallet the API could not read", async () => {
    // lnflash/flash answers a failed IBEX read of a wallet with no rows and
    // no error (get-transactions-for-wallet.ts:27-35, ENG-725): on an account
    // with one cash wallet the list is empty, with no next page. The answer
    // to $5 to Alice is lost, the user leaves the thread, and asks for the
    // same $5 again while that read fails. If the first send went, a new key
    // would pay twice.
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_MIN_AGE_MS + 60_000)
    run.graphql.transactions.mockResolvedValue(page([]))
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
    expect(
      (await run.journal.pending()).map((record) => record.preparedActionId),
    ).toEqual([a.id])
  })

  it("never calls absent a dispatch recorded before the journal kept its paying wallet", async () => {
    // An earlier version of the app wrote the record, with no
    // sourceWalletCurrency, and was killed mid-send. The list now shows a
    // funded history and nothing since, which would prove a record that
    // names its wallet absent; this one cannot say whose rows to read. It
    // carries a clock offset, so the missing wallet is all that stands in
    // the way (a record with no offset is the case below).
    const storage = memoryStorage()
    const dispatchedAt = T0 - 10 * 60_000
    storage.data.set(
      ATTEMPT_JOURNAL_KEY,
      JSON.stringify([
        {
          preparedActionId: "from-an-earlier-version",
          idempotencyKey: "k-old",
          paymentDetailHash: DISPATCH.paymentDetailHash,
          dispatchedAt,
          lastDispatchedAt: dispatchedAt,
          serverClockOffsetMs: 0,
          match: DISPATCH.match,
        },
      ]),
    )
    const run = setupSendingExecutor({ storage })
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toEqual([])
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
    await expect(run.journal.pending()).resolves.toEqual([
      expect.objectContaining({
        preparedActionId: "from-an-earlier-version",
        sourceWalletCurrency: null,
      }),
    ])
  })

  it("never calls absent a dispatch recorded before the journal kept the clock offset", async () => {
    // An earlier version of the app wrote the record, with no
    // serverClockOffsetMs, and was killed mid-send. Its dispatchedAt is the
    // phone's clock, which cannot be placed among rows stamped on the
    // server's: the funded history that would prove a placed record absent
    // proves nothing about this one.
    const storage = memoryStorage()
    const dispatchedAt = T0 - 10 * 60_000
    storage.data.set(
      ATTEMPT_JOURNAL_KEY,
      JSON.stringify([
        {
          preparedActionId: "before-the-clock-offset",
          idempotencyKey: "k-old",
          paymentDetailHash: DISPATCH.paymentDetailHash,
          dispatchedAt,
          lastDispatchedAt: dispatchedAt,
          match: DISPATCH.match,
          sourceWalletCurrency: DISPATCH.sourceWalletCurrency,
        },
      ]),
    )
    const run = setupSendingExecutor({ storage })
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toEqual([])
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
    await expect(run.journal.pending()).resolves.toEqual([
      expect.objectContaining({
        preparedActionId: "before-the-clock-offset",
        serverClockOffsetMs: null,
      }),
    ])
  })

  it("never calls absent a dispatch that went before any answer showed the server's clock", async () => {
    // The executor's reader had no offset when A went out (no GraphQL
    // answer with a Date header yet), so A's record cannot place its
    // dispatch among the rows. The list shows a funded history and nothing
    // since, past the minimum age: a record with an offset would read absent.
    const run = setupSendingExecutor({ serverClockOffsetMs: () => null })
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    run.executor.leaveThread("thread-a")
    run.advance(RECONCILE_MIN_AGE_MS + 60_000)
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

    const b = run.prepare("thread-b")
    run.executor.addPrepared(b, "text")

    await expect(run.executor.executePreparedAction(b.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: b.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(run.keysSent()).toHaveLength(1)
    await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
    await expect(run.journal.pending()).resolves.toEqual([
      expect.objectContaining({ preparedActionId: a.id, serverClockOffsetMs: null }),
    ])
  })

  describe("on a phone whose clock runs five minutes fast", () => {
    // The executor journals each dispatch with the phone's clock less the
    // server's (serverClockOffsetMs). The answer to $5 to Alice is lost, the
    // user leaves the thread, and asks for the same $5 again. The list shows
    // the send, stamped on the server's clock five minutes before the
    // phone's dispatchedAt. Read on the phone's clock, it would be a row from
    // before the dispatch, which proves the cash wallet's rows read back:
    // absent, and B would pay Alice a second time under a new key.
    const FIVE_MINUTES_MS = 5 * 60_000
    /** When the first send landed: two seconds after its dispatch, on the server's clock. */
    const landedAt = Math.floor((T0 - FIVE_MINUTES_MS) / 1000) + 2

    const lostThenAskedAgain = async (listed: TransactionRow) => {
      const run = setupSendingExecutor({ serverClockOffsetMs: () => FIVE_MINUTES_MS })
      run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
      const a = run.prepare("thread-a")
      run.executor.addPrepared(a, "text")
      await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
        outcome: { status: "unknown", next: "retrySameAttempt" },
      })
      run.executor.leaveThread("thread-a")
      run.advance(RECONCILE_MIN_AGE_MS + 60_000)
      // The send, and the deposit that funded the cash wallet a day before
      // the dispatch on the server's clock.
      run.graphql.transactions.mockResolvedValue(
        page([listed, fundedBefore(T0 - FIVE_MINUTES_MS, "USD")]),
      )
      run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

      const b = run.prepare("thread-b")
      run.executor.addPrepared(b, "text")
      return { run, a, b, result: await run.executor.executePreparedAction(b.id) }
    }

    it("never sends again a payment the list shows under no name", async () => {
      const { run, a, b, result } = await lostThenAskedAgain({
        ...ibexSendSince(T0),
        createdAt: landedAt,
      })

      expect(result).toEqual({
        kind: "pendingDispatch",
        actionId: b.id,
        replyKey: "Assistant.checkHistory",
        historyCheckable: false,
      })
      expect(run.keysSent()).toHaveLength(1)
      await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
      // A's record still answers for the payment, with the offset it went with.
      await expect(run.journal.pending()).resolves.toEqual([
        expect.objectContaining({
          preparedActionId: a.id,
          dispatchedAt: T0,
          serverClockOffsetMs: FIVE_MINUTES_MS,
        }),
      ])
    })

    it("says already sent when the list names the payment", async () => {
      const toAlice = {
        counterPartyWalletId: "alice-wallet",
        counterPartyUsername: "alice",
      }
      const { run, b, result } = await lostThenAskedAgain(
        graphqlTx({
          id: "landed",
          createdAt: landedAt,
          initiationVia: { __typename: "InitiationViaIntraLedger", ...toAlice },
          settlementVia: { __typename: "SettlementViaIntraLedger", ...toAlice },
        }),
      )

      expect(result).toEqual({
        kind: "alreadySent",
        actionId: b.id,
        replyKey: "Assistant.alreadySent",
      })
      expect(run.keysSent()).toHaveLength(1)
      await expect(run.journal.pending()).resolves.toEqual([])
    })
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

    // Five minutes on, the list shows the cash wallet's rows back past the
    // dispatch (the deposit that funded it), and not the payment.
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
    // "send alice $5 for lunch" and "send alice $5 for parking": two cards,
    // and one payment to the executor, since a payment's identity leaves the
    // memo out (hashPaymentDetail).
    const run = setupSendingExecutor()
    let answer: (value: unknown) => void = () => undefined
    run.intraLedgerUsdPaymentSend.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const a = run.prepare("thread-1", { memo: "lunch" })
    const b = run.prepare("thread-1", { memo: "parking" })
    expect(b.summary).not.toEqual(a.summary)
    expect(b.dispatch).toEqual(a.dispatch)
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
    // B was tapped before A's outcome was known, for the same payment: it
    // sends nothing.
    await expect(confirmB).resolves.toEqual({
      kind: "alreadySent",
      actionId: b.id,
      replyKey: "Assistant.alreadySent",
    })
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(1)
    await expect(run.executor.canConfirm(b.id)).resolves.toMatchObject({
      enabled: false,
    })
    // B's card says only what the executor knows: a payment of this amount
    // to this recipient went. B's own, for parking, never did.
    expect(LL.Assistant.alreadySent()).toBe(
      "A payment of this amount to this person was already sent. Check your transaction history, and ask again if you meant to send another.",
    )

    // Asking again, as the reply says, sends another.
    const again = run.prepare("thread-1", { memo: "parking" })
    run.executor.addPrepared(again, "text")
    run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)
    await expect(run.executor.executePreparedAction(again.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    expect(run.intraLedgerUsdPaymentSend).toHaveBeenCalledTimes(2)
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
  // A's send lost its answer and its card is gone. Since then the cash
  // wallet took in a receipt a second, so the one page the list serves, the
  // wallet's newest 20 rows with no next page (reconcile.ts), never reads
  // back far enough to settle A's dispatch either way.
  const lostAndBuried = async () => {
    const run = setupSendingExecutor()
    run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
    const a = run.prepare("thread-a")
    run.executor.addPrepared(a, "text")
    await run.executor.executePreparedAction(a.id)
    run.graphql.transactions.mockImplementation(async () => {
      const newest = Math.floor(run.now() / 1000)
      return page(
        Array.from({ length: RECONCILE_PAGE_SIZE }, (_, i) =>
          graphqlTx({
            id: `in-${i}`,
            createdAt: newest - i,
            direction: "RECEIVE",
            settlementAmount: 100,
          }),
        ),
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

describe("the clock offset a dispatch is journaled with", () => {
  /**
   * An answer through `link`, as HttpLink gives one: the fetch Response on
   * the operation's context, carrying `date` as its Date header, then the
   * parsed result.
   */
  const answerThrough = (link: ApolloLink, date: string) =>
    new Promise<unknown>((resolve, reject) => {
      const http = new ApolloLink((operation) => {
        operation.setContext({
          response: {
            headers: {
              get: (name: string) => (name.toLowerCase() === "date" ? date : null),
            },
          },
        })
        return Observable.of({ data: { __typename: "Query" } })
      })
      execute(ApolloLink.from([link, http]), {
        query: gql`
          query ServerClockProbe {
            __typename
          }
        `,
      }).subscribe({ next: resolve, error: reject })
    })

  it("is what the app's GraphQL answers measured, for an executor given no reader", async () => {
    // client.tsx chains serverClock.link in front of the HttpLink, and an
    // executor given no serverClockOffsetMs reads serverClock.offsetMs, as
    // it reads Date.now for `now`: wiring the executor into the app
    // (ENG-689) cannot leave its records without the offset.
    const phoneClock = jest.spyOn(Date, "now").mockReturnValue(T0)
    try {
      // An answer stamped by a server whose clock is five minutes behind.
      await answerThrough(serverClock.link, new Date(T0 - 5 * 60_000).toUTCString())
      const journal = createAttemptJournal({ storage: memoryStorage() })
      const executor = createExecutor({
        auth: { availability: async () => "none", authenticate: async () => false },
        journal,
        reconcile: jest.fn(async () => "unknown" as const),
        telemetry: recordingTelemetry().telemetry,
      })
      const action = makeAction({
        execute: jest.fn(async (ctx: ExecuteContext): Promise<ExecutionOutcome> => {
          await ctx.journalDispatch("k-1")
          return {
            status: "unknown",
            replyKey: "Assistant.checkHistory",
            next: "retrySameAttempt",
          }
        }),
      })
      executor.addPrepared(action, "text")

      await executor.executePreparedAction(action.id)

      await expect(journal.pending()).resolves.toEqual([
        expect.objectContaining({
          preparedActionId: action.id,
          dispatchedAt: T0,
          serverClockOffsetMs: 5 * 60_000,
        }),
      ])
    } finally {
      phoneClock.mockRestore()
    }
  })

  describe("after the phone's clock stepped since the answer that measured it (ENG-726)", () => {
    // A GraphQL answer at T0 shows the phone's clock right (offset 0). Then
    // the phone's wall clock steps, an NTP correction or a manual change,
    // before $5 to Alice dispatches, and the answer to that send is lost.
    // The send landed: the list shows it, as IBEX lists it (naming nothing),
    // two seconds after T0 on the server's clock, below the deposit that
    // funded the cash wallet. The user leaves the thread and asks again.
    const FIVE_MINUTES_MS = 5 * 60_000
    const landed = graphqlTx({
      id: "landed",
      createdAt: Math.floor(T0 / 1000) + 2,
      settlementAmount: -500,
      initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
      settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
    })

    /**
     * The story above, with the wall clock stepping `stepMs` between the
     * answer and the dispatch. The executor reads the offset from the app's
     * kind of clock, over this case's wall and monotonic clocks, unless the
     * case hands it `offset` instead.
     */
    const lostAfterStep = async (stepMs: number, offset?: () => number | null) => {
      let monotonic = 0
      // The server clock reads the phone's wall clock, which is the executor's.
      const phone = { now: (): number => T0 }
      const clock: ServerClock = createServerClock(
        () => phone.now(),
        () => monotonic,
      )
      const run = setupSendingExecutor({ serverClockOffsetMs: offset ?? clock.offsetMs })
      phone.now = run.now
      await answerThrough(clock.link, new Date(T0).toUTCString())
      // The step moves the wall clock only.
      run.advance(stepMs)

      run.intraLedgerUsdPaymentSend.mockImplementation(lostResponse)
      const a = run.prepare("thread-a")
      run.executor.addPrepared(a, "text")
      await expect(run.executor.executePreparedAction(a.id)).resolves.toMatchObject({
        outcome: { status: "unknown", next: "retrySameAttempt" },
      })
      run.executor.leaveThread("thread-a")
      // Time passes: both clocks move.
      run.advance(RECONCILE_MIN_AGE_MS + 60_000)
      monotonic += RECONCILE_MIN_AGE_MS + 60_000
      run.graphql.transactions.mockResolvedValue(page([landed, fundedBefore(T0, "USD")]))
      run.intraLedgerUsdPaymentSend.mockResolvedValue(SENT)

      const b = run.prepare("thread-b")
      run.executor.addPrepared(b, "text")
      return { run, a, b, result: await run.executor.executePreparedAction(b.id) }
    }

    it("journals no offset after a five-minute step, so the list is never read for an absent", async () => {
      const { run, a, b, result } = await lostAfterStep(FIVE_MINUTES_MS)

      expect(result).toEqual({
        kind: "pendingDispatch",
        actionId: b.id,
        replyKey: "Assistant.checkHistory",
        historyCheckable: false,
      })
      expect(run.keysSent()).toHaveLength(1)
      await expect(run.reconcile.mock.results[0].value).resolves.toBe("unknown")
      expect(run.graphql.transactions).not.toHaveBeenCalled()
      await expect(run.journal.pending()).resolves.toEqual([
        expect.objectContaining({
          preparedActionId: a.id,
          dispatchedAt: T0 + FIVE_MINUTES_MS,
          serverClockOffsetMs: null,
        }),
      ])
    })

    it("would send twice on the offset measured before the step: the case the null closes", async () => {
      // The same story, journaled with the offset as it was measured, as
      // the executor did before ENG-726. The dispatch, stamped on the
      // stepped clock, lands on the server's clock five minutes after the
      // send it made: the list is read back from after the send's own row,
      // which then counts as one from before the dispatch, and calls the
      // payment absent.
      const { run, result } = await lostAfterStep(FIVE_MINUTES_MS, () => 0)

      expect(result).toMatchObject({ kind: "executed", outcome: { status: "succeeded" } })
      await expect(run.reconcile.mock.results[0].value).resolves.toBe("absent")
      expect(run.keysSent()).toHaveLength(2)
    })

    it("keeps the measured offset when the clock did not step", async () => {
      const { run, a } = await lostAfterStep(0)

      await expect(run.journal.pending()).resolves.toEqual([
        expect.objectContaining({
          preparedActionId: a.id,
          dispatchedAt: T0,
          serverClockOffsetMs: 0,
        }),
      ])
    })
  })
})
