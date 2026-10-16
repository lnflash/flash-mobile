import type { DispatchRecord } from "@app/assistant/engine/attempt-journal"
import {
  cannotRuleOut,
  createTransactionListReconciler,
  listCanShow,
  matchesTransaction,
  RECONCILE_CLOCK_SKEW_SECONDS,
  RECONCILE_MIN_AGE_MS,
  RECONCILE_PAGE_SIZE,
} from "@app/assistant/engine/reconcile"
import type { TransactionRow } from "@app/assistant/rails/graphql-rail"
import {
  fakeGraphqlRail,
  flashTransactions,
  FLASH_CURSOR,
  FLASH_CURSOR_REFUSED,
  fundedBefore,
  graphqlTx,
  servedTransactions,
} from "./fakes"

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
  /** The paying wallet: the legacy USD cash wallet unless a case says otherwise. */
  sourceWalletCurrency: DispatchRecord["sourceWalletCurrency"] = "USD",
): DispatchRecord => ({
  preparedActionId: "a1",
  idempotencyKey: "k1",
  paymentDetailHash: "h",
  dispatchedAt: DISPATCHED_AT_MS,
  lastDispatchedAt,
  match,
  sourceWalletCurrency,
})

/** The deposit that funded a wallet, a day before the dispatch: it settled before it. */
const funded = (currency: "USD" | "USDT" = "USD") =>
  fundedBefore(DISPATCHED_AT_MS, currency)

const onchainVia = (address: string): TransactionRow["initiationVia"] => ({
  __typename: "InitiationViaOnChain",
  address,
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

  it("is false for a settlement: no row says which settlement it was", () => {
    expect(listCanShow({ kind: "cashout" })).toBe(false)
  })
})

// The rows Account.transactions answers with on lnflash/flash main
// (d1cca3767, src/app/wallets/get-transactions-for-wallet.ts): every row
// comes from IBEX with its identifiers blank. A Lightning row has
// paymentHash "" (:97), an on-chain row address "" (:115), and a type IBEX
// does not name is an intraledger row with no counterparty (:129). A
// Flash-to-Flash send is an IBEX Lightning payment
// (intraledger-usd-payment-send.ts), so it is a Lightning row too. The cases
// above use rows that carry identifiers, as the schema allows; these are the
// rows the app actually gets.
const apiLightningRow = (overrides: Partial<TransactionRow> = {}) =>
  graphqlTx({
    id: "ibex-ln",
    createdAt: DISPATCHED_AT_S + 3,
    settlementAmount: -500,
    initiationVia: { __typename: "InitiationViaLn", paymentHash: "" },
    settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
    ...overrides,
  })
const apiOnchainRow = (overrides: Partial<TransactionRow> = {}) =>
  graphqlTx({
    id: "ibex-onchain",
    createdAt: DISPATCHED_AT_S + 3,
    settlementAmount: -500,
    initiationVia: { __typename: "InitiationViaOnChain", address: "" },
    settlementVia: { __typename: "SettlementViaOnChain", transactionHash: "" },
    ...overrides,
  })
const apiUnnamedRow = (overrides: Partial<TransactionRow> = {}) =>
  graphqlTx({
    id: "ibex-unknown-type",
    createdAt: DISPATCHED_AT_S + 3,
    settlementAmount: -500,
    initiationVia: {
      __typename: "InitiationViaIntraLedger",
      counterPartyWalletId: null,
      counterPartyUsername: null,
    },
    settlementVia: {
      __typename: "SettlementViaIntraLedger",
      counterPartyWalletId: null,
      counterPartyUsername: null,
    },
    ...overrides,
  })

const lightning = { kind: "lightning" as const, paymentHash: "hash-1" }
const onchain = { kind: "onchain" as const, address: "bc1q-1" }

/** `count` IBEX receipts since the dispatch, newest first, in one wallet's currency. */
const receiptsSince = (count: number, currency: "USD" | "USDT" = "USD") =>
  Array.from({ length: count }, (_, i) =>
    apiLightningRow({
      id: `in-${currency}-${i}`,
      createdAt: DISPATCHED_AT_S + 500 - i,
      direction: "RECEIVE",
      settlementAmount: 100,
      settlementCurrency: currency,
    }),
  )

