import AsyncStorage from "@react-native-async-storage/async-storage"

import {
  ATTEMPT_JOURNAL_KEY,
  createAttemptJournal,
  DispatchRecord,
  hashPaymentDetail,
  journalMutations,
} from "@app/assistant/engine/attempt-journal"
import { createExecutor } from "@app/assistant/engine/executor"
import type { ReconcileVerdict } from "@app/assistant/engine/reconcile"
import type { ExecuteContext, ExecutionOutcome } from "@app/assistant/registry/types"
import { PaymentSendResult, WalletCurrency } from "@app/graphql/generated"
import { breezBtcRail } from "@app/payments/btc-rail"
import { GraphqlMutationFns, sendPayment } from "@app/payments/send-payment"
import type { SendPaymentMutation } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { toUsdMoneyAmount } from "@app/types/amounts"
import { recordingTelemetry } from "./fakes"
import { DISPATCH, makeAction, memoryStorage, T0 } from "./executor-harness"

const record = (overrides: Partial<DispatchRecord> = {}): DispatchRecord => ({
  preparedActionId: "action-1",
  idempotencyKey: "key-1",
  paymentDetailHash: DISPATCH.paymentDetailHash,
  dispatchedAt: T0,
  lastDispatchedAt: T0,
  match: DISPATCH.match,
  ...overrides,
})

describe("the dispatch journal", () => {
  it("keeps a record until it is cleared", async () => {
    const journal = createAttemptJournal({ storage: memoryStorage() })

    await journal.record(record())
    await expect(journal.pending()).resolves.toEqual([record()])

    await journal.clear("action-1")
    await expect(journal.pending()).resolves.toEqual([])
  })

  it("keeps an action's first dispatch, and moves its latest forward on a retry", async () => {
    // The first dispatch is the earliest the payment could have landed; the
    // retry is the latest it could still set off, so the wait for its
    // absence to mean anything starts over from it (reconcile.ts).
    const journal = createAttemptJournal({ storage: memoryStorage() })

    await journal.record(record({ dispatchedAt: T0, idempotencyKey: "key-1" }))
    await journal.record(
      record({
        dispatchedAt: T0 + 150_000,
        lastDispatchedAt: T0 + 150_000,
        idempotencyKey: null,
      }),
    )

    await expect(journal.pending()).resolves.toEqual([
      record({ lastDispatchedAt: T0 + 150_000 }),
    ])
  })

  it("never moves the latest dispatch back", async () => {
    const journal = createAttemptJournal({ storage: memoryStorage() })

    await journal.record(record({ lastDispatchedAt: T0 + 9_000 }))
    await journal.record(
      record({ dispatchedAt: T0 + 5_000, lastDispatchedAt: T0 + 5_000 }),
    )

    await expect(journal.pending()).resolves.toEqual([
      record({ lastDispatchedAt: T0 + 9_000 }),
    ])
  })

  it("reads a record stored without lastDispatchedAt as one dispatch, never dropping it", async () => {
    // Dropping it would let its payment go again unreconciled.
    const storage = memoryStorage()
    const { lastDispatchedAt: _absent, ...older } = record({ preparedActionId: "older" })
    storage.data.set(ATTEMPT_JOURNAL_KEY, JSON.stringify([older]))
    const journal = createAttemptJournal({ storage })

    await expect(journal.pending()).resolves.toEqual([
      record({ preparedActionId: "older", lastDispatchedAt: T0 }),
    ])

    await journal.record(
      record({ preparedActionId: "older", lastDispatchedAt: T0 + 150_000 }),
    )
    await expect(journal.pending()).resolves.toEqual([
      record({ preparedActionId: "older", lastDispatchedAt: T0 + 150_000 }),
    ])
  })

  it("loses no record when dispatches are written at once", async () => {
    const journal = createAttemptJournal({ storage: memoryStorage() })

    await Promise.all(
      ["a", "b", "c"].map((id) => journal.record(record({ preparedActionId: id }))),
    )

    expect(
      (await journal.pending()).map(({ preparedActionId }) => preparedActionId),
    ).toEqual(["a", "b", "c"])
  })

  it("rejects when it cannot write, so nothing is sent unrecorded", async () => {
    const storage = memoryStorage()
    storage.setItem = async () => {
      throw new Error("disk full")
    }
    const journal = createAttemptJournal({ storage })

    await expect(journal.record(record())).rejects.toThrow("disk full")
  })

  it("survives an unreadable or partly malformed store", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    const storage = memoryStorage()
    const journal = createAttemptJournal({ storage })

    storage.data.set(ATTEMPT_JOURNAL_KEY, "{not json")
    await expect(journal.pending()).resolves.toEqual([])

    storage.data.set(
      ATTEMPT_JOURNAL_KEY,
      JSON.stringify([
        record(),
        { preparedActionId: "x" },
        record({ match: { kind: "card" } as never }),
      ]),
    )
    await expect(journal.pending()).resolves.toEqual([record()])
    warn.mockRestore()
  })
})

