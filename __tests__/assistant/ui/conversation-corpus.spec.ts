jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))

import { confirmPaymentFixture, groupSendFixture } from "@app/assistant/cards/fixtures"
import type { HelpTopic } from "@app/assistant/ui/first-use-help"
import type { ScreenDestination } from "@app/assistant/ui/screen-destinations"
import type { NewEntry } from "@app/assistant/ui/thread-store"
import { answerUtterance, type TurnEnv } from "@app/assistant/ui/turn"
import { CASH_WALLETS, env, fakeRuntime } from "./thread-harness"
import { fakeModelAdapter, modelCall } from "../fakes"

// Authored user-facing names and expected routes, independent of the router's aliases.
const screens: readonly [string, ScreenDestination][] = [
  ["home", "home"],
  ["support", "support"],
  ["my contacts", "contacts"],
  ["map", "map"],
  ["messages", "chat"],
  ["my chat profile", "chatProfile"],
  ["settings", "settings"],
  ["my account", "account"],
  ["bank accounts", "bankAccounts"],
  ["transfers", "transfers"],
  ["receive money", "receive"],
  ["QR scanner", "scanner"],
  ["payment history", "history"],
  ["my card", "card"],
  ["invite friends", "invite"],
  ["referrals", "referrals"],
  ["notifications", "notifications"],
  ["language", "language"],
  ["currency settings", "currency"],
  ["appearance", "theme"],
  ["wallet backup", "backup"],
  ["security", "security"],
  ["account limits", "limits"],
  ["default wallet", "defaultWallet"],
  ["chat settings", "socialSettings"],
  ["price chart", "bitcoinPrice"],
  ["Bitcoin wallet", "bitcoinWallet"],
]
const navigationPhrases = [
  "Open NAME",
  "Show me NAME",
  "Could you open NAME, please?",
  "Could you please show me NAME again?",
  "Please take me to NAME",
  "Where can I find NAME?",
  "I want to see NAME",
]

const noPayments = (harness: ReturnType<typeof fakeRuntime>) => {
  Object.values(harness.mutations).forEach((mutation) =>
    expect(mutation).not.toHaveBeenCalled(),
  )
  expect(harness.actions.requestCashout).not.toHaveBeenCalled()
}
const turn = async (
  harness: ReturnType<typeof fakeRuntime>,
  text: string,
  overrides: Partial<TurnEnv> = {},
) => {
  harness.runtime.transcript.append([{ kind: "user", text }])
  const replies = await answerUtterance(harness.runtime, text, env(overrides))
  harness.runtime.transcript.append(replies)
  return replies
}
const seed = (
  harness: ReturnType<typeof fakeRuntime>,
  text: string,
  ...replies: NewEntry[]
) => harness.runtime.transcript.append([{ kind: "user", text }, ...replies])

