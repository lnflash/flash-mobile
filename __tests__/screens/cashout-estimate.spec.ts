import {
  estimateJmdReceiveCents,
  pickDefaultBankAccount,
  pickDefaultExternalAccount,
  selectsJmdPayout,
} from "@app/screens/topup-cashout-flow/cashout-estimate"

const jmd = (id: string, isDefault = false) => ({ id, currency: "JMD", isDefault })
const usd = (id: string, isDefault = false) => ({ id, currency: "USD", isDefault })

describe("pickDefaultBankAccount", () => {
  it("puts the user's selection for this cashout ahead of the server default", () => {
    const accounts = [usd("u1"), jmd("j1", true), jmd("j2")]
    expect(pickDefaultBankAccount(accounts, { selectedId: "j2" })?.id).toBe("j2")
    // ...in any currency: an explicit USD pick beats a default JMD account.
    expect(pickDefaultBankAccount(accounts, { selectedId: "u1" })?.id).toBe("u1")
  })

  it("falls back selected → server default → first JMD → first", () => {
    expect(pickDefaultBankAccount([usd("u1"), jmd("j1"), jmd("j2", true)])?.id).toBe("j2")
    // The server default is honoured in any currency (it is the user's choice
    // in Settings), not overridden by the presence of a JMD account.
    expect(pickDefaultBankAccount([usd("u1", true), jmd("j1")])?.id).toBe("u1")
    expect(pickDefaultBankAccount([usd("u1"), jmd("j1"), jmd("j2")])?.id).toBe("j1")
    expect(pickDefaultBankAccount([usd("u1"), usd("u2")])?.id).toBe("u1")
    expect(pickDefaultBankAccount([])).toBeUndefined()
  })

  it("ignores a selection that is no longer in the list (e.g. just removed)", () => {
    const accounts = [usd("u1"), jmd("j1", true)]
    expect(pickDefaultBankAccount(accounts, { selectedId: "gone" })?.id).toBe("j1")
    expect(pickDefaultBankAccount(accounts, { selectedId: null })?.id).toBe("j1")
  })

  it("never matches an id-less account against an unset selection", () => {
    const accounts = [{ id: null, currency: "JMD" }, jmd("j1", true)]
    expect(pickDefaultBankAccount(accounts, { selectedId: undefined })?.id).toBe("j1")
    expect(pickDefaultBankAccount(accounts, { selectedId: null })?.id).toBe("j1")
  })

  describe("with a payout currency fixed by the offer", () => {
    it("chooses among that currency: selected → default → first", () => {
      const accounts = [usd("u1", true), jmd("j1"), jmd("j2", true), jmd("j3")]
      const pick = (selectedId?: string) =>
        pickDefaultBankAccount(accounts, { selectedId, preferredCurrency: "JMD" })?.id
      expect(pick("j3")).toBe("j3")
      expect(pick()).toBe("j2")
      // A selection outside the payout currency cannot win.
      expect(pick("u1")).toBe("j2")
      expect(
        pickDefaultBankAccount([usd("u1", true), jmd("j1"), jmd("j3")], {
          preferredCurrency: "JMD",
        })?.id,
      ).toBe("j1")
    })

    it("falls back to all accounts when none match the currency", () => {
      const accounts = [usd("u1"), usd("u2", true)]
      expect(pickDefaultBankAccount(accounts, { preferredCurrency: "JMD" })?.id).toBe(
        "u2",
      )
      expect(
        pickDefaultBankAccount(accounts, { selectedId: "u1", preferredCurrency: "JMD" })
          ?.id,
      ).toBe("u1")
    })
  })

  it("is case-insensitive on currency", () => {
    expect(pickDefaultBankAccount([usd("u1"), { id: "j1", currency: "jmd" }])?.id).toBe(
      "j1",
    )
    expect(
      pickDefaultBankAccount([usd("u1", true), { id: "j1", currency: "jmd" }], {
        preferredCurrency: "Jmd",
      })?.id,
    ).toBe("j1")
  })
})

describe("selectsJmdPayout", () => {
  it("follows the server default's currency", () => {
    expect(selectsJmdPayout([usd("u1"), jmd("j1", true)])).toBe(true)
    expect(selectsJmdPayout([usd("u1", true), jmd("j1")])).toBe(false)
  })

  it("prefers JMD when no account is flagged default", () => {
    expect(selectsJmdPayout([usd("u1"), jmd("j1")])).toBe(true)
  })

  it("follows the user's selection for this cashout", () => {
    const accounts = [usd("u1"), jmd("j1", true)]
    expect(selectsJmdPayout(accounts, "u1")).toBe(false)
    expect(selectsJmdPayout(accounts, "j1")).toBe(true)
  })

  it("is false for USD-only or empty account lists", () => {
    expect(selectsJmdPayout([usd("u1"), usd("u2", true)])).toBe(false)
    expect(selectsJmdPayout([])).toBe(false)
  })

  it("agrees with pickDefaultBankAccount for every selection", () => {
    // The equivalence the preview relies on: the payout currency shown is
    // always the currency of the account onNext will send.
    const accounts = [usd("u1", true), jmd("j1"), usd("u2"), jmd("j2")]
    for (const selectedId of [undefined, null, "u1", "u2", "j1", "j2", "missing"]) {
      const picked = pickDefaultBankAccount(accounts, { selectedId })
      expect(picked?.currency === "JMD").toBe(selectsJmdPayout(accounts, selectedId))
    }
  })
})

describe("pickDefaultExternalAccount", () => {
  const ext = (id: string, isDefault = false) => ({ id, isDefault })

  it("falls back selected → server default → first", () => {
    const accounts = [ext("e1"), ext("e2", true), ext("e3")]
    expect(pickDefaultExternalAccount(accounts, "e3")?.id).toBe("e3")
    expect(pickDefaultExternalAccount(accounts)?.id).toBe("e2")
    expect(pickDefaultExternalAccount(accounts, "gone")?.id).toBe("e2")
    expect(pickDefaultExternalAccount([ext("e1"), ext("e3")])?.id).toBe("e1")
    expect(pickDefaultExternalAccount([])).toBeUndefined()
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
