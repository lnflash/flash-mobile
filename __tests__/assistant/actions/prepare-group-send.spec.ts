jest.mock("@app/screens/send-bitcoin-screen/payment-destination", () => ({
  ...jest.requireActual("@app/screens/send-bitcoin-screen/payment-destination"),
  parseDestination: jest.fn(),
}))

import { validateCard, cardOf } from "@app/assistant/cards/types"
import { createAttemptJournal } from "@app/assistant/engine/attempt-journal"
import { createExecutor } from "@app/assistant/engine/executor"
import {
  MAX_GROUP_LEGS,
  prepareGroupSend,
  prepareGroupSendRun,
  PrepareGroupSendArgs,
} from "@app/assistant/registry/actions/prepare-group-send"
import { FIXED_CENT_INTRALEDGER_TTL_MS } from "@app/assistant/registry/actions/shared/expiry"
import type {
  ExecuteContext,
  ExecutionOutcome,
  PreparedAction,
  ToolResult,
} from "@app/assistant/registry/types"
import { PaymentSendResult } from "@app/graphql/generated"
import {
  createLightningDestination,
  parseDestination,
} from "@app/screens/send-bitcoin-screen/payment-destination"
import { resetIdempotencyKeySupport } from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { memoryStorage } from "../executor-harness"
import {
  bolt11,
  fakeActionCtx,
  JMD_PRICE,
  NOW_MS,
  recordingTelemetry,
  USD_PRICE,
  wallet,
} from "../fakes"

const parse = parseDestination as jest.Mock

const contact = (username: string, alias: string | null = null) => ({
  __typename: "UserContact",
  id: username,
  username,
  alias,
  transactionsCount: 0,
})

const CONTACTS = [
  contact("alice", "Alice"),
  contact("bob", "Bob"),
  contact("carol", "Carol"),
  contact("dave", "Dave"),
]

type LegScript = "sent" | "failed" | "lost" | "reused" | "keyRefused"

/**
 * $100 in the cash wallet. The send trigger answers per recipient: each
 * payee's queue of answers, then success.
 */
const setup = ({
  display = "USD",
  cents = 10_000,
}: { display?: "USD" | "JMD"; cents?: number } = {}) => {
  const fake = fakeActionCtx({ displayCurrency: display })
  fake.graphql.wallets.mockResolvedValue([
    wallet({ id: "my-usd", walletCurrency: "USD", balance: cents }),
  ])
  fake.graphql.realtimePrice.mockResolvedValue(display === "USD" ? USD_PRICE : JMD_PRICE)
  fake.graphql.contacts.mockResolvedValue(CONTACTS)
  fake.graphql.accountDefaultWallet.mockImplementation(async (username: string) => ({
    __typename: "PublicWallet",
    id: `${username}-wallet`,
    walletCurrency: "USD",
  }))
  const scripts = new Map<string, LegScript[]>()
  const script = (username: string, ...answers: LegScript[]) =>
    scripts.set(`${username}-wallet`, answers)
  fake.mutations.intraLedgerUsdPaymentSend.mockImplementation(async (options) => {
    const answer =
      scripts.get(options.variables.input.recipientWalletId)?.shift() ?? "sent"
    switch (answer) {
      case "lost":
        throw new Error("Network request failed")
      case "keyRefused":
        // An API older than the field refuses the input during coercion;
        // the gate then sends once more without the key (idempotency-support.ts).
        throw new Error(
          'Variable "$input" got invalid value; Field "idempotencyKey" is not defined by type "IntraLedgerUsdPaymentSendInput".',
        )
      case "failed":
        return {
          data: {
            intraLedgerUsdPaymentSend: {
              status: PaymentSendResult.Failure,
              errors: [{ message: "Recipient wallet is locked" }],
            },
          },
        }
      case "reused":
        return {
          data: {
            intraLedgerUsdPaymentSend: {
              status: PaymentSendResult.Failure,
              errors: [
                {
                  message:
                    "This idempotency key was already used for a different payment",
                },
              ],
            },
          },
        }
      default:
        return {
          data: {
            intraLedgerUsdPaymentSend: { status: PaymentSendResult.Success, errors: [] },
          },
        }
    }
  })
  return { ...fake, script }
}