/** A row of one wallet's from before the dispatch. */
const rowBefore = (id: string, currency: "USD" | "USDT" = "USD") =>
  apiLightningRow({
    id,
    createdAt: DISPATCHED_AT_S - 3600,
    settlementCurrency: currency,
  })

describe("cannotRuleOut: a sent row that might be the payment under no name", () => {
  it("cannot rule a Lightning row out for an intraledger send: it names no counterparty", () => {
    expect(cannotRuleOut(intraledger, apiLightningRow())).toBe(true)
    // Not even one with a hash: the intraledger record knows none to compare.
    expect(
      cannotRuleOut(
        intraledger,
        apiLightningRow({
          initiationVia: { __typename: "InitiationViaLn", paymentHash: "some-hash" },
        }),
      ),
    ).toBe(true)
  })

  it("cannot rule a Lightning row with no hash out for a Lightning payment", () => {
    expect(cannotRuleOut(lightning, apiLightningRow())).toBe(true)
  })

  it("cannot rule an on-chain row with no address out for an on-chain send", () => {
    expect(cannotRuleOut(onchain, apiOnchainRow())).toBe(true)
  })

  it("cannot rule out a row of a type the API could not name, for any kind", () => {
    for (const match of [intraledger, lightning, onchain]) {
      expect(cannotRuleOut(match, apiUnnamedRow())).toBe(true)
    }
  })

  it("rules out a row that names another payment, or that the payment could never be", () => {
    // A hash, an address or a counterparty that is not the payment's.
    expect(cannotRuleOut(lightning, lnSend({}))).toBe(false)
    expect(
      cannotRuleOut(onchain, apiOnchainRow({ initiationVia: onchainVia("bc1q-2") })),
    ).toBe(false)
    expect(cannotRuleOut(intraledger, graphqlTx({ id: "carol", createdAt: 1 }))).toBe(
      false,
    )
    // A Lightning payment is never an on-chain row, nor an on-chain send a
    // Lightning one; an intraledger send is never an on-chain row.
    expect(cannotRuleOut(lightning, apiOnchainRow())).toBe(false)
    expect(cannotRuleOut(onchain, apiLightningRow())).toBe(false)
    expect(cannotRuleOut(intraledger, apiOnchainRow())).toBe(false)
  })

  it("never counts a receive", () => {
    const received = { direction: "RECEIVE" as const, settlementAmount: 500 }
    expect(cannotRuleOut(intraledger, apiLightningRow(received))).toBe(false)
    expect(cannotRuleOut(onchain, apiOnchainRow(received))).toBe(false)
  })

  it("cannot rule a row out for a group when it could be any one of its legs", () => {
    const toCarol = { ...intraledger, counterPartyWalletId: "carol-wallet" }
    const group = { kind: "anyOf" as const, matches: [toCarol, intraledger] }

    expect(cannotRuleOut(group, apiLightningRow())).toBe(true)
  })
})

