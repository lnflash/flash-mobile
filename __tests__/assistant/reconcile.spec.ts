import type { DispatchRecord } from "@app/assistant/engine/attempt-journal"
import {
  createTransactionListReconciler,
  listCanShow,
  matchesTransaction,
  RECONCILE_CLOCK_SKEW_SECONDS,
  RECONCILE_MAX_PAGES,
  RECONCILE_MIN_AGE_MS,
} from "@app/assistant/engine/reconcile"
import type { TransactionRow } from "@app/assistant/rails/graphql-rail"
import { fakeGraphqlRail, graphqlTx, page } from "./fakes"

const DISPATCHED_AT_MS = 1_760_000_000_000
const DISPATCHED_AT_S = DISPATCHED_AT_MS / 1000

const intraledger = {
  kind: "intraledger" as const,
  counterPartyWalletId: "bob-wallet",
  settlementCurrency: "USD" as const,
  amount: 500,
}

const record = (
  match: DispatchRecord["match"] = intraledger,
  lastDispatchedAt = DISPATCHED_AT_MS,
): DispatchRecord => ({
  preparedActionId: "a1",
  idempotencyKey: "k1",
  paymentDetailHash: "h",
  dispatchedAt: DISPATCHED_AT_MS,
  lastDispatchedAt,
  match,
})

const lnSend = (overrides: Partial<TransactionRow>) =>
  graphqlTx({
    id: "ln",
    createdAt: DISPATCHED_AT_S + 1,
    initiationVia: { __typename: "InitiationViaLn", paymentHash: "hash-1" },
    settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
    ...overrides,
  })

describe("matchesTransaction", () => {
  it("finds a lightning payment by its payment hash", () => {
    const match = { kind: "lightning" as const, paymentHash: "hash-1" }

    expect(matchesTransaction(match, lnSend({}))).toBe(true)
    expect(
      matchesTransaction(
        match,
        lnSend({
          initiationVia: { __typename: "InitiationViaLn", paymentHash: "other" },
        }),
      ),
    ).toBe(false)
  })

  it("finds an intraledger send by counterparty wallet, currency and unsigned amount", () => {
    const send = graphqlTx({ id: "t", createdAt: 1, settlementAmount: -500 })

    expect(matchesTransaction(intraledger, send)).toBe(true)
    expect(matchesTransaction(intraledger, { ...send, settlementAmount: -501 })).toBe(
      false,
    )
    expect(matchesTransaction(intraledger, { ...send, settlementCurrency: "USDT" })).toBe(
      false,
    )
    expect(
      matchesTransaction({ ...intraledger, counterPartyWalletId: "carol-wallet" }, send),
    ).toBe(false)
  })

  it("finds an on-chain send by its address", () => {
    const send = graphqlTx({
      id: "oc",
      createdAt: 1,
      initiationVia: { __typename: "InitiationViaOnChain", address: "bc1q-1" },
      settlementVia: { __typename: "SettlementViaOnChain", transactionHash: null },
    })

    expect(matchesTransaction({ kind: "onchain", address: "bc1q-1" }, send)).toBe(true)
    expect(matchesTransaction({ kind: "onchain", address: "bc1q-2" }, send)).toBe(false)
  })

  it("never matches a receive", () => {
    const received = graphqlTx({
      id: "r",
      createdAt: 1,
      direction: "RECEIVE",
      settlementAmount: 500,
    })

    expect(matchesTransaction(intraledger, received)).toBe(false)
  })

  it("never finds a BTC-rail payment: the BTC wallet's payments are not in the list", () => {
    expect(matchesTransaction({ kind: "btcRail" }, lnSend({}))).toBe(false)
    expect(
      matchesTransaction(
        { kind: "btcRail" },
        graphqlTx({ id: "t", createdAt: 1, settlementAmount: -500 }),
      ),
    ).toBe(false)
  })

  it("finds a group send when any one of its legs is the row", () => {
    const toCarol = { ...intraledger, counterPartyWalletId: "carol-wallet" }
    const group = { kind: "anyOf" as const, matches: [toCarol, intraledger] }
    const toBob = graphqlTx({ id: "t", createdAt: 1, settlementAmount: -500 })
    const toDave = graphqlTx({
      id: "d",
      createdAt: 1,
      settlementAmount: -500,
      settlementVia: {
        __typename: "SettlementViaIntraLedger",
        counterPartyWalletId: "dave-wallet",
        counterPartyUsername: "dave",
      },
      initiationVia: {
        __typename: "InitiationViaIntraLedger",
        counterPartyWalletId: "dave-wallet",
        counterPartyUsername: "dave",
      },
    })

    expect(matchesTransaction(group, toBob)).toBe(true)
    expect(matchesTransaction(group, toDave)).toBe(false)
  })
})