const prepared = (result: ToolResult<unknown>): PreparedAction => {
  if (result.kind !== "prepared")
    throw new Error(`not prepared: ${JSON.stringify(result)}`)
  return result.preparedAction
}

const run = (args: PrepareGroupSendArgs, fake: ReturnType<typeof setup>) =>
  prepareGroupSendRun(args, fake.ctx)

const confirm = (action: PreparedAction): Promise<ExecutionOutcome> => {
  const ctx: ExecuteContext = {
    attempt: action.attempt,
    journalDispatch: jest.fn(async (): Promise<void> => undefined),
  }
  return action.execute(ctx)
}

/** Each dispatch's recipient and key, in order. */
const dispatches = (fake: ReturnType<typeof setup>) =>
  fake.mutations.intraLedgerUsdPaymentSend.mock.calls.map(([options]) => ({
    to: options.variables.input.recipientWalletId as string,
    key: options.variables.input.idempotencyKey as string,
    amount: options.variables.input.amount as number,
  }))

const statuses = (outcome: ExecutionOutcome) =>
  (outcome.summary?.legs as { status: string }[]).map(({ status }) => status)

const FOUR = {
  payees: ["Alice", "Bob", "Carol", "Dave"],
  total: "10",
  currency: "USD" as const,
}

beforeEach(() => {
  parse.mockReset()
  resetIdempotencyKeySupport()
})

