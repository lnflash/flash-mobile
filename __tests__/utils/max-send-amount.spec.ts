import { computeMaxSendAmount } from "../../app/screens/send-bitcoin-screen/max-send-amount"

describe("computeMaxSendAmount", () => {
  it("intraledger: full balance, no fee call (no fee between Flash accounts)", async () => {
    const fetchFee = jest.fn()

    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 100_000,
      fetchFee,
    })

    expect(result).toEqual({ amount: 100_000, reason: "intraledger-full-balance" })
    expect(fetchFee).not.toHaveBeenCalled()
  })

  it("external destination: balance minus the fee estimate", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => 260,
    })

    expect(result).toEqual({
      amount: 99_740,
      reason: "fee-reserved",
      feeReserved: 260,
    })
  })

  it("falls back to the full balance when no fee estimate is available", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => null,
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })

  it("falls back to the full balance when the fee fetch throws", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => {
        throw new Error("network down")
      },
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })

  it("falls back to the full balance when the fee fetch hangs past the timeout", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      // never resolves
      fetchFee: () => new Promise(() => {}),
      timeoutMs: 20,
    })

    expect(result).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })

  it("clamps to the recipient's LNURL maxSendable when it is the binding limit", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee: async () => 500,
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("keeps balance minus fee when the recipient cap is not binding", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 100_000,
      fetchFee: async () => 500,
      recipientCap: 150_000,
    })

    expect(result).toEqual({
      amount: 99_500,
      reason: "fee-reserved",
      feeReserved: 500,
    })
  })

  it("clamps intraledger sends too (BTC wallet settles them via LNURL-pay)", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "intraledger",
      balance: 1_000_000,
      fetchFee: jest.fn(),
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("applies the cap on the fee-unavailable fallback as well", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lnurl",
      balance: 1_000_000,
      fetchFee: async () => null,
      recipientCap: 150_000,
    })

    expect(result).toEqual({ amount: 150_000, reason: "recipient-cap" })
  })

  it("returns zero for a zero balance", async () => {
    const fetchFee = jest.fn()

    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 0,
      fetchFee,
    })

    expect(result).toEqual({ amount: 0, reason: "zero-balance" })
    expect(fetchFee).not.toHaveBeenCalled()
  })

  it("never goes negative when the fee exceeds the balance", async () => {
    const result = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100,
      fetchFee: async () => 500,
    })

    expect(result).toEqual({ amount: 0, reason: "fee-reserved", feeReserved: 500 })
  })

  it("treats a negative or non-finite fee as unavailable", async () => {
    const negative = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => -10,
    })
    const nan = await computeMaxSendAmount({
      paymentType: "lightning",
      balance: 100_000,
      fetchFee: async () => Number.NaN,
    })

    expect(negative).toEqual({ amount: 100_000, reason: "fee-unavailable" })
    expect(nan).toEqual({ amount: 100_000, reason: "fee-unavailable" })
  })
})
