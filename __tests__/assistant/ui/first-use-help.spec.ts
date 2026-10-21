import { readFirstUseQuestion } from "@app/assistant/ui/first-use-help"
import { readGrammar } from "@app/assistant/grammar"

const ctx = { displayCurrency: "JMD", displaySymbol: "J$" }
const questions = [
  ["What can you help me do?", "capabilities"],
  ["How much money do I have?", "getBalances"],
  ["How do I add money to Flash?", "funding"],
  ["How do I top up my wallet?", "funding"],
  ["How can someone pay me?", "receiving"],
  ["Can you send 500 Jamaican dollars to Mom?", "prepareSend"],
  ["How much is Bitcoin worth in Jamaican dollars?", "getPrice"],
  ["What will this payment cost in fees?", "fees"],
  ["Did my last payment go through?", "paymentStatus"],
  ["How do I cash out?", "cashout"],
  ["How to cashout to my account", "cashout"],
  ["how do i cash out", "cashout"],
  ["How do I cashout?", "cashout"],
  ["How do I cash out to my bank account?", "cashout"],
  ["How can I withdraw my money to my bank?", "cashout"],
  ["How do I settle to my account?", "cashout"],
  ["How do settlements work?", "cashout"],
  ["What are settlements?", "cashout"],
  ["How mi cash out to mi account?", "cashout"],
  ["What happens to my money if I lose my phone?", "recovery"],
  ["Show me my recent payments.", "getTransactions"],
  ["Who paid me recently?", "getTransactions"],
  ["What's my Flash address?", "address"],
  ["Can you make a payment request for 2,000 Jamaican dollars?", "prepareReceive"],
  ["How do I scan a payment QR code?", "scan"],
  ["What's the difference between my cash and Bitcoin wallets?", "wallets"],
  ["What is Lightning?", "lightning"],
  ["Can I cancel a payment or get a refund?", "refunds"],
  ["What can I do without internet?", "offline"],
  ["Why can't I send this amount?", "limits"],
  ["How do I contact support?", "support"],
]
questions.forEach(([question, expected]) =>
  it(`routes ${question} to ${expected} without a model`, () => {
    const help = readFirstUseQuestion(question)
    const grammar = readGrammar(question, ctx)
    expect(
      help?.topic ??
        help?.call?.intent ??
        (grammar?.kind === "call" ? grammar.call.intent : grammar?.kind),
    ).toBe(expected)
  }),
)
;[
  "cashout 500 to my account",
  "how do i cash out 500 to bob",
  "how do i cash out and send 500 to mom",
  "send 500 to Mom for support",
  "send 5 to lightning",
  "refund 5 to Bob",
  "What is Lightning? send 5 to Mom",
  "How can someone pay me at https://evil.example",
  "How do I contact support at bob@example.com",
  "how do I send 5 to mom tomorrow",
  "what happens to my money if i lose my phone and send 500 to mom",
].forEach((text) =>
  it(`does not reinterpret an action or unapproved question: ${text}`, () => {
    expect(readFirstUseQuestion(text)).toBeUndefined()
  }),
)
;[
  "Please, what is Lightning?",
  "wah is lightning",
  "how can i receive money",
  "what can i do offline",
].forEach((text) =>
  it(`recognizes approved help variants: ${text}`, () => {
    expect(readFirstUseQuestion(text)).toBeDefined()
  }),
)
