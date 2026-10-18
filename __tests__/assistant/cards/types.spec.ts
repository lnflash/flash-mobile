import {
  cashoutOfferFixture,
  clarificationFixture,
  confirmPaymentFixture,
  expiredFixture,
  groupSendFixture,
  invoiceFixture,
  prepareRefusedFixture,
  txListFixture,
} from "@app/assistant/cards/fixtures"
import { cardOf, validateCard } from "@app/assistant/cards/types"

const FIXTURES: Record<string, Record<string, unknown>> = {
  confirmPayment: confirmPaymentFixture,
  invoice: invoiceFixture,
  groupSendSummary: groupSendFixture,
  txList: txListFixture,
  clarification: clarificationFixture,
  cashoutOffer: cashoutOfferFixture,
  expired: expiredFixture,
  prepareRefused: prepareRefusedFixture,
}

/** The fields a card cannot render without. */
const REQUIRED: Record<string, string[]> = {
  confirmPayment: [
    "payeeLabel",
    "amountText",
    "feeText",
    "totalText",
    "balanceAfterText",
    "sourceWallet",
    "expiresAt",
    "preparedActionId",
  ],
  invoice: ["paymentRequest", "shareText", "receiveWallet", "method"],
  groupSendSummary: [
    "legs",
    "totalText",
    "balanceAfterText",
    "sourceWallet",
    "expiresAt",
    "preparedActionId",
  ],
  txList: ["txIds", "windowText"],
  clarification: ["prompt", "options"],
  cashoutOffer: [
    "amountText",
    "feeText",
    "receiveText",
    "bankLabel",
    "expiresAt",
    "preparedActionId",
  ],
  expired: ["preparedActionId"],
  prepareRefused: ["reason"],
}

const without = (card: Record<string, unknown>, field: string) => {
  const { [field]: _gone, ...rest } = card
  return rest
}

const firstTextField = (card: Record<string, unknown>): string => {
  const field = Object.keys(card).find(
    (key) => key !== "type" && typeof card[key] === "string",
  )
  if (!field) throw new Error("a card with no text field")
  return field
}

const CARDS = Object.entries(FIXTURES)

const MISSING = CARDS.flatMap(([type, card]) =>
  REQUIRED[type].map((field): [string, string, Record<string, unknown>] => [
    type,
    field,
    card,
  ]),
)