describe("hashPaymentDetail", () => {
  const detail = {
    paymentType: "intraledger" as const,
    destination: "alice",
    sendingWalletDescriptor: { id: "my-usd", currency: WalletCurrency.Usd },
    unitOfAccountAmount: toUsdMoneyAmount(500),
  }

  it("is the same for the same payment, re-derived", () => {
    expect(hashPaymentDetail({ ...detail })).toBe(hashPaymentDetail(detail))
    // Fields the identity leaves out: a settlement amount that moved with the
    // rate, a re-minted invoice, a memo.
    expect(
      hashPaymentDetail({
        ...detail,
        settlementAmount: toUsdMoneyAmount(501),
        paymentRequest: "lnbc1new",
        memo: "lunch",
      } as typeof detail),
    ).toBe(hashPaymentDetail(detail))
  })

  it("differs for a different payee, amount or source wallet", () => {
    const base = hashPaymentDetail(detail)

    expect(hashPaymentDetail({ ...detail, destination: "bob" })).not.toBe(base)
    expect(
      hashPaymentDetail({ ...detail, unitOfAccountAmount: toUsdMoneyAmount(501) }),
    ).not.toBe(base)
    expect(
      hashPaymentDetail({
        ...detail,
        sendingWalletDescriptor: { id: "my-usdt", currency: WalletCurrency.Usdt },
      }),
    ).not.toBe(base)
  })

  it("is a sha256 in hex, so the record holds no payment details", () => {
    expect(hashPaymentDetail(detail)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("journalMutations", () => {
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

  const fakeMutations = () =>
    Object.fromEntries(
      TRIGGERS.map((name) => [name, jest.fn(async () => ({ data: { name } }))]),
    ) as unknown as Record<keyof GraphqlMutationFns, jest.Mock>

  TRIGGERS.forEach((name) =>
    it(`${name} records its dispatch, with its key, before it sends`, async () => {
      const mutations = fakeMutations()
      const order: string[] = []
      const journalDispatch = jest.fn(async (key: string | null) => {
        order.push(`journal:${key}`)
      })
      mutations[name].mockImplementation(async () => {
        order.push("send")
        return { data: {} }
      })
      const journaled = journalMutations(
        mutations as unknown as GraphqlMutationFns,
        journalDispatch,
      )
      const trigger = journaled[name] as (options: unknown) => Promise<unknown>

      await trigger({ variables: { input: { idempotencyKey: "k-9" } } })

      expect(order).toEqual(["journal:k-9", "send"])
    }),
  )

  it("records a keyless dispatch as keyless", async () => {
    const mutations = fakeMutations()
    const journalDispatch = jest.fn(async () => undefined)

    await journalMutations(
      mutations as unknown as GraphqlMutationFns,
      journalDispatch,
    ).onChainPaymentSend({
      variables: { input: { walletId: "w", address: "bc1q", amount: 1 } },
    })

    expect(journalDispatch).toHaveBeenCalledWith(null)
  })

  it("sends nothing when the dispatch cannot be recorded", async () => {
    const mutations = fakeMutations()
    const journaled = journalMutations(
      mutations as unknown as GraphqlMutationFns,
      async () => {
        throw new Error("disk full")
      },
    )

    await expect(
      journaled.intraLedgerUsdPaymentSend({
        variables: { input: { walletId: "w", recipientWalletId: "r", amount: 1 } },
      }),
    ).rejects.toThrow("disk full")
    expect(mutations.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
  })
})

// spec §5.1, "Process death": the app is killed mid-send, and the relaunched
// app must not let the same payment out under a second key before the first
// dispatch is accounted for.
describe("a dispatch that outlives the app", () => {
  // The send closure a payment-details builder returns, for $5 to alice.
  const sendToAlice: SendPaymentMutation = async ({
    intraLedgerUsdPaymentSend,
    idempotencyKey,
  }) => {
    const result = await intraLedgerUsdPaymentSend({
      variables: {
        input: {
          walletId: "my-usd",
          recipientWalletId: "alice-wallet",
          amount: 500,
          idempotencyKey,
        },
      },
    })
    return {
      status: result.data?.intraLedgerUsdPaymentSend.status,
      errors: result.data?.intraLedgerUsdPaymentSend.errors,
    }
  }

  /** One run of the app: a journal over AsyncStorage and an executor. */
  const launch = (verdict: ReconcileVerdict = "unknown", clock = T0) => {
    const journal = createAttemptJournal()
    const reconcile = jest.fn(async (): Promise<ReconcileVerdict> => verdict)
    const intraLedgerUsdPaymentSend = jest.fn()
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal,
      reconcile,
      telemetry: recordingTelemetry().telemetry,
      now: () => clock,
    })
    // The action's execute(): the real sendPayment, with the action's own
    // attempt and journaled triggers.
    const execute = jest.fn(async (ctx: ExecuteContext): Promise<ExecutionOutcome> => {
      const outcome = await sendPayment(
        { sendPaymentMutation: sendToAlice },
        {
          mutations: journalMutations(
            { intraLedgerUsdPaymentSend } as unknown as GraphqlMutationFns,
            ctx.journalDispatch,
          ),
          btcRail: breezBtcRail,
          graphqlUri: "https://api.example/graphql",
          lnAddressHostname: "flashapp.me",
        },
        ctx.attempt,
      )
      return outcome.status === PaymentSendResult.Success
        ? { status: "succeeded" }
        : { status: "failed", replyKey: "Assistant.toolFailed", next: "confirmAgain" }
    })
    // Prepared now, in this run of the app.
    const prepare = () => makeAction({ execute, dispatch: DISPATCH, createdAt: clock })
    return { journal, reconcile, intraLedgerUsdPaymentSend, executor, prepare }
  }

  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  /** Session one: the send is dispatched, and the app dies before any answer. */
  const dieMidSend = async () => {
    const first = launch()
    first.intraLedgerUsdPaymentSend.mockReturnValue(new Promise<never>(() => {}))
    const action = first.prepare()
    first.executor.addPrepared(action, "text")
    first.executor.executePreparedAction(action.id)
    await new Promise((resolve) => {
      setImmediate(resolve)
    })
    const [sentWith] = first.intraLedgerUsdPaymentSend.mock.calls[0]
    return { action, key: sentWith.variables.input.idempotencyKey as string }
  }

  it("persists the dispatch, with the key sendPayment minted, before it goes out", async () => {
    const { action, key } = await dieMidSend()

    // A fresh journal reads only what is in storage, as after a relaunch.
    await expect(createAttemptJournal().pending()).resolves.toEqual([
      {
        preparedActionId: action.id,
        idempotencyKey: key,
        paymentDetailHash: DISPATCH.paymentDetailHash,
        dispatchedAt: T0,
        lastDispatchedAt: T0,
        match: DISPATCH.match,
      },
    ])
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("blocks the same payment after a relaunch while the dispatch is unaccounted for", async () => {
    const { key } = await dieMidSend()
    const relaunched = launch("unknown", T0 + 30_000)
    const again = relaunched.prepare()
    relaunched.executor.addPrepared(again, "text")

    await expect(relaunched.executor.executePreparedAction(again.id)).resolves.toEqual({
      kind: "pendingDispatch",
      actionId: again.id,
      replyKey: "Assistant.checkHistory",
      historyCheckable: false,
    })
    expect(relaunched.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: key }),
    )
    // No second key went out.
    expect(relaunched.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
  })

  it("says a payment of this amount to this recipient was already sent when the list shows it", async () => {
    await dieMidSend()
    const relaunched = launch("settled", T0 + 30_000)
    const again = relaunched.prepare()
    relaunched.executor.addPrepared(again, "text")

    await expect(
      relaunched.executor.executePreparedAction(again.id),
    ).resolves.toMatchObject({
      kind: "alreadySent",
      replyKey: "Assistant.alreadySent",
    })
    expect(relaunched.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
    await expect(relaunched.journal.pending()).resolves.toEqual([])
  })

  it("lets the payment out again once the list proves the first never landed", async () => {
    const { key } = await dieMidSend()
    const relaunched = launch("absent", T0 + 10 * 60_000)
    relaunched.intraLedgerUsdPaymentSend.mockResolvedValue({
      data: {
        intraLedgerUsdPaymentSend: { status: PaymentSendResult.Success, errors: [] },
      },
    })
    const again = relaunched.prepare()
    relaunched.executor.addPrepared(again, "text")

    await expect(
      relaunched.executor.executePreparedAction(again.id),
    ).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "succeeded" },
    })
    const [sentWith] = relaunched.intraLedgerUsdPaymentSend.mock.calls[0]
    expect(sentWith.variables.input.idempotencyKey).not.toBe(key)
    // The new send's own record was crossed off by its status.
    await expect(relaunched.journal.pending()).resolves.toEqual([])
  })

  it("leaves nothing to reconcile after a send that came back with a status", async () => {
    const first = launch()
    first.intraLedgerUsdPaymentSend.mockResolvedValue({
      data: {
        intraLedgerUsdPaymentSend: { status: PaymentSendResult.Success, errors: [] },
      },
    })
    const action = first.prepare()
    first.executor.addPrepared(action, "text")
    await first.executor.executePreparedAction(action.id)

    const relaunched = launch()
    relaunched.intraLedgerUsdPaymentSend.mockResolvedValue({
      data: {
        intraLedgerUsdPaymentSend: { status: PaymentSendResult.Success, errors: [] },
      },
    })
    const again = relaunched.prepare()
    relaunched.executor.addPrepared(again, "text")

    await expect(
      relaunched.executor.executePreparedAction(again.id),
    ).resolves.toMatchObject({
      kind: "executed",
    })
    expect(relaunched.reconcile).not.toHaveBeenCalled()
  })

  it("refuses a dispatch from an action with no dispatch identity", async () => {
    const run = launch()
    const action = makeAction({
      dispatch: undefined,
      execute: jest.fn(async (ctx: ExecuteContext): Promise<ExecutionOutcome> => {
        await ctx.journalDispatch("k")
        return { status: "succeeded" }
      }),
    })
    run.executor.addPrepared(action, "text")

    // The journal write throws before anything is sent: an unknown outcome,
    // never a silent send.
    await expect(run.executor.executePreparedAction(action.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "unknown" },
    })
  })
})
