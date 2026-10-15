import { WalletCurrency } from "@app/graphql/generated"
import { routeIntent } from "@app/assistant/engine/intent-router"
import { AMOUNT_PATTERN } from "@app/assistant/engine/parse-amount"
import {
  ObjectSchema,
  SchemaDefinitionError,
} from "@app/assistant/engine/schema-validator"
import { createRegistry, defineRead } from "@app/assistant/registry/define"
import { ACTION_INTENTS } from "@app/assistant/registry/types"
import { toBtcMoneyAmount, toUsdMoneyAmount } from "@app/types/amounts"

const answer = async () => ({ kind: "answer" as const, payload: null })

// Stand-in tools. The router is generic over the registry, so the intents
// these borrow do not matter, only their schemas.
const transactionsTool = defineRead({
  intent: "getTransactions",
  description: "test",
  input: {
    type: "object",
    properties: {
      first: { type: "integer", maximum: 20 },
      direction: { enum: ["SEND", "RECEIVE"] },
      query: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    additionalProperties: false,
  },
  run: answer,
  project: (payload) => payload,
})

// An amount-bearing input, the shape ENG-688's prepareSend takes.
const amountTool = defineRead({
  intent: "decodePaymentRequest",
  description: "test",
  input: {
    type: "object",
    properties: {
      amount: { type: "string", pattern: AMOUNT_PATTERN },
      currency: { enum: ["BTC", "USD", "USDT"] },
    },
    required: ["amount", "currency"],
    additionalProperties: false,
  },
  amounts: { amount: "currency" },
  run: answer,
  project: (payload) => payload,
})

const registry = createRegistry([transactionsTool, amountTool])

describe("routeIntent", () => {
  const unknownCalls: [string, unknown][] = [
    ["an unknown intent", { intent: "sendAllMyMoney", args: {} }],
    ["a near miss", { intent: "getBalances ", args: {} }],
    ["a different case", { intent: "GETBALANCES" }],
    ["no intent", { args: {} }],
    ["a non-string intent", { intent: 42 }],
    ["a string instead of a call", "getBalances"],
    ["null", null],
    ["an array", [{ intent: "getBalances" }]],
  ]
  unknownCalls.forEach(([name, raw]) =>
    it(`answers unknownIntent for ${name}`, () => {
      expect(routeIntent(raw, registry)).toEqual({
        ok: false,
        intent: "unknown",
        replyKey: "Assistant.unknownIntent",
      })
    }),
  )

  ACTION_INTENTS.forEach((intent) =>
    it(`answers ${intent} with notYetAvailable, distinct from unknownIntent`, () => {
      expect(routeIntent({ intent, args: { amount: "5" } }, registry)).toEqual({
        ok: false,
        intent,
        replyKey: "Assistant.notYetAvailable",
      })
    }),
  )

  it("answers a known read intent with no tool as notYetAvailable too", () => {
    expect(routeIntent({ intent: "getBalances" }, registry)).toMatchObject({
      ok: false,
      replyKey: "Assistant.notYetAvailable",
    })
  })

  it("routes a valid call to its tool, treating absent args as empty", () => {
    expect(routeIntent({ intent: "getTransactions" }, registry)).toEqual({
      ok: true,
      intent: "getTransactions",
      tool: transactionsTool,
      args: {},
    })
    expect(
      routeIntent(
        {
          intent: "getTransactions",
          args: { first: 20, direction: "SEND", query: "rent" },
        },
        registry,
      ),
    ).toMatchObject({ ok: true, args: { first: 20, direction: "SEND", query: "rent" } })
  })

  const badArgs: [string, unknown][] = [
    ["an extra property", { first: 5, memo: "x" }],
    ["a wrong type", { first: "5" }],
    ["a fraction for an integer", { first: 2.5 }],
    ["a value over the maximum", { first: 21 }],
    ["an enum miss", { direction: "BOTH" }],
    ["an empty query", { query: "" }],
    ["null args", null],
    ["array args", [5]],
    ["string args", "first=5"],
  ]
  badArgs.forEach(([name, args]) =>
    it(`answers invalidArguments for ${name}`, () => {
      expect(routeIntent({ intent: "getTransactions", args }, registry)).toEqual({
        ok: false,
        intent: "getTransactions",
        replyKey: "Assistant.invalidArguments",
      })
    }),
  )

  it("refuses a call with anything beside intent and args", () => {
    expect(
      routeIntent({ intent: "getTransactions", args: {}, confirm: true }, registry),
    ).toMatchObject({ ok: false, replyKey: "Assistant.invalidArguments" })
  })

  describe("amounts", () => {
    const route = (args: Record<string, unknown>) =>
      routeIntent({ intent: "decodePaymentRequest", args }, registry)

    it("refuses a JSON number", () => {
      expect(route({ amount: 12.5, currency: "USD" })).toMatchObject({
        ok: false,
        replyKey: "Assistant.invalidArguments",
      })
    })

    it('accepts "12.50" USD and hands the tool 1250 cents, never the string', () => {
      expect(route({ amount: "12.50", currency: "USD" })).toMatchObject({
        ok: true,
        args: { amount: toUsdMoneyAmount(1250), currency: "USD" },
      })
    })

    it("refuses a 3-decimal USD amount instead of rounding it", () => {
      expect(route({ amount: "12.505", currency: "USD" })).toMatchObject({
        ok: false,
        replyKey: "Assistant.invalidArguments",
      })
    })

    it("reads 8 decimal places of BTC as sats", () => {
      expect(route({ amount: "0.00000001", currency: "BTC" })).toMatchObject({
        ok: true,
        args: { amount: toBtcMoneyAmount(1) },
      })
    })

    it("refuses an amount outside the pattern and a missing currency", () => {
      expect(route({ amount: "12.50x", currency: "USD" }).ok).toBe(false)
      expect(route({ amount: "-5", currency: "USD" }).ok).toBe(false)
      expect(route({ amount: "5" }).ok).toBe(false)
      expect(route({ amount: "5", currency: "EUR" }).ok).toBe(false)
    })

    it("leaves the caller's args untouched", () => {
      const args = { amount: "1", currency: WalletCurrency.Usd }
      route(args)
      expect(args).toEqual({ amount: "1", currency: "USD" })
    })
  })
})

describe("defining a tool", () => {
  const define = (input: unknown, amounts?: Record<string, string>) => () =>
    defineRead({
      intent: "getPrice",
      description: "test",
      input: input as ObjectSchema,
      amounts,
      run: answer,
      project: (payload) => payload,
    })

  it("throws at definition time on an unsupported schema keyword", () => {
    expect(
      define({
        type: "object",
        properties: { memo: { type: "string", maxLength: 80 } },
        additionalProperties: false,
      }),
    ).toThrow(SchemaDefinitionError)
  })

  it("throws when an amount field is not a pattern-checked string", () => {
    expect(
      define(
        {
          type: "object",
          properties: { amount: { type: "number" }, currency: { enum: ["USD"] } },
          additionalProperties: false,
        },
        { amount: "currency" },
      ),
    ).toThrow(SchemaDefinitionError)
  })

  it("throws when an amount's currency field allows other currencies", () => {
    expect(
      define(
        {
          type: "object",
          properties: {
            amount: { type: "string", pattern: AMOUNT_PATTERN },
            currency: { enum: ["USD", "EUR"] },
          },
          additionalProperties: false,
        },
        { amount: "currency" },
      ),
    ).toThrow(SchemaDefinitionError)
  })

  it("refuses two tools for one intent", () => {
    expect(() => createRegistry([transactionsTool, transactionsTool])).toThrow(
      "Two tools registered for getTransactions",
    )
  })
})