describe("createTransactionListReconciler", () => {
  // The list as lnflash/flash serves it (d1cca3767): `pages[0]`, saying
  // whether more rows follow, and a refusal for the next page, whose cursor
  // is an IBEX id (flashTransactions, ENG-724).
  const reconcilerOver = (pages: TransactionRow[][], nowMs: number) => {
    const graphql = fakeGraphqlRail()
    graphql.transactions.mockImplementation(flashTransactions(pages))
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
      reconcilerOver([[send({ status: "FAILURE" }), funded()]], old).reconcile(record()),
    ).resolves.toBe("absent")
  })

  it("is unknown while the dispatch is too recent to be sure it is not coming", async () => {
    await expect(
      reconcilerOver([[funded()]], DISPATCHED_AT_MS + RECONCILE_MIN_AGE_MS - 1).reconcile(
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
      reconcilerOver([[funded()]], DISPATCHED_AT_MS + 170_000).reconcile(retried),
    ).resolves.toBe("unknown")
    await expect(
      reconcilerOver([[funded()]], retriedAt + RECONCILE_MIN_AGE_MS).reconcile(retried),
    ).resolves.toBe("absent")
  })

  it("is unknown when the list is empty: lnflash/flash serves a wallet it could not read as no rows (ENG-725)", async () => {
    // get-transactions-for-wallet.ts:27-35 answers an IBEX error with no
    // rows for that wallet and no GraphQL error, so the list comes back
    // empty, read to its end. The send to Alice may have gone all the same.
    for (const nowMs of [old, old + 86_400_000]) {
      await expect(reconcilerOver([[]], nowMs).reconcile(record())).resolves.toBe(
        "unknown",
      )
    }
  })

  it("is unknown when the list does not show the paying wallet's rows", async () => {
    // A send from the USDT cash wallet whose IBEX read failed: the list
    // shows only the legacy USD wallet's old rows, which say nothing about
    // the USDT wallet's.
    const usdt = { ...intraledger, settlementCurrency: "USDT" as const }
    const usdtSend = record(usdt, DISPATCHED_AT_MS, "USDT")
    const usdRows = [rowBefore("usd-old"), funded("USD")]

    await expect(reconcilerOver([usdRows], old).reconcile(usdtSend)).resolves.toBe(
      "unknown",
    )
    // The USDT wallet's own rows, read back past the dispatch, prove it.
    await expect(
      reconcilerOver([[funded("USDT"), ...usdRows]], old).reconcile(usdtSend),
    ).resolves.toBe("absent")
  })

  it("is unknown for a record that does not say which wallet paid, though it still finds the payment", async () => {
    // A record written before the journal kept the paying wallet.
    const unsaid = record(intraledger, DISPATCHED_AT_MS, null)

    await expect(reconcilerOver([[funded()]], old).reconcile(unsaid)).resolves.toBe(
      "unknown",
    )
    await expect(
      reconcilerOver([[send(), funded()]], old).reconcile(unsaid),
    ).resolves.toBe("settled")
  })

  it("looks for the payment back to the first dispatch, not only since the retry", async () => {
    // Landed from the first dispatch, before the retry went out.
    const landedEarly = send({ createdAt: DISPATCHED_AT_S + 10 })
    const retried = record(intraledger, DISPATCHED_AT_MS + 150_000)

    await expect(
      reconcilerOver([[landedEarly]], DISPATCHED_AT_MS + 170_000).reconcile(retried),
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
      reconcilerOver(
        [[unrelated("other", DISPATCHED_AT_S + 9), funded()]],
        old,
      ).reconcile(group),
    ).resolves.toBe("absent")
    await expect(
      reconcilerOver([[funded()]], DISPATCHED_AT_MS + RECONCILE_MIN_AGE_MS - 1).reconcile(
        group,
      ),
    ).resolves.toBe("unknown")
  })

  it("is unknown, never absent, for a group with a leg the list cannot show", async () => {
    const group = record({ kind: "anyOf", matches: [intraledger, { kind: "btcRail" }] })

    await expect(reconcilerOver([[funded()]], old).reconcile(group)).resolves.toBe(
      "unknown",
    )
    await expect(reconcilerOver([[send()]], old).reconcile(group)).resolves.toBe(
      "settled",
    )
  })

  it("is always unknown for a settlement, without reading the list (ENG-688)", async () => {
    const { reconcile, graphql } = reconcilerOver([[]], old + 86_400_000)

    await expect(reconcile(record({ kind: "cashout" }))).resolves.toBe("unknown")
    expect(graphql.transactions).not.toHaveBeenCalled()
  })

  describe("over the rows lnflash/flash returns", () => {
    // The dispatch landed: lnflash/flash lists it as an IBEX row with its
    // identifiers blank. Calling it absent would let the same payment go
    // again under a new key (ENG-533).
    it("never calls an intraledger send absent while a Lightning row since the dispatch could be it", async () => {
      await expect(
        reconcilerOver([[apiLightningRow()]], old).reconcile(record()),
      ).resolves.toBe("unknown")
      // However long ago, while the row is in the window read.
      await expect(
        reconcilerOver([[apiLightningRow()]], old + 86_400_000).reconcile(record()),
      ).resolves.toBe("unknown")
    })

    it("never calls a Lightning payment absent while a Lightning row with no hash could be it", async () => {
      await expect(
        reconcilerOver([[apiLightningRow()]], old).reconcile(record(lightning)),
      ).resolves.toBe("unknown")
    })

    it("never calls an on-chain send absent while an on-chain row with no address could be it", async () => {
      await expect(
        reconcilerOver([[apiOnchainRow()]], old).reconcile(record(onchain)),
      ).resolves.toBe("unknown")
    })

    it("never calls a group absent while a row could be one of its legs", async () => {
      const toCarol = { ...intraledger, counterPartyWalletId: "carol-wallet" }
      const group = record({ kind: "anyOf", matches: [toCarol, intraledger] })

      await expect(
        reconcilerOver([[apiLightningRow()]], old).reconcile(group),
      ).resolves.toBe("unknown")
    })

    it("is unknown when the one page it serves is full of rows since the dispatch", async () => {
      // A single cash wallet's list is its newest 20 rows, and hasNextPage
      // is false however many more it has: toIbexPaginationArgs asks IBEX
      // for page 0 only (get-transactions-for-wallet.ts:213-236), and
      // connectionFromPaginatedArray measures hasNextPage against what IBEX
      // returned (src/graphql/connections.ts:60,68). Twenty receipts since
      // the dispatch leave the send itself, if it went, one row past the end.
      const { reconcile, graphql } = reconcilerOver(
        [receiptsSince(RECONCILE_PAGE_SIZE)],
        old,
      )

      await expect(reconcile(record())).resolves.toBe("unknown")
      expect(graphql.transactions).toHaveBeenCalledTimes(1)
    })

    it("still calls it absent when nothing was sent since the dispatch", async () => {
      // Receipts, a send that failed, and sends from before the dispatch:
      // none of them can be the dispatch landing.
      const rows = [
        apiLightningRow({ id: "in", direction: "RECEIVE", settlementAmount: 900 }),
        apiLightningRow({ id: "failed", status: "FAILURE" }),
        apiLightningRow({ id: "before", createdAt: DISPATCHED_AT_S - 3600 }),
        apiOnchainRow({ id: "before-onchain", createdAt: DISPATCHED_AT_S - 3600 }),
      ]

      await expect(reconcilerOver([rows], old).reconcile(record())).resolves.toBe(
        "absent",
      )
    })

    it("rules out a row the payment could never be: an on-chain row for a Lightning payment", async () => {
      await expect(
        reconcilerOver([[apiOnchainRow(), funded()]], old).reconcile(record(lightning)),
      ).resolves.toBe("absent")
      await expect(
        reconcilerOver([[apiLightningRow(), funded()]], old).reconcile(record(onchain)),
      ).resolves.toBe("absent")
    })

    it("still settles a payment a row names, should the API name it", async () => {
      await expect(
        reconcilerOver(
          [
            [
              apiLightningRow({ id: "other" }),
              lnSend({ createdAt: DISPATCHED_AT_S + 5 }),
            ],
          ],
          old,
        ).reconcile(record(lightning)),
      ).resolves.toBe("settled")
    })
  })

  describe("over the one page lnflash/flash serves: each wallet's newest 20 rows by settlement, one wallet after another", () => {
    // Account.transactions lists every history wallet's IBEX page 0, newest
    // first by settledAt, the wallets one after another
    // (get-transactions-for-wallet.ts:18-30,202-236), and serves the first
    // 20 rows of that list (connections.ts:21-71). An account with a legacy
    // USD wallet and a USDT one gets the USDT block first, then the USD block
    // (cashWalletHistoryWalletIds, presentation.ts), and nothing past either
    // wallet's newest 20. The next page is never served: its cursor is an
    // IBEX id, which checkedConnectionArgs refuses (connections.ts:9,171-175),
    // until ENG-724.

    /** An on-chain deposit to the USD wallet, first seen an hour before the dispatch. */
    const onchainDepositBefore = () =>
      apiOnchainRow({
        id: "deposit",
        createdAt: DISPATCHED_AT_S - 3600,
        direction: "RECEIVE",
        settlementAmount: 5_000,
      })

    it("calls it absent when the page shows a row from before the dispatch", async () => {
      const rows = [...receiptsSince(RECONCILE_PAGE_SIZE - 1), rowBefore("before")]

      await expect(reconcilerOver([rows], old).reconcile(record())).resolves.toBe(
        "absent",
      )
    })

    it("calls it absent when the page ends short of a full one: the wallet has no more rows", async () => {
      // Eighteen receipts since the dispatch and an on-chain deposit first
      // seen before it: nineteen rows. The deposit may have confirmed after
      // the dispatch, so it does not show the rows read back past it; the
      // page ending short does.
      const rows = [...receiptsSince(RECONCILE_PAGE_SIZE - 2), onchainDepositBefore()]
      expect(rows).toHaveLength(RECONCILE_PAGE_SIZE - 1)

      await expect(reconcilerOver([rows], old).reconcile(record())).resolves.toBe(
        "absent",
      )
    })

    it("is unknown when the page is full since the dispatch but for an on-chain row created before it", async () => {
      // IBEX ranks rows by settledAt, which no row carries. A deposit first
      // seen an hour before the dispatch confirmed 40 minutes after it, and
      // 19 receipts settled after that: the newest 20 by settlement are
      // those 20, and the $5 to Alice, if it went, is the 21st row. The
      // deposit's createdAt proves nothing about it.
      const rows = [...receiptsSince(RECONCILE_PAGE_SIZE - 1), onchainDepositBefore()]
      expect(rows).toHaveLength(RECONCILE_PAGE_SIZE)

      await expect(reconcilerOver([rows], old).reconcile(record())).resolves.toBe(
        "unknown",
      )
    })

    it("is unknown when one wallet's block is full since the dispatch, though the next wallet's reaches back", async () => {
      // The USDT wallet's 20 newest rows, all receipts since the dispatch,
      // fill the page, and the list says the legacy USD wallet's rows
      // follow. lnflash/flash refuses the cursor for them, and that alone
      // makes the verdict unknown. Were that page served (ENG-724), the USD
      // block reaching back would still say nothing about the USDT one,
      // whose send would be its 21st row.
      const usdtSend = record(
        { ...intraledger, settlementCurrency: "USDT" },
        DISPATCHED_AT_MS,
        "USDT",
      )
      const { reconcile, graphql } = reconcilerOver(
        [receiptsSince(RECONCILE_PAGE_SIZE, "USDT"), [rowBefore("usd-old")]],
        old,
      )

      await expect(reconcile(usdtSend)).resolves.toBe("unknown")
      expect(graphql.transactions).toHaveBeenCalledTimes(2)
      await expect(graphql.transactions.mock.results[1].value).rejects.toThrow(
        FLASH_CURSOR_REFUSED,
      )
    })

    // A list longer than one page is unknown however its rows read, since
    // the next page is refused: the payment may be on it, and a block cut
    // off by the page's end is not read back. Only an account with two cash
    // wallets, cut over to USDT, has more than one page: the USDT block,
    // then the legacy USD one. The executor, not the reconciler, gets the
    // user out of a list that can never settle a record
    // (executor-dispatch.spec.ts, "a dispatch the list cannot settle").
    const usdtReachingBack = [
      ...receiptsSince(RECONCILE_PAGE_SIZE - 1, "USDT"),
      rowBefore("usdt-old", "USDT"),
    ]
    const fiveUsdtThenUsd = [
      ...receiptsSince(5, "USDT"),
      ...Array.from({ length: 20 }, (_, i) => rowBefore(`usd-${i}`)),
    ]
    const longerThanAPage: {
      list: string
      pages: TransactionRow[][]
      paidFrom: "USD" | "USDT"
    }[] = [
      {
        list: "both wallets' newest 20 rows came since the dispatch",
        pages: [
          receiptsSince(RECONCILE_PAGE_SIZE, "USDT"),
          receiptsSince(RECONCILE_PAGE_SIZE, "USD"),
        ],
        paidFrom: "USDT",
      },
      {
        // Paid from the legacy USD wallet, before the account was cut over.
        list: "the payment itself, among the legacy USD wallet's rows after a full USDT page",
        pages: [receiptsSince(RECONCILE_PAGE_SIZE, "USDT"), [send(), funded("USD")]],
        paidFrom: "USD",
      },
      {
        list: "a USDT block that reaches back, then a USD send since the dispatch that names nothing",
        pages: [usdtReachingBack, [apiLightningRow({ id: "usd-send" })]],
        paidFrom: "USDT",
      },
      {
        list: "a USDT block that reaches back, then the USD block from before the dispatch",
        pages: [usdtReachingBack, [rowBefore("usd-old")]],
        paidFrom: "USDT",
      },
      {
        list: "five USDT rows, the whole wallet, then the USD block from before the dispatch, split across the page",
        pages: [
          fiveUsdtThenUsd.slice(0, RECONCILE_PAGE_SIZE),
          fiveUsdtThenUsd.slice(RECONCILE_PAGE_SIZE),
        ],
        paidFrom: "USDT",
      },
    ]
    longerThanAPage.forEach(({ list, pages, paidFrom }) =>
      it(`is unknown when the next page is refused: ${list}`, async () => {
        const { reconcile, graphql } = reconcilerOver(pages, old)
        const paid = record(
          { ...intraledger, settlementCurrency: paidFrom },
          DISPATCHED_AT_MS,
          paidFrom,
        )

        await expect(reconcile(paid)).resolves.toBe("unknown")
        // It asked for the next page with the cursor the API handed it,
        // and the API refused it.
        expect(graphql.transactions).toHaveBeenCalledTimes(2)
        expect(graphql.transactions.mock.calls[1][0]).toEqual({
          first: RECONCILE_PAGE_SIZE,
          after: pages[0][pages[0].length - 1].id,
        })
        await expect(graphql.transactions.mock.results[1].value).rejects.toThrow(
          FLASH_CURSOR_REFUSED,
        )
      }),
    )

    describe("were the next page served (ENG-724)", () => {
      // ENG-724 makes lnflash/flash serve the next page. The reasoning about
      // each wallet's rows (the note at the top of reconcile.ts) is made for
      // one page, each wallet's newest 20 rows, and is to be revisited then.
      // Until it is, a page past the first can show the payment settled but
      // never prove it absent. These fakes hand out a cursor flash takes, 24
      // hex characters, and serve the next page.
      const servedOver = (pages: TransactionRow[][]) => {
        const graphql = fakeGraphqlRail()
        graphql.transactions.mockImplementation(servedTransactions(pages))
        const reconcile = createTransactionListReconciler({
          graphql: graphql as never,
          now: () => old,
        })
        return { reconcile, graphql }
      }

      // Read to its end, each list shows the paying USDT wallet's rows, has
      // every wallet's block read back past the dispatch, and holds no sent
      // row since it: everything absent asks for but ending on its first
      // page.
      const readBackOverTwoPages: { list: string; pages: TransactionRow[][] }[] = [
        {
          list: "a USDT block that reaches back, then the USD block from before the dispatch",
          pages: [usdtReachingBack, [rowBefore("usd-old")]],
        },
        {
          list: "five USDT rows, the whole wallet, then the USD block from before the dispatch, split across the page",
          pages: [
            fiveUsdtThenUsd.slice(0, RECONCILE_PAGE_SIZE),
            fiveUsdtThenUsd.slice(RECONCILE_PAGE_SIZE),
          ],
        },
      ]
      readBackOverTwoPages.forEach(({ list, pages }) =>
        it(`is unknown though the second page is served and reads back: ${list}`, async () => {
          const { reconcile, graphql } = servedOver(pages)
          const usdtSend = record(
            { ...intraledger, settlementCurrency: "USDT" },
            DISPATCHED_AT_MS,
            "USDT",
          )

          await expect(reconcile(usdtSend)).resolves.toBe("unknown")
          // It asked for the second page with a cursor flash takes, and got
          // it, to the list's end.
          expect(graphql.transactions).toHaveBeenCalledTimes(2)
          expect(graphql.transactions.mock.calls[1][0]).toEqual({
            first: RECONCILE_PAGE_SIZE,
            after: expect.stringMatching(FLASH_CURSOR),
          })
          await expect(graphql.transactions.mock.results[1].value).resolves.toEqual({
            rows: pages[1],
            hasNextPage: false,
            endCursor: expect.stringMatching(FLASH_CURSOR),
          })
        }),
      )

      it("still settles a payment the second page shows", async () => {
        // Paid from the legacy USD wallet, before the account was cut over:
        // the send is among its rows, after a full USDT page.
        const { reconcile, graphql } = servedOver([
          receiptsSince(RECONCILE_PAGE_SIZE, "USDT"),
          [send(), funded("USD")],
        ])

        await expect(reconcile(record())).resolves.toBe("settled")
        expect(graphql.transactions).toHaveBeenCalledTimes(2)
      })
    })

    it("is unknown when the list says there is more but gives no cursor to ask for it", async () => {
      const graphql = fakeGraphqlRail()
      graphql.transactions.mockResolvedValue({
        rows: [rowBefore("before")],
        hasNextPage: true,
        endCursor: null,
      })
      const reconcile = createTransactionListReconciler({
        graphql: graphql as never,
        now: () => old,
      })

      await expect(reconcile(record())).resolves.toBe("unknown")
      expect(graphql.transactions).toHaveBeenCalledTimes(1)
    })
  })
})