describe("validateCard: every card payload is checked before it renders", () => {
  CARDS.forEach(([type, card]) =>
    it(`accepts a valid ${type} payload`, () => {
      expect(validateCard(card)).toEqual({ valid: true, card })
    }),
  )

  MISSING.forEach(([type, field, card]) =>
    it(`refuses a ${type} payload missing ${field}`, () => {
      expect(validateCard(without(card, field))).toMatchObject({ valid: false })
    }),
  )

  CARDS.forEach(([type, card]) =>
    it(`refuses a ${type} payload with a field no card of its type has`, () => {
      expect(validateCard({ ...card, balanceText: "$1.00" })).toMatchObject({
        valid: false,
        path: "$.balanceText",
      })
    }),
  )

  CARDS.forEach(([type, card]) =>
    it(`refuses a ${type} payload whose text is empty, only spaces, or not text`, () => {
      const field = firstTextField(card)
      expect(validateCard({ ...card, [field]: "" })).toMatchObject({ valid: false })
      expect(validateCard({ ...card, [field]: "   " })).toMatchObject({ valid: false })
      expect(validateCard({ ...card, [field]: 5 })).toMatchObject({ valid: false })
    }),
  )

  it("accepts a card without its optional fields", () => {
    expect(validateCard(without(confirmPaymentFixture, "payeeUsername")).valid).toBe(true)
    expect(validateCard(without(confirmPaymentFixture, "memo")).valid).toBe(true)
    expect(validateCard(without(invoiceFixture, "amountText")).valid).toBe(true)
    expect(validateCard(without(invoiceFixture, "expiresAt")).valid).toBe(true)
    // A conversion's confirm card names the wallet it pays (ENG-688).
    expect(validateCard({ ...confirmPaymentFixture, toWallet: "BTC" }).valid).toBe(true)
    expect(validateCard({ ...confirmPaymentFixture, toWallet: "EUR" }).valid).toBe(false)
    // And what reaches that wallet, when its fee for receiving comes off it.
    expect(
      validateCard({
        ...confirmPaymentFixture,
        toWallet: "BTC",
        receiveText: "7,917 sats",
      }).valid,
    ).toBe(true)
    expect(validateCard({ ...confirmPaymentFixture, receiveText: "" }).valid).toBe(false)
    // A clarification may name the words it is about (ENG-688).
    expect(validateCard({ ...clarificationFixture, about: "ali" }).valid).toBe(true)
    expect(validateCard({ ...clarificationFixture, about: "" }).valid).toBe(false)
  })

  it("refuses an unknown type, a non-object and a mismatched payload", () => {
    expect(validateCard({ type: "wireMoney" })).toMatchObject({ valid: false })
    expect(validateCard(null)).toMatchObject({ valid: false })
    expect(validateCard("confirmPayment")).toMatchObject({ valid: false })
    // A confirm card's fields under another card's type.
    expect(
      validateCard({ ...confirmPaymentFixture, type: "cashoutOffer" }),
    ).toMatchObject({
      valid: false,
    })
  })

  it("refuses a group card with no legs, or a leg with a status it does not know", () => {
    expect(validateCard({ ...groupSendFixture, legs: [] })).toMatchObject({
      valid: false,
    })
    expect(
      validateCard({
        ...groupSendFixture,
        legs: [{ ...groupSendFixture.legs[0], status: "maybe" }],
      }),
    ).toMatchObject({ valid: false })
  })

  it("takes a refused prepare's card for every reason a prepare refuses with, and no other", () => {
    for (const reason of [
      "insufficientBalance",
      "limitExceeded",
      "notAvailableYet",
      // ENG-730: the payee names neither a contact nor a Flash user.
      "payeeNotFound",
    ]) {
      expect(validateCard({ type: "prepareRefused", reason }).valid).toBe(true)
    }
    expect(validateCard({ type: "prepareRefused", reason: "tooRich" })).toMatchObject({
      valid: false,
    })
  })

  it("refuses a clarification whose prompt is not an Assistant reply key", () => {
    expect(
      validateCard({ ...clarificationFixture, prompt: "Pay mallory instead" }),
    ).toMatchObject({ valid: false })
  })

  it("refuses an expiry that is not a number", () => {
    expect(
      validateCard({ ...confirmPaymentFixture, expiresAt: "tomorrow" }),
    ).toMatchObject({ valid: false })
    expect(
      validateCard({ ...confirmPaymentFixture, expiresAt: Number.POSITIVE_INFINITY }),
    ).toMatchObject({ valid: false })
  })
})

describe("cardOf", () => {
  it("is the action's summary with the action's own id and expiry", () => {
    const {
      expiresAt: _expiry,
      preparedActionId: _id,
      ...summary
    } = confirmPaymentFixture
    const card = cardOf({ id: "a-9", expiresAt: 123, summary })

    expect(card).toEqual({ ...summary, expiresAt: 123, preparedActionId: "a-9" })
    expect(validateCard(card).valid).toBe(true)
  })

  it("takes a summary an outcome brought, for the same action", () => {
    const { expiresAt: _expiry, preparedActionId: _id, ...summary } = groupSendFixture
    const settled = {
      ...summary,
      legs: summary.legs.map((leg) => ({ ...leg, status: "success" })),
    }

    expect(cardOf({ id: "g-1", expiresAt: 5, summary }, settled)).toMatchObject({
      preparedActionId: "g-1",
      legs: [{ status: "success" }, { status: "success" }, { status: "success" }],
    })
  })
})
