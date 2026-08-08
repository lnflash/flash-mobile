import {
  estimateJmdReceiveCents,
  pickDefaultBankAccount,
  selectsJmdPayout,
} from "@app/screens/topup-cashout-flow/cashout-estimate"

const jmd = (id: string, isDefault = false) => ({ id, currency: "JMD", isDefault })
const usd = (id: string, isDefault = false) => ({ id, currency: "USD", isDefault })

describe("pickDefaultBankAccount", () => {
  it("prefers the stored default among JMD accounts", () => {
    const accounts = [usd("u1", true), jmd("j1", true), jmd("j2")]
    expect(pickDefaultBankAccount(accounts, "j2")?.id).toBe("j2")
  })

  it("falls back stored-JMD → default-JMD → first-JMD → stored → default → first", () => {
    expect(pickDefaultBankAccount([usd("u1"), jmd("j1", true), jmd("j2")])?.id).toBe("j1")
    expect(pickDefaultBankAccount([usd("u1"), jmd("j1"), jmd("j2")])?.id).toBe("j1")
    expect(pickDefaultBankAccount([usd("u1"), usd("u2")], "u2")?.id).toBe("u2")
    expect(pickDefaultBankAccount([usd("u1"), usd("u2", true)])?.id).toBe("u2")
    expect(pickDefaultBankAccount([usd("u1"), usd("u2")])?.id).toBe("u1")
    expect(pickDefaultBankAccount([])).toBeUndefined()
  })

  it("is case-insensitive on currency", () => {
    expect(
      pickDefaultBankAccount([{ id: "j1", currency: "jmd" }, usd("u1")])?.id,
    ).toBe("j1")
  })
})

describe("selectsJmdPayout", () => {
  it("is true when any JMD account exists — even if the stored default is USD", () => {
    // JMD accounts always win the selection chain, so the preview can decide
    // before the async stored-default id loads.
    expect(selectsJmdPayout([usd("u1", true), jmd("j1")])).toBe(true)
  })

  it("is false for USD-only or empty account lists", () => {
    expect(selectsJmdPayout([usd("u1"), usd("u2", true)])).toBe(false)
    expect(selectsJmdPayout([])).toBe(false)
  })

  it("agrees with pickDefaultBankAccount for every stored-default choice", () => {
    // The equivalence the preview relies on: no storedDefaultId value can
    // flip the payout currency away from what selectsJmdPayout reports.
    const accounts = [usd("u1", true), jmd("j1"), usd("u2"), jmd("j2", true)]
    for (const stored of [undefined, "u1", "u2", "j1", "j2", "missing"]) {
      const picked = pickDefaultBankAccount(accounts, stored)
      expect(picked?.currency === "JMD").toBe(selectsJmdPayout(accounts))
    }
  })
})

describe("estimateJmdReceiveCents", () => {
  // Mirrors backend math: fee (bps) off the USD amount first, then convert at
  // the settlement rate (JMD cents per USD, integer division).
  it("matches the backend quote math for a round amount", () => {
    // $100.00 at 2% fee and $1 = J$152.70:
    // fee = 200c, payout = 9800c, receive = 9800 * 15270 / 100 = 1,496,460 JMD cents
    expect(estimateJmdReceiveCents(10_000, 15_270, 200)).toBe(1_496_460)
  })

  it("floors like the backend integer math instead of rounding up", () => {
    // $0.99 at 2%: fee = floor(99*200/10000) = 1c, payout 98c
    // receive = floor(98 * 15333 / 100) = floor(15026.34) = 15026
    expect(estimateJmdReceiveCents(99, 15_333, 200)).toBe(15_026)
  })

  it("applies no fee when feeBasisPoints is zero", () => {
    expect(estimateJmdReceiveCents(10_000, 15_000, 0)).toBe(1_500_000)
  })

  it("returns 0 for empty or invalid inputs instead of NaN", () => {
    expect(estimateJmdReceiveCents(0, 15_270, 200)).toBe(0)
    expect(estimateJmdReceiveCents(NaN, 15_270, 200)).toBe(0)
    expect(estimateJmdReceiveCents(10_000, NaN, 200)).toBe(0)
    expect(estimateJmdReceiveCents(10_000, 15_270, -1)).toBe(0)
  })
})