describe("Ask Flash conversational coverage", () => {
  const helpQuestions: readonly [string, HelpTopic][] = [
    ["What can you do?", "capabilities"],
    ["How do I top up my wallet?", "funding"],
    ["How can I deposit money into Flash?", "funding"],
    ["How do I add money?", "funding"],
    ["How do I receive money?", "receiving"],
    ["How can someone pay me?", "receiving"],
    ["What are the payment fees?", "fees"],
    ["How much are the fees?", "fees"],
    ["How do I cash out to my account?", "cashout"],
    ["How to cashout to my account?", "cashout"],
    ["What are settlements?", "cashout"],
    ["What if I lose my phone?", "recovery"],
    ["How do I recover my wallet?", "recovery"],
    ["How do I scan a QR code?", "scan"],
    ["Why do I have two wallets?", "wallets"],
    ["What is Lightning?", "lightning"],
    ["How does Lightning work?", "lightning"],
    ["Can I cancel a payment?", "refunds"],
    ["Can I get a refund?", "refunds"],
    ["Does Flash work offline?", "offline"],
    ["What can I do without internet?", "offline"],
    ["Can I use Flash without internet?", "offline"],
    ["How do I contact support?", "support"],
    ["How can I reach Flash support?", "support"],
  ]
  for (const offline of [false, true])
    for (const [question, topic] of helpQuestions) {
      for (const text of [question, `${question.replace(/[?.!]+$/, "")} again?`]) {
        it(`answers bundled help ${
          offline ? "offline" : "online"
        }: ${text}`, async () => {
          const harness = fakeRuntime()
          expect(await turn(harness, text, { isOffline: offline })).toEqual([
            { kind: "help", topic },
          ])
          expect(harness.runTool).not.toHaveBeenCalled()
          noPayments(harness)
        })
      }
    }
  const namedRequests = [
    ["Add NAME to my contacts", "add"],
    ["Remove NAME from my contacts", "remove"],
    ["Show me NAME's profile", "profile"],
  ] as const
  for (const name of ["dreadmax", "dread max", "dread marks", "dread mask"])
    for (const [phrase, operation] of namedRequests) {
      const base = phrase.replace("NAME", name)
      for (const question of [
        base,
        `${base} again`,
        `Could you please ${base.toLowerCase()}?`,
      ]) {
        it(`routes a username request for verification: ${question}`, async () => {
          const harness = fakeRuntime()
          expect(await turn(harness, question)).toEqual([
            { kind: "contactAction", username: name, operation, hostname: "flashapp.me" },
          ])
          expect(harness.runTool).not.toHaveBeenCalled()
          noPayments(harness)
        })
      }
    }
  for (const offline of [false, true])
    for (const [name, destination] of screens)
      for (const phrase of navigationPhrases) {
        const question = phrase.replace("NAME", name)
        it(`${offline ? "offline" : "online"}: ${question}`, async () => {
          const harness = fakeRuntime()
          expect(await turn(harness, question, { isOffline: offline })).toEqual([
            { kind: "screen", destination },
          ])
          expect(harness.runTool).not.toHaveBeenCalled()
          noPayments(harness)
        })
      }

  const unsupported = [
    "My card was stolen",
    "My account is locked",
    "I was charged twice",
    "My bank transfer is missing",
    "I need to dispute a card charge",
    "Change my phone number",
    "Close my account",
    "I think I was scammed",
    "Why was my identity verification rejected?",
    "I need a tax report",
    "Book me a flight",
    "What's the weather?",
    "Predict tomorrow's bitcoin price",
    "Delete all my transactions",
    "Approve my withdrawal",
    "Tell me my recovery phrase",
  ]
  for (const question of unsupported)
    it(`offers support for: ${question}`, async () => {
      const harness = fakeRuntime()
      expect(await turn(harness, question)).toEqual([
        { kind: "reply", replyKey: "Assistant.unknownIntent" },
      ])
      expect(harness.runTool).not.toHaveBeenCalled()
      noPayments(harness)
    })

  for (const question of [
    "Talk to Pulse",
    "Speak to a human",
    "Chat with an agent",
    "I want to talk to a support agent",
    "Get me support",
    "Escalate this",
  ]) {
    it(`routes an explicit support request: ${question}`, async () => {
      const harness = fakeRuntime()
      expect(await turn(harness, question)).toEqual([
        { kind: "screen", destination: "support" },
      ])
      noPayments(harness)
    })
  }

  it("remembers a help topic, opens its screen, and repeats that destination", async () => {
    const harness = fakeRuntime()
    expect(await turn(harness, "How do I receive money?")).toEqual([
      { kind: "help", topic: "receiving" },
    ])
    expect(await turn(harness, "Open it")).toEqual([
      { kind: "screen", destination: "receive" },
    ])
    expect(await turn(harness, "Again")).toEqual([
      { kind: "screen", destination: "receive" },
    ])
    expect(harness.runTool).not.toHaveBeenCalled()
  })

  it("supports a topical follow-up to a help answer", async () => {
    const harness = fakeRuntime()
    await turn(harness, "How do I add money to Flash?")
    expect(await turn(harness, "What about fees?")).toEqual([
      { kind: "help", topic: "fees" },
    ])
    expect(await turn(harness, "And offline?")).toEqual([
      { kind: "help", topic: "offline" },
    ])
  })

  it("repeats live information with fresh reads, including consecutive follow-ups", async () => {
    const harness = fakeRuntime()
    harness.graphql.wallets.mockResolvedValue(CASH_WALLETS)
    expect((await turn(harness, "What's my balance?"))[0].kind).toBe("balances")
    harness.graphql.wallets.mockResolvedValue([{ ...CASH_WALLETS[0], balance: 9876 }])
    const repeated = await turn(harness, "Again")
    expect(repeated[0]).toMatchObject({
      kind: "balances",
      payload: {
        balances: [
          expect.objectContaining({ balance: expect.objectContaining({ amount: 9876 }) }),
          expect.anything(),
        ],
      },
    })
    expect((await turn(harness, "One more time"))[0].kind).toBe("balances")
    expect(harness.graphql.wallets).toHaveBeenCalledTimes(3)
    noPayments(harness)
  })

  it("can repeat saved information offline without starting a live read", async () => {
    const harness = fakeRuntime()
    harness.graphql.wallets.mockResolvedValue(CASH_WALLETS)
    await turn(harness, "What's my balance?")
    harness.graphql.wallets.mockClear()
    expect((await turn(harness, "Again", { isOffline: true }))[0]).toMatchObject({
      kind: "balances",
      stale: true,
    })
    expect(harness.graphql.wallets).not.toHaveBeenCalled()
  })

  it("remembers an information request understood by the device model without asking the model again", async () => {
    const harness = fakeRuntime({
      modelAdapter: fakeModelAdapter(modelCall({ intent: "getBalances", args: {} })),
    })
    harness.graphql.wallets.mockResolvedValue(CASH_WALLETS)
    expect(
      (await turn(harness, "How loaded am I right now?", { onDeviceModel: true }))[0]
        .kind,
    ).toBe("balances")
    expect((await turn(harness, "Again", { onDeviceModel: true }))[0].kind).toBe(
      "balances",
    )
    expect(
      (await turn(harness, "Can you say that again?", { onDeviceModel: true }))[0].kind,
    ).toBe("balances")
    expect(harness.modelAdapter.decide).toHaveBeenCalledTimes(1)
    expect(harness.graphql.wallets).toHaveBeenCalledTimes(3)
    noPayments(harness)
  })

  it("remembers only a verified selected contact for profile and contact follow-ups", async () => {
    const harness = fakeRuntime()
    seed(harness, "Add dread marks to my contacts", {
      kind: "contactAction",
      username: "dread marks",
      resolvedUsername: "dreadmax",
      operation: "add",
      hostname: "flashapp.me",
    })
    expect(await turn(harness, "Show their profile")).toEqual([
      {
        kind: "contactAction",
        username: "dreadmax",
        operation: "profile",
        hostname: "flashapp.me",
      },
    ])
    const last = harness.runtime.transcript.get().entries.slice(-1)[0]
    harness.runtime.transcript.rememberContact(last.id, "dreadmax")
    expect(await turn(harness, "Remove them from my contacts")).toEqual([
      {
        kind: "contactAction",
        username: "dreadmax",
        operation: "remove",
        hostname: "flashapp.me",
      },
    ])
    expect(harness.runTool).not.toHaveBeenCalled()
    noPayments(harness)
  })

  it("never treats an unresolved spoken name or an unchosen suggestion as a person", async () => {
    for (const prior of [
      {
        kind: "contactAction",
        username: "dread marks",
        operation: "add",
        hostname: "flashapp.me",
      },
      {
        kind: "card",
        card: {
          type: "clarification",
          prompt: "Assistant.pickContact",
          options: [
            { id: "dreadmax", label: "dreadmax" },
            { id: "dreadmark", label: "dreadmark" },
          ],
        },
      },
    ] as NewEntry[]) {
      const harness = fakeRuntime()
      seed(harness, "Add dread marks to my contacts", prior)
      expect(await turn(harness, "Remove them from my contacts")).toEqual([
        { kind: "reply", replyKey: "Assistant.contextPersonUnclear" },
      ])
      expect(harness.runTool).not.toHaveBeenCalled()
      noPayments(harness)
    }
  })

  it("can open the verified payment recipient's profile, without sending another payment", async () => {
    const harness = fakeRuntime()
    seed(harness, "Pay Jane five dollars", { kind: "card", card: confirmPaymentFixture })
    expect(await turn(harness, "Show their profile")).toEqual([
      {
        kind: "contactAction",
        username: "jane_doe",
        operation: "profile",
        hostname: "flashapp.me",
      },
    ])
    noPayments(harness)
  })

  for (const card of [confirmPaymentFixture, groupSendFixture])
    for (const question of ["Again", "Do that again", "Same thing again"]) {
      it(`does not repeat ${card.type} with ${question}`, async () => {
        const harness = fakeRuntime()
        seed(harness, "Send five dollars", { kind: "card", card })
        expect(await turn(harness, question)).toEqual([
          { kind: "reply", replyKey: "Assistant.contextActionReview" },
        ])
        expect(harness.runTool).not.toHaveBeenCalled()
        noPayments(harness)
      })
    }

  it("does not interpret yes as payment confirmation", async () => {
    const harness = fakeRuntime()
    seed(harness, "Pay Jane five dollars", { kind: "card", card: confirmPaymentFixture })
    expect(await turn(harness, "Yes")).toEqual([
      { kind: "reply", replyKey: "Assistant.unknownIntent" },
    ])
    noPayments(harness)
  })

  for (const question of [
    "Pay them 2 cents",
    "Send 2 cents to them",
    "Could you please pay her 2 cents?",
  ]) {
    it(`prepares a fresh reviewed payment with an explicit new amount: ${question}`, async () => {
      const harness = fakeRuntime()
      seed(harness, "Show me Jane's profile", {
        kind: "contactAction",
        username: "jane_doe",
        resolvedUsername: "jane_doe",
        operation: "profile",
        hostname: "flashapp.me",
      })
      harness.runTool.mockResolvedValue({
        kind: "error",
        userMessage: "Assistant.invalidArguments",
      })
      await turn(harness, question)
      expect(harness.runTool.mock.calls[0][0]).toEqual({
        intent: "prepareSend",
        args: { payee: "jane_doe", amount: "0.02" },
      })
      noPayments(harness)
    })
  }

  for (const question of [
    "Pay them the same amount",
    "Send him 10 more",
    "Pay her again",
  ]) {
    it(`does not reuse or invent a payment amount: ${question}`, async () => {
      const harness = fakeRuntime()
      seed(harness, "Pay Jane five dollars", {
        kind: "card",
        card: confirmPaymentFixture,
      })
      expect(await turn(harness, question)).toEqual([
        {
          kind: "reply",
          replyKey: "Assistant.amountUnclear",
          params: { currency: "USD" },
        },
      ])
      expect(harness.runTool).not.toHaveBeenCalled()
      noPayments(harness)
    })
  }

  it("offers support after a miss and remembers the support offer for yes", async () => {
    const harness = fakeRuntime()
    await turn(harness, "My card was stolen")
    expect(await turn(harness, "Yes please")).toEqual([
      { kind: "screen", destination: "support" },
    ])
    noPayments(harness)
  })

  it("does not carry a contact reference into a new account/session or past an unrelated turn", async () => {
    const harness = fakeRuntime()
    seed(harness, "Add dreadmax to my contacts", {
      kind: "contactAction",
      username: "dreadmax",
      resolvedUsername: "dreadmax",
      operation: "add",
      hostname: "flashapp.me",
    })
    await turn(harness, "Open settings")
    expect(await turn(harness, "Remove them from my contacts")).toEqual([
      { kind: "reply", replyKey: "Assistant.contextPersonUnclear" },
    ])
    const newSession = fakeRuntime()
    expect(await turn(newSession, "Show their profile")).toEqual([
      { kind: "reply", replyKey: "Assistant.contextPersonUnclear" },
    ])
  })

  it("understands polite pronouns without looking up someone literally named them", async () => {
    const harness = fakeRuntime()
    seed(harness, "Show me dreadmax's profile", {
      kind: "contactAction",
      username: "dreadmax",
      resolvedUsername: "dreadmax",
      operation: "profile",
      hostname: "flashapp.me",
    })
    expect(await turn(harness, "Could you please remove them from my contacts?")).toEqual(
      [
        {
          kind: "contactAction",
          username: "dreadmax",
          operation: "remove",
          hostname: "flashapp.me",
        },
      ],
    )
    const fresh = fakeRuntime()
    expect(await turn(fresh, "Please remove them from my contacts")).toEqual([
      { kind: "reply", replyKey: "Assistant.contextPersonUnclear" },
    ])
    expect(fresh.runTool).not.toHaveBeenCalled()
  })
})
