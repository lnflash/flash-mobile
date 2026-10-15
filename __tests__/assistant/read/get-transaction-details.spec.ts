import { getTransactionDetails } from "@app/assistant/registry/read/get-transaction-details"
import { fakeCtx } from "../fakes"

const DETAILS = {
  __typename: "TransactionDetails",
  id: "tx-1",
  accountId: "acct-1",
  amount: 12.5,
  currency: "USD",
  status: "SUCCESS",
  type: "lightning",
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:05Z",
  invoice: "lnbc1secret",
  paymentHash: "hash-secret",
  paymentPreimage: "preimage-secret",
  memo: "memo-secret",
  address: "bc1q-secret",
  txid: "txid-secret",
  vout: 0,
  confirmations: 3,
  fee: 0.01,
}

describe("getTransactionDetails", () => {
  it("asks the GraphQL rail by id", async () => {
    const { ctx, graphql } = fakeCtx()
    graphql.transactionDetails.mockResolvedValue(DETAILS)

    const result = await getTransactionDetails.run(
      { transactionId: "tx-1", rail: "graphql" },
      ctx,
    )

    expect(graphql.transactionDetails).toHaveBeenCalledWith("tx-1")
    expect(result).toEqual({ kind: "answer", payload: { details: DETAILS } })
  })

  it("says details are unavailable for a BTC row, without asking GraphQL", async () => {
    const { ctx, graphql } = fakeCtx()

    const result = await getTransactionDetails.run(
      { transactionId: "p1", rail: "btc" },
      ctx,
    )

    expect(result).toEqual({ kind: "error", userMessage: "Assistant.detailsUnavailable" })
    expect(graphql.transactionDetails).not.toHaveBeenCalled()
  })

  it("says details are unavailable when the server has none", async () => {
    const { ctx } = fakeCtx()

    await expect(
      getTransactionDetails.run({ transactionId: "tx-x", rail: "graphql" }, ctx),
    ).resolves.toEqual({ kind: "error", userMessage: "Assistant.detailsUnavailable" })
  })

  it("projects the status only: no hash, preimage, invoice, memo, address or amount", () => {
    const projected = getTransactionDetails.project({ details: DETAILS }, {})

    expect(projected).toEqual({
      id: "tx-1",
      status: "SUCCESS",
      type: "lightning",
      createdAt: "2026-10-01T12:00:00Z",
      updatedAt: "2026-10-01T12:00:05Z",
      confirmations: 3,
    })
    expect(JSON.stringify(projected)).not.toMatch(/secret/)
  })

  it("needs both the id and the rail its row named", () => {
    expect(getTransactionDetails.validate({ transactionId: "tx-1" }).valid).toBe(false)
    expect(
      getTransactionDetails.validate({ transactionId: "tx 1", rail: "graphql" }).valid,
    ).toBe(false)
    expect(
      getTransactionDetails.validate({ transactionId: "tx-1", rail: "graphql" }).valid,
    ).toBe(true)
  })
})
