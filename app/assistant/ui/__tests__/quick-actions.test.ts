import { readQuickAction } from "../quick-actions"

const ctx = { displayCurrency: "USD", displaySymbol: "$" }

describe("Ask Flash quick actions", () => {
  it("routes cash-out to a reviewed offer with an exact amount", () => {
    expect(readQuickAction("Cash out $50 to my bank account", ctx)).toEqual({
      kind: "cashout",
      amount: "50",
      currency: "USD",
    })
    expect(readQuickAction("Cash out", ctx)).toEqual({ kind: "cashout" })
    expect(readQuickAction("Cash out $50 and send $20 to Bob", ctx)).toBeUndefined()
  })

  it("finds merchants and payments without guessing a recipient", () => {
    expect(readQuickAction("Where can I spend Flash?", ctx)).toEqual({
      kind: "merchants",
      query: undefined,
    })
    expect(readQuickAction("Find merchants named Cafe", ctx)).toEqual({
      kind: "merchants",
      query: "cafe",
    })
    expect(readQuickAction("Show me my last payment to Alex", ctx)).toEqual({
      kind: "payment",
      query: "alex",
    })
  })

  it("passes a requested amount into the card top-up flow", () => {
    expect(readQuickAction("Add $20 to my card", ctx)).toEqual({
      kind: "cardTopUp",
      amount: "20",
      currency: "USD",
    })
    expect(readQuickAction("Top up my Flashcard", ctx)).toEqual({ kind: "cardTopUp" })
    expect(readQuickAction("Top up my card with 20 USD", ctx)).toEqual({
      kind: "cardTopUp",
      amount: "20",
      currency: "USD",
    })
  })

  it("requires an explicit username and action for Chat contacts", () => {
    expect(readQuickAction("Add alice to my contacts", ctx)).toEqual({
      kind: "contact",
      operation: "add",
      username: "alice",
    })
    expect(readQuickAction("Show me Alice's profile", ctx)).toEqual({
      kind: "contact",
      operation: "profile",
      username: "alice",
    })
    expect(readQuickAction("Remove alice from my contacts", ctx)).toEqual({
      kind: "contact",
      operation: "remove",
      username: "alice",
    })
    expect(readQuickAction("Add Alice-B to my contacts", ctx)).toEqual({
      kind: "contact",
      operation: "add",
      username: "alice-b",
    })
    expect(readQuickAction("Remove my contacts", ctx)).toBeUndefined()
    expect(readQuickAction("Do not add alice as a contact", ctx)).toBeUndefined()
    expect(readQuickAction("Remove alice as a contact", ctx)).toBeUndefined()
  })

  for (const [utterance, operation, username] of [
    ["Add dreadmax as a contact", "add", "dreadmax"],
    ["Add dreadlocks as a contact", "add", "dreadlocks"],
    ["Drug Max as a contact", "add", "drug max"],
    ["Save dread Max as my contact", "add", "dread max"],
    ["Add dread marks to contacts", "add", "dread marks"],
    ["Remove dread marks from contacts", "remove", "dread marks"],
    ["Remove dread marks from my contacts", "remove", "dread marks"],
    ["Add dread Max to my contacts", "add", "dread max"],
    ["Show me dread marks's profile", "profile", "dread marks"],
    ["Open dread Max profile", "profile", "dread max"],
    ["Show me José’s profile", "profile", "josé"],
    ["Remove dread marks from my contacts again", "remove", "dread marks"],
    ["Show me dread marks's profile again", "profile", "dread marks"],
    ["Add again to my contacts", "add", "again"],
    ["Show me again's profile", "profile", "again"],
  ]) {
    it(`passes the spoken name in ${utterance} to shared username lookup`, () => {
      expect(readQuickAction(utterance, ctx)).toEqual({
        kind: "contact",
        operation,
        username,
      })
    })
  }

  it("accepts spoken names in payment-history searches without joining separate commands", () => {
    expect(readQuickAction("Show me my last payment to dread marks", ctx)).toEqual({
      kind: "payment",
      query: "dread marks",
    })
    expect(readQuickAction("Add alice and bob to my contacts", ctx)).toBeUndefined()
    expect(readQuickAction("Remove alice then bob from my contacts", ctx)).toBeUndefined()
  })
})