describe("prepareGroupSend", () => {
  it("splits in code, the leftover cent to the first payee, one intraledger leg each", async () => {
    const fake = setup()

    const action = prepared(
      await run(
        { payees: ["Alice", "Bob", "Carol"], total: "10", currency: "USD" },
        fake,
      ),
    )

    expect(action.intent).toBe("prepareGroupSend")
    expect(action.summary).toEqual({
      type: "groupSendSummary",
      legs: [
        {
          payeeLabel: "Alice",
          payeeUsername: "alice",
          amountText: "USD 334",
          status: "pending",
        },
        {
          payeeLabel: "Bob",
          payeeUsername: "bob",
          amountText: "USD 333",
          status: "pending",
        },
        {
          payeeLabel: "Carol",
          payeeUsername: "carol",
          amountText: "USD 333",
          status: "pending",
        },
      ],
      totalText: "USD 1000",
      balanceAfterText: "USD 9000",
      sourceWallet: "USD",
    })
    expect(validateCard(cardOf(action)).valid).toBe(true)
    // Fixed cents to Flash users: the 10-minute cap, the shortest leg's.
    expect(action.expiresAt).toBe(NOW_MS + FIXED_CENT_INTRALEDGER_TTL_MS)
    expect(action.dispatch?.match).toEqual({
      kind: "anyOf",
      matches: [
        expect.objectContaining({ counterPartyWalletId: "alice-wallet", amount: 334 }),
        expect.objectContaining({ counterPartyWalletId: "bob-wallet", amount: 333 }),
        expect.objectContaining({ counterPartyWalletId: "carol-wallet", amount: 333 }),
      ],
    })
  })

  it("sends every leg once, in order, each under its own key, and succeeds", async () => {
    const fake = setup()
    const action = prepared(await run(FOUR, fake))

    const outcome = await confirm(action)

    expect(outcome.status).toBe("succeeded")
    expect(statuses(outcome)).toEqual(["success", "success", "success", "success"])
    const sent = dispatches(fake)
    expect(sent.map(({ to }) => to)).toEqual([
      "alice-wallet",
      "bob-wallet",
      "carol-wallet",
      "dave-wallet",
    ])
    expect(sent.map(({ amount }) => amount)).toEqual([250, 250, 250, 250])
    // Two legs never share an AttemptState, so never a key.
    expect(new Set(sent.map(({ key }) => key)).size).toBe(4)
  })

  it("stops at a failure on leg 2 of 4, legs 3 and 4 not attempted, every leg on the card", async () => {
    const fake = setup()
    fake.script("bob", "failed")
    const action = prepared(await run(FOUR, fake))

    const outcome = await confirm(action)

    expect(statuses(outcome)).toEqual([
      "success",
      "failed",
      "not_attempted",
      "not_attempted",
    ])
    expect(dispatches(fake).map(({ to }) => to)).toEqual(["alice-wallet", "bob-wallet"])
    // Alice's leg went: the group stays open for the rest, and is never
    // prepared again.
    expect(outcome).toMatchObject({
      status: "unknown",
      replyKey: "Assistant.groupSendPartial",
      next: "retrySameAttempt",
    })
    expect(validateCard(cardOf(action, outcome.summary)).valid).toBe(true)
  })

  it("retries only the legs that did not go: a lost answer under its original key, never a sent leg again", async () => {
    const fake = setup()
    fake.script("bob", "lost")
    const action = prepared(await run(FOUR, fake))

    const first = await confirm(action)
    expect(statuses(first)).toEqual([
      "success",
      "unknown",
      "not_attempted",
      "not_attempted",
    ])
    expect(first).toMatchObject({ status: "unknown", next: "retrySameAttempt" })

    const second = await confirm(action)

    expect(second.status).toBe("succeeded")
    const sent = dispatches(fake)
    expect(sent.map(({ to }) => to)).toEqual([
      "alice-wallet",
      "bob-wallet",
      "bob-wallet",
      "carol-wallet",
      "dave-wallet",
    ])
    // Bob's retry is a replay of the first dispatch: the same key exactly.
    expect(sent[2].key).toBe(sent[1].key)
    // Alice was never paid twice.
    expect(sent.filter(({ to }) => to === "alice-wallet")).toHaveLength(1)
  })

  it("retries a failed leg too, under a new attempt, since nothing moved for it", async () => {
    const fake = setup()
    fake.script("bob", "failed")
    const action = prepared(await run(FOUR, fake))

    await confirm(action)
    const second = await confirm(action)

    expect(second.status).toBe("succeeded")
    const bob = dispatches(fake).filter(({ to }) => to === "bob-wallet")
    expect(bob).toHaveLength(2)
  })

  it("never retries a leg whose outcome cannot be retried: the card points to the history", async () => {
    const fake = setup()
    fake.script("bob", "reused")
    const action = prepared(await run(FOUR, fake))

    const outcome = await confirm(action)

    expect(outcome).toMatchObject({
      status: "unknown",
      replyKey: "Assistant.checkHistory",
      next: "checkHistory",
    })
    expect(statuses(outcome)).toEqual([
      "success",
      "unknown",
      "not_attempted",
      "not_attempted",
    ])
  })

  it("never retries a leg that went out without its key and then lost its answer", async () => {
    const fake = setup()
    // Bob's first dispatch is refused for the key, the gate re-sends it
    // keyless, and that answer is lost: the server never saw a key to replay.
    fake.script("bob", "keyRefused", "lost")
    const action = prepared(await run(FOUR, fake))

    const outcome = await confirm(action)

    expect(outcome).toMatchObject({ status: "unknown", next: "checkHistory" })
    expect(statuses(outcome)).toEqual([
      "success",
      "unknown",
      "not_attempted",
      "not_attempted",
    ])
    const bob = dispatches(fake).filter(({ to }) => to === "bob-wallet")
    expect(bob).toHaveLength(2)
    expect(bob[1].key).toBeUndefined()
  })

  it("lets a group where nothing went be confirmed again, as one where nothing moved", async () => {
    const fake = setup()
    fake.script("alice", "failed")
    const action = prepared(await run(FOUR, fake))

    const outcome = await confirm(action)

    expect(outcome).toMatchObject({
      status: "failed",
      replyKey: "Assistant.paymentFailed",
      next: "confirmAgain",
    })
    expect(statuses(outcome)).toEqual([
      "failed",
      "not_attempted",
      "not_attempted",
      "not_attempted",
    ])
  })

  it("splits a bare amount in the display currency, and each leg converts its own share", async () => {
    const fake = setup({ display: "JMD" })

    const action = prepared(await run({ payees: ["Alice", "Bob"], total: "1570" }, fake))

    // J$1,570 is J$785 each, $5.00 at J$157 to the dollar.
    expect(
      (action.summary.legs as { amountText: string }[]).map(
        ({ amountText }) => amountText,
      ),
    ).toEqual(["JMD 78500 (USD 500)", "JMD 78500 (USD 500)"])
  })

  it("asks about an ambiguous payee before anything else, naming that payee, with no partial card", async () => {
    const fake = setup()
    fake.graphql.contacts.mockResolvedValue([...CONTACTS, contact("alina", "Alina")])

    await expect(
      run({ payees: ["Bob", "ali", "Dave"], total: "9" }, fake),
    ).resolves.toEqual({
      kind: "clarification",
      card: expect.objectContaining({
        prompt: "Assistant.pickContact",
        about: "ali",
        options: expect.arrayContaining([
          expect.objectContaining({ id: "contact:alice" }),
        ]),
      }),
    })
    expect(fake.mutations.intraLedgerUsdPaymentSend).not.toHaveBeenCalled()
  })

  it("pays Flash users only", async () => {
    const fake = setup()
    const invoice = bolt11({ id: "x" })
    parse.mockResolvedValue(
      createLightningDestination({
        paymentType: "lightning",
        valid: true,
        paymentRequest: invoice,
      } as never),
    )

    await expect(
      run({ payees: ["Alice", invoice], total: "10", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.groupSendPayeesUnsupported",
    })
  })

  it("refuses the same person twice, by name or by pick", async () => {
    const fake = setup()

    await expect(
      run({ payees: ["Alice", "contact:alice"], total: "10", currency: "USD" }, fake),
    ).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.groupSendDuplicatePayee",
    })
  })

  it("refuses an amount too small to give everyone something", async () => {
    const fake = setup()

    await expect(run({ ...FOUR, total: "0.03" }, fake)).resolves.toEqual({
      kind: "error",
      userMessage: "Assistant.groupShareTooSmall",
    })
  })

  it("refuses with the shortfall card when the legs together are over the balance", async () => {
    // Each $2.50 leg fits a $9 balance; the four together do not.
    const fake = setup({ cents: 900 })

    await expect(run(FOUR, fake)).rejects.toMatchObject({ reason: "insufficientBalance" })
  })

  it("refuses with the limit card when the legs together are over the day's limit", async () => {
    const fake = setup()
    fake.graphql.accountLimits.mockResolvedValue({
      withdrawal: [],
      internalSend: [{ totalLimit: 10_000, remainingLimit: 900, interval: 86_400 }],
      convert: [],
    })

    await expect(run(FOUR, fake)).rejects.toMatchObject({ reason: "limitExceeded" })
  })

  it("takes at most the legs its schema allows", () => {
    const tooMany = Array.from({ length: MAX_GROUP_LEGS + 1 }, (_, i) => `p${i}`)

    expect(prepareGroupSend.validate({ payees: tooMany, total: "10" }).valid).toBe(false)
    expect(prepareGroupSend.validate({ payees: [], total: "10" }).valid).toBe(false)
    expect(
      prepareGroupSend.validate({ payees: ["Alice", "Bob"], total: "10" }).valid,
    ).toBe(true)
  })
})

