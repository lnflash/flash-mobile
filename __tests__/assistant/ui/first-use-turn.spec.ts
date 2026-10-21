jest.mock("react-native-fingerprint-scanner", () => ({
  __esModule: true,
  default: { isSensorAvailable: jest.fn(), authenticate: jest.fn(), release: jest.fn() },
}))
jest.mock("react-native-secure-key-store", () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  ACCESSIBLE: {},
}))
import { answerUtterance } from "@app/assistant/ui/turn"
import { env, fakeRuntime, CASH_WALLETS } from "./thread-harness"
import { graphqlTx, page, btcPayment } from "../fakes"

const guides = [
  "What can you help me do?",
  "How do I add money to Flash?",
  "How can someone pay me?",
  "What will this payment cost in fees?",
  "How do I cash out?",
  "What happens to my money if I lose my phone?",
  "How do I scan a payment QR code?",
  "What's the difference between my cash and Bitcoin wallets?",
  "What is Lightning?",
  "Can I cancel a payment or get a refund?",
  "What can I do without internet?",
  "How do I contact support?",
]
for (const isOffline of [true, false]) {
  guides.forEach((question) =>
    it(`answers locally (${isOffline ? "offline" : "online"}): ${question}`, async () => {
      const { runtime, runTool, modelAdapter, graphql, btcRail } = fakeRuntime()
      expect(
        await answerUtterance(runtime, question, env({ isOffline, onDeviceModel: true })),
      ).toEqual([expect.objectContaining({ kind: "help" })])
      expect(runTool).not.toHaveBeenCalled()
      expect(modelAdapter.isAvailable).not.toHaveBeenCalled()
      expect(graphql.wallets).not.toHaveBeenCalled()
      expect(btcRail.getBalanceSats).not.toHaveBeenCalled()
    }),
  )
}
it("does not invent balances or call the SDK on an offline cold launch", async () => {
  const { runtime, graphql, cachedGraphql, btcRail, runTool } = fakeRuntime()
  expect(
    await answerUtterance(runtime, "How much money do I have?", env({ isOffline: true })),
  ).toEqual([{ kind: "reply", replyKey: "Assistant.noSavedData" }])
  expect(graphql.wallets).not.toHaveBeenCalled()
  expect(cachedGraphql.wallets).not.toHaveBeenCalled()
  expect(btcRail.getBalanceSats).not.toHaveBeenCalled()
  expect(runTool).not.toHaveBeenCalled()
})
it("saves successful BTC balances and serves them offline without another SDK read", async () => {
  const { runtime, graphql, btcRail } = fakeRuntime()
  graphql.wallets.mockResolvedValue(CASH_WALLETS)
  btcRail.getBalanceSats.mockResolvedValue({ state: "ok", sats: 12345 })
  await answerUtterance(runtime, "How much money do I have?", env())
  btcRail.getBalanceSats.mockClear()
  graphql.wallets.mockClear()
  const entries = await answerUtterance(
    runtime,
    "How much money do I have?",
    env({ isOffline: true }),
  )
  expect(entries[0]).toMatchObject({
    kind: "balances",
    stale: true,
    asOf: expect.any(Number),
    payload: {
      balances: expect.arrayContaining([
        expect.objectContaining({ wallet: "BTC", state: "ok" }),
      ]),
    },
  })
  expect(btcRail.getBalanceSats).not.toHaveBeenCalled()
  expect(graphql.wallets).not.toHaveBeenCalled()
})
it("never quotes prices or prepares sends and invoices offline", async () => {
  const { runtime, runTool } = fakeRuntime()
  for (const question of [
    "How much is Bitcoin worth in Jamaican dollars?",
    "Can you send 500 Jamaican dollars to Mom?",
    "Can you make a payment request for 2,000 Jamaican dollars?",
  ]) {
    expect(
      await answerUtterance(
        runtime,
        question,
        env({ isOffline: true, displayCurrency: "JMD", displaySymbol: "J$" }),
      ),
    ).toEqual([{ kind: "reply", replyKey: "Assistant.actionsOffline" }])
  }
  expect(runTool).not.toHaveBeenCalled()
})
it("does not mistake an older received transaction for the latest outgoing payment", async () => {
  const { runtime, graphql, btcRail, runTool } = fakeRuntime()
  graphql.transactions.mockResolvedValue(
    page([
      graphqlTx({ id: "received", direction: "RECEIVE", createdAt: 1100 }),
      graphqlTx({ id: "sent", direction: "SEND", createdAt: 1000 }),
    ]),
  )
  btcRail.listPayments.mockResolvedValue([])
  const entries = await answerUtterance(runtime, "Did my last payment go through?", env())
  expect(runTool.mock.calls.map(([call]) => call)).toEqual([
    { intent: "getTransactions", args: { direction: "SEND", first: 2 } },
    { intent: "getTransactionDetails", args: { transactionId: "sent", rail: "graphql" } },
  ])
  expect(entries[0]).toEqual({ kind: "help", topic: "paymentStatus" })
})
it("does not choose arbitrarily between payments with the same timestamp", async () => {
  const { runtime, graphql, btcRail } = fakeRuntime()
  graphql.transactions.mockResolvedValue(
    page([
      graphqlTx({ id: "one", direction: "SEND", createdAt: 1000 }),
      graphqlTx({ id: "two", direction: "SEND", createdAt: 1000 }),
    ]),
  )
  btcRail.listPayments.mockResolvedValue([])
  await answerUtterance(runtime, "Did my last payment go through?", env())
  expect(graphql.transactionDetails).not.toHaveBeenCalled()
})
it("uses BTC list status without requesting nonexistent BTC transaction details", async () => {
  const { runtime, graphql, btcRail } = fakeRuntime()
  graphql.transactions.mockResolvedValue(page([]))
  btcRail.listPayments.mockResolvedValue([
    btcPayment({ id: "btc-last", timestamp: 1000 }),
  ])
  await answerUtterance(runtime, "Did my last payment go through?", env())
  expect(graphql.transactionDetails).not.toHaveBeenCalled()
})
it("will not identify the last payment while a dispatch is unresolved or the journal is unreadable", async () => {
  const { runtime, runTool } = fakeRuntime()
  runtime.pendingDispatches = jest.fn(async () => {
    throw new Error("unreadable")
  })
  expect(
    await answerUtterance(runtime, "Did my last payment go through?", env()),
  ).toEqual([{ kind: "reply", replyKey: "Assistant.paymentStatusUncertain" }])
  expect(runTool).not.toHaveBeenCalled()
})
it("shows account limits without guessing the reason for a failed payment", async () => {
  const { runtime, graphql } = fakeRuntime()
  graphql.accountLimits.mockResolvedValue({
    withdrawal: [],
    internalSend: [],
    convert: [],
  })
  const entries = await answerUtterance(runtime, "Why can't I send this amount?", env())
  expect(entries.map(({ kind }) => kind)).toEqual(["help", "limits"])
  graphql.accountLimits.mockClear()
  expect(
    (
      await answerUtterance(
        runtime,
        "Why can't I send this amount?",
        env({ isOffline: true }),
      )
    )[1],
  ).toMatchObject({ kind: "limits", stale: true, asOf: expect.any(Number) })
  expect(graphql.accountLimits).not.toHaveBeenCalled()
})

it("answers with the signed-in username and active instance, both online and offline", async () => {
  const { runtime, runTool } = fakeRuntime()
  runtime.getOwnUsername = jest.fn(async () => "alice")
  for (const isOffline of [false, true]) {
    expect(
      await answerUtterance(
        runtime,
        "Whats my Flash address",
        env({ isOffline, lnAddressHostname: "test.flashapp.me" }),
      ),
    ).toEqual([
      {
        kind: "address",
        state: "available",
        address: "alice@test.flashapp.me",
        stale: isOffline,
      },
    ])
  }
  expect(runTool).not.toHaveBeenCalled()
})
it("distinguishes a missing username from unavailable address data and connectivity", async () => {
  const { runtime } = fakeRuntime()
  runtime.getOwnUsername = jest.fn(async () => null)
  expect(await answerUtterance(runtime, "What's my Flash address?", env())).toEqual([
    { kind: "address", state: "notSet", stale: false },
  ])
  runtime.getOwnUsername = jest.fn(async () => undefined)
  expect(await answerUtterance(runtime, "What's my Flash address?", env())).toEqual([
    { kind: "address", state: "unavailable", stale: false },
  ])
})
