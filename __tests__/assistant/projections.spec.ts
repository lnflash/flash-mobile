import {
  projectBalances,
  projectContact,
  projectTransactionDetails,
  projectTransactions,
  TransactionsPayload,
  TxRow,
} from "@app/assistant/registry/projections"
import type { TransactionDetailsRow } from "@app/assistant/rails/graphql-rail"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

const row = (overrides: Partial<TxRow> = {}): TxRow => ({
  rail: "graphql",
  id: "tx-1",
  direction: "SEND",
  status: "SUCCESS",
  amount: toUsdMoneyAmount(500),
  fee: toUsdMoneyAmount(0),
  timestamp: 1_760_000_000,
  memo: "Rent for May",
  counterparty: "bob",
  paymentHash: "a3f1c2",
  ...overrides,
})

const transactions = (rows: TxRow[]): TransactionsPayload => ({
  transactions: rows,
  window: {
    searchedCount: rows.length,
    oldestTimestamp: 1_760_000_000,
    rails: ["graphql", "btc"],
    replyKey: "Assistant.searchedWindow",
  },
  btc: { state: "ok" },
})

describe("projections", () => {
  describe("transactions", () => {
    it("drops payment hashes, memos and counterparties by default", () => {
      const projected = projectTransactions(
        transactions([
          row(),
          row({ rail: "btc", id: "p-1", amount: toBtcMoneyAmount(2100) }),
        ]),
        {},
      )

      expect(projected.transactions).toEqual([
        {
          rail: "graphql",
          id: "tx-1",
          direction: "SEND",
          status: "SUCCESS",
          amount: toUsdMoneyAmount(500),
          fee: toUsdMoneyAmount(0),
          timestamp: 1_760_000_000,
        },
        {
          rail: "btc",
          id: "p-1",
          direction: "SEND",
          status: "SUCCESS",
          amount: toBtcMoneyAmount(2100),
          fee: toUsdMoneyAmount(0),
          timestamp: 1_760_000_000,
        },
      ])
    })

    it("keeps memo and counterparty when the query targeted them, never the hash", () => {
      const projected = projectTransactions(transactions([row()]), { query: "rent" })

      expect(projected.transactions[0]).toMatchObject({
        memo: "Rent for May",
        counterparty: "bob",
      })
      expect(projected.transactions[0]).not.toHaveProperty("paymentHash")
    })

    it("does not change the payload it projects", () => {
      const payload = transactions([row()])

      projectTransactions(payload, {})

      expect(payload.transactions[0].paymentHash).toBe("a3f1c2")
    })
  })

  it("drops the hash, preimage, invoice, memo and on-chain identifiers from details", () => {
    const details = {
      __typename: "TransactionDetails",
      id: "tx-1",
      accountId: "acct",
      amount: 5,
      currency: "USD",
      status: "PENDING",
      type: "onchain",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: null,
      invoice: "lnbc1",
      paymentHash: "hash",
      paymentPreimage: "preimage",
      memo: "memo",
      address: "bc1q",
      txid: "txid",
      vout: 1,
      confirmations: 0,
      fee: 1,
    } as TransactionDetailsRow

    expect(projectTransactionDetails({ details })).toEqual({
      id: "tx-1",
      status: "PENDING",
      type: "onchain",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: null,
      confirmations: 0,
    })
  })

  it("drops wallet ids from balances and contacts", () => {
    expect(
      projectBalances({
        balances: [
          { wallet: "USD", walletId: "w-usd", state: "ok", balance: toUsdMoneyAmount(1) },
          {
            wallet: "USDT",
            walletId: "w-usdt",
            state: "unavailable",
            replyKey: "Assistant.balanceUnavailable",
          },
          { wallet: "BTC", state: "syncing", replyKey: "Assistant.btcSyncing" },
        ],
      }),
    ).toEqual({
      balances: [
        { wallet: "USD", state: "ok", balance: toUsdMoneyAmount(1) },
        {
          wallet: "USDT",
          state: "unavailable",
          replyKey: "Assistant.balanceUnavailable",
        },
        { wallet: "BTC", state: "syncing", replyKey: "Assistant.btcSyncing" },
      ],
    })
    expect(
      projectContact({
        username: "carol",
        alias: "Mom",
        defaultWallet: { id: "w-carol", walletCurrency: "USD" },
      }),
    ).toEqual({ username: "carol", alias: "Mom", walletCurrency: "USD" })
  })
})