describe("prepareGroupSend through the executor", () => {
  const wire = () => {
    const fake = setup()
    const journal = createAttemptJournal({ storage: memoryStorage() })
    const executor = createExecutor({
      auth: { availability: async () => "none", authenticate: async () => false },
      journal,
      reconcile: jest.fn(async () => "unknown" as const),
      telemetry: recordingTelemetry().telemetry,
      now: () => NOW_MS,
    })
    return { fake, journal, executor }
  }

  it("keeps a partly sent group open and its record held, then finishes it and crosses the record off", async () => {
    const { fake, journal, executor } = wire()
    fake.script("carol", "failed")
    const action = prepared(await run(FOUR, fake))
    executor.addPrepared(action, "text")

    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      kind: "executed",
      outcome: { status: "unknown", next: "retrySameAttempt" },
    })
    // Something went: the record stays for reconciliation.
    await expect(journal.pending()).resolves.toEqual([
      expect.objectContaining({ preparedActionId: action.id }),
    ])

    await expect(executor.executePreparedAction(action.id)).resolves.toMatchObject({
      outcome: { status: "succeeded" },
    })
    await expect(journal.pending()).resolves.toEqual([])
    expect(dispatches(fake).map(({ to }) => to)).toEqual([
      "alice-wallet",
      "bob-wallet",
      "carol-wallet",
      "carol-wallet",
      "dave-wallet",
    ])
  })
})