describe("listCanShow", () => {
  it("is false for a BTC-rail payment, and for a group with one among its legs", () => {
    expect(listCanShow(intraledger)).toBe(true)
    expect(listCanShow({ kind: "btcRail" })).toBe(false)
    expect(listCanShow({ kind: "anyOf", matches: [intraledger, intraledger] })).toBe(true)
    expect(
      listCanShow({ kind: "anyOf", matches: [intraledger, { kind: "btcRail" }] }),
    ).toBe(false)
  })
})

describe("createTransactionListReconciler", () => {
  const reconcilerOver = (pages: TransactionRow[][], nowMs: number) => {
    const graphql = fakeGraphqlRail()
    graphql.transactions.mockImplementation(async ({ after }: { after?: string }) => {
      const index = after === undefined ? 0 : Number(after)
      return page(
        pages[index] ?? [],
        index + 1 < pages.length ? String(index + 1) : undefined,
      )
    })
    const reconcile = createTransactionListReconciler({
      graphql: graphql as never,
      now: () => nowMs,
    })
    return { reconcile, graphql }
  }

  const old = DISPATCHED_AT_MS + RECONCILE_MIN_AGE_MS
  const send = (overrides: Partial<TransactionRow> = {}) =>
    graphqlTx({
      id: "s",
      createdAt: DISPATCHED_AT_S + 3,
      settlementAmount: -500,
      ...overrides,
    })
  // Some other payment: $0.01 to bob.
  const unrelated = (id: string, createdAt: number) =>
    graphqlTx({ id, createdAt, settlementAmount: -1 })

  it("calls a matching send since the dispatch settled, pending ones included", async () => {
    const settled = reconcilerOver([[send()]], DISPATCHED_AT_MS + 5_000)
    const pending = reconcilerOver(
      [[send({ status: "PENDING" })]],
      DISPATCHED_AT_MS + 5_000,
    )

    await expect(settled.reconcile(record())).resolves.toBe("settled")
    await expect(pending.reconcile(record())).resolves.toBe("settled")
  })

  it("allows for the device clock running ahead of the server", async () => {
    const early = send({ createdAt: DISPATCHED_AT_S - RECONCILE_CLOCK_SKEW_SECONDS + 1 })

    await expect(reconcilerOver([[early]], old).reconcile(record())).resolves.toBe(
      "settled",
    )
  })

  it("calls it absent when the list since the dispatch is read and it is not there", async () => {
    const older = send({ id: "before", createdAt: DISPATCHED_AT_S - 3600 })

    await expect(
      reconcilerOver([[unrelated("other", DISPATCHED_AT_S + 9), older]], old).reconcile(
        record(),
      ),
    ).resolves.toBe("absent")
  })

  it("does not count the same payment made before the dispatch", async () => {
    // An earlier, identical $5 to bob is not this dispatch landing.
    const yesterday = send({ createdAt: DISPATCHED_AT_S - 86_400 })

    await expect(reconcilerOver([[yesterday]], old).reconcile(record())).resolves.toBe(
      "absent",
    )
  })

  it("does not count a failed payment as the dispatch landing", async () => {
    await expect(
      reconcilerOver([[send({ status: "FAILURE" })]], old).reconcile(record()),
    ).resolves.toBe("absent")
  })

  it("is unknown while the dispatch is too recent to be sure it is not coming", async () => {
    await expect(
      reconcilerOver([[]], DISPATCHED_AT_MS + RECONCILE_MIN_AGE_MS - 1).reconcile(
        record(),
      ),
    ).resolves.toBe("unknown")
  })

  it("waits out a retry under the same key as it waits out the first dispatch", async () => {
    // First dispatch at t0, a retry at t0 + 150 s, both answers lost. At
    // t0 + 170 s the first is old enough, but the retry can still land.
    const retriedAt = DISPATCHED_AT_MS + 150_000
    const retried = record(intraledger, retriedAt)

    await expect(
      reconcilerOver([[]], DISPATCHED_AT_MS + 170_000).reconcile(retried),
    ).resolves.toBe("unknown")
    await expect(
      reconcilerOver([[]], retriedAt + RECONCILE_MIN_AGE_MS).reconcile(retried),
    ).resolves.toBe("absent")
  })

  it("looks for the payment back to the first dispatch, not only since the retry", async () => {
    // Landed from the first dispatch, before the retry went out.
    const landedEarly = send({ createdAt: DISPATCHED_AT_S + 10 })
    const retried = record(intraledger, DISPATCHED_AT_MS + 150_000)

    await expect(
      reconcilerOver([[landedEarly]], DISPATCHED_AT_MS + 170_000).reconcile(retried),
    ).resolves.toBe("settled")
  })

  // The executor, not the reconciler, gets the user out of this: a record a
  // day old that the list cannot settle may be cleared on their word
  // (executor-dispatch.spec.ts, "a dispatch the list cannot settle").
  it("reads back page by page, and is unknown when the pages run out before the dispatch", async () => {
    const newer = (p: number) =>
      Array.from({ length: 20 }, (_, i) =>
        unrelated(`n${p}-${i}`, DISPATCHED_AT_S + 10_000 - p * 20 - i),
      )
    const { reconcile, graphql } = reconcilerOver(
      Array.from({ length: RECONCILE_MAX_PAGES + 2 }, (_, p) => newer(p)),
      old,
    )

    await expect(reconcile(record())).resolves.toBe("unknown")
    expect(graphql.transactions).toHaveBeenCalledTimes(RECONCILE_MAX_PAGES)
  })

  it("finds the payment on a later page", async () => {
    const filler = Array.from({ length: 20 }, (_, i) =>
      unrelated(`f${i}`, DISPATCHED_AT_S + 500 - i),
    )

    await expect(
      reconcilerOver([filler, [send()]], old).reconcile(record()),
    ).resolves.toBe("settled")
  })

  it("is unknown when the list cannot be read", async () => {
    const { reconcile, graphql } = reconcilerOver([[]], old)
    graphql.transactions.mockRejectedValue(new Error("offline"))

    await expect(reconcile(record())).resolves.toBe("unknown")
  })

  it("is always unknown for a BTC-rail payment, without reading the list (ENG-688)", async () => {
    // The list cannot settle it, and not seeing it there proves nothing: an
    // old record of one may only be cleared on the user's word (executor.ts).
    const { reconcile, graphql } = reconcilerOver([[]], old + 86_400_000)

    await expect(reconcile(record({ kind: "btcRail" }))).resolves.toBe("unknown")
    expect(graphql.transactions).not.toHaveBeenCalled()
  })

  it("settles a group send when the list shows any one of its legs", async () => {
    const toCarol = { ...intraledger, counterPartyWalletId: "carol-wallet" }
    const group = record({ kind: "anyOf", matches: [toCarol, intraledger] })

    await expect(reconcilerOver([[send()]], old).reconcile(group)).resolves.toBe(
      "settled",
    )
  })

  it("calls a group send absent only when the list since the dispatch shows none of its legs", async () => {
    const toCarol = { ...intraledger, counterPartyWalletId: "carol-wallet" }
    const group = record({ kind: "anyOf", matches: [toCarol, intraledger] })

    await expect(
      reconcilerOver([[unrelated("other", DISPATCHED_AT_S + 9)]], old).reconcile(group),
    ).resolves.toBe("absent")
    await expect(
      reconcilerOver([[]], DISPATCHED_AT_MS + RECONCILE_MIN_AGE_MS - 1).reconcile(group),
    ).resolves.toBe("unknown")
  })

  it("is unknown, never absent, for a group with a leg the list cannot show", async () => {
    const group = record({ kind: "anyOf", matches: [intraledger, { kind: "btcRail" }] })

    await expect(reconcilerOver([[]], old).reconcile(group)).resolves.toBe("unknown")
    await expect(reconcilerOver([[send()]], old).reconcile(group)).resolves.toBe(
      "settled",
    )
  })
})
