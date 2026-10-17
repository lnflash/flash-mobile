import { matchGrammar } from "@app/assistant/grammar"
import {
  BTC_PAYMENTS_LIMIT,
  getTransactions,
  TX_MAX_PAGES,
  TX_PAGE_SIZE,
} from "@app/assistant/registry/read/get-transactions"
import type { TransactionsPayload } from "@app/assistant/registry/projections"
import type { ContactRow, TransactionRow } from "@app/assistant/rails/graphql-rail"
import { BreezSdkNotInitializedError } from "@app/utils/breez-sdk/sdk-errors"
import { toBtcMoneyAmount, toWalletAmount } from "@app/types/amounts"
import {
  btcPayment,
  BtcPayment,
  fakeCtx,
  flashTransactions,
  FLASH_CURSOR_REFUSED,
  graphqlTx,
  page,
} from "../fakes"

/** GraphQL pages served by cursor, newest first; "cursor-N" is page N. */
const serve = (pages: TransactionRow[][]) => {
  const setup = fakeCtx()
  setup.graphql.transactions.mockImplementation(async ({ after }: { after?: string }) => {
    const index = after === undefined ? 0 : Number(after.replace("cursor-", ""))
    const next = index + 1 < pages.length ? `cursor-${index + 1}` : undefined
    return page(pages[index] ?? [], next)
  })
  return setup
}

/** `count` GraphQL rows, one a second apart, the newest at `newest`. */
const rows = (count: number, newest: number, idPrefix = "tx") =>
  Array.from({ length: count }, (_, i) =>
    graphqlTx({ id: `${idPrefix}-${newest - i}`, createdAt: newest - i }),
  )

const pagesOf = (pageCount: number, newest = 10_000) =>
  Array.from({ length: pageCount }, (_, p) =>
    rows(TX_PAGE_SIZE, newest - p * TX_PAGE_SIZE, `p${p}`),
  )

const answer = async (
  setup: ReturnType<typeof fakeCtx>,
  args: Record<string, unknown> = {},
): Promise<TransactionsPayload> => {
  const result = await getTransactions.run(args, setup.ctx)
  if (result.kind !== "answer") throw new Error(`expected an answer, got ${result.kind}`)
  return result.payload as TransactionsPayload
}

const enableBtc = (setup: ReturnType<typeof fakeCtx>, payments: BtcPayment[]) => {
  setup.btcRail.listPayments.mockResolvedValue(payments)
}

/** An intraledger send to a Flash user, as the API names them: by username. */
const sentTo = ({
  id,
  createdAt,
  username,
  memo,
}: {
  id: string
  createdAt: number
  username: string
  memo?: string
}) =>
  graphqlTx({
    id,
    createdAt,
    memo: memo ?? null,
    initiationVia: {
      __typename: "InitiationViaIntraLedger",
      counterPartyWalletId: `${username}-wallet`,
      counterPartyUsername: username,
    },
    settlementVia: {
      __typename: "SettlementViaIntraLedger",
      counterPartyWalletId: `${username}-wallet`,
      counterPartyUsername: username,
    },
  })

const contact = (username: string, alias: string | null = null): ContactRow =>
  ({
    __typename: "UserContact",
    id: username,
    username,
    alias,
    transactionsCount: 1,
  } as ContactRow)

describe("getTransactions", () => {
  describe("paging", () => {
    it("reads at most 5 pages of 20 looking for a match, and states the window on a miss", async () => {
      const setup = serve(pagesOf(10))
      enableBtc(setup, [])

      const payload = await answer(setup, { query: "coffee" })

      expect(setup.graphql.transactions).toHaveBeenCalledTimes(TX_MAX_PAGES)
      expect(setup.graphql.transactions.mock.calls.map(([args]) => args)).toEqual([
        { first: 20, after: undefined },
        { first: 20, after: "cursor-1" },
        { first: 20, after: "cursor-2" },
        { first: 20, after: "cursor-3" },
        { first: 20, after: "cursor-4" },
      ])
      expect(payload.transactions).toEqual([])
      // "Searched your last 100 payments": the miss is never silent.
      expect(payload.window).toEqual({
        searchedCount: 100,
        oldestTimestamp: 10_000 - 99,
        rails: ["graphql", "btc"],
        replyKey: "Assistant.searchedWindow",
      })
    })

    it("stops paging once it has as many matches as were asked for", async () => {
      const pages = pagesOf(10)
      pages[1][3] = graphqlTx({
        id: "rent",
        createdAt: pages[1][3].createdAt,
        memo: "Rent",
      })
      const setup = serve(pages)

      const payload = await answer(setup, { query: "rent", first: 1 })

      expect(setup.graphql.transactions).toHaveBeenCalledTimes(2)
      expect(payload.transactions.map((row) => row.id)).toEqual(["rent"])
      expect(payload.window.searchedCount).toBe(40)
    })

    it("reads one page when it already holds enough, and the default is 10", async () => {
      const setup = serve(pagesOf(10))

      const payload = await answer(setup)

      expect(setup.graphql.transactions).toHaveBeenCalledTimes(1)
      expect(payload.transactions).toHaveLength(10)
      expect(payload.transactions[0].id).toBe("p0-10000")
    })

    it("answers with the first page and its window when lnflash/flash refuses the next page", async () => {
      // An account whose list runs past one page (spec §5.1): flash serves
      // page one with hasNextPage and refuses the cursor for page two. A
      // filtered ask ("what did I receive") wants more matches than page
      // one holds, so it asks for page two, and must still answer.
      const setup = fakeCtx()
      const [first, second] = pagesOf(2)
      const received = graphqlTx({
        id: "in-1",
        createdAt: first[5].createdAt,
        direction: "RECEIVE",
      })
      first[5] = received
      setup.graphql.transactions.mockImplementation(flashTransactions([first, second]))
      enableBtc(setup, [])

      const payload = await answer(setup, { direction: "RECEIVE" })

      // Page two was asked for, refused, and the search ended there.
      expect(setup.graphql.transactions).toHaveBeenCalledTimes(2)
      await expect(setup.graphql.transactions.mock.results[1].value).rejects.toThrow(
        FLASH_CURSOR_REFUSED,
      )
      expect(payload.transactions.map(({ id }) => id)).toEqual(["in-1"])
      // The window says how far it reached: page one, and not past it.
      expect(payload.window).toEqual({
        searchedCount: TX_PAGE_SIZE,
        oldestTimestamp: first[first.length - 1].createdAt,
        rails: ["graphql", "btc"],
        replyKey: "Assistant.searchedWindow",
      })
      // The BTC side lists no further back than page one reached.
      expect(setup.btcRail.listPayments).toHaveBeenCalledWith(0, BTC_PAYMENTS_LIMIT, {
        fromTimestamp: first[first.length - 1].createdAt,
        assets: "bitcoin",
      })
    })

    it("still fails when the first page cannot be read", async () => {
      const setup = fakeCtx()
      const failure = new Error("Network request failed")
      setup.graphql.transactions.mockRejectedValue(failure)

      await expect(getTransactions.run({}, setup.ctx)).rejects.toBe(failure)
    })

    it("refuses to answer zero rows", async () => {
      const setup = serve(pagesOf(1))

      await expect(getTransactions.run({ first: 0 }, setup.ctx)).resolves.toEqual({
        kind: "error",
        userMessage: "Assistant.invalidArguments",
      })
      expect(getTransactions.validate({ first: 21 }).valid).toBe(false)
    })
  })

  describe("two rails, one window", () => {
    it("merges both rails newest first and tags each row with its rail", async () => {
      const setup = serve([
        [
          graphqlTx({ id: "g100", createdAt: 100 }),
          graphqlTx({ id: "g80", createdAt: 80 }),
          graphqlTx({ id: "g60", createdAt: 60 }),
        ],
      ])
      enableBtc(setup, [
        btcPayment({ id: "b90", timestamp: 90 }),
        btcPayment({ id: "b70", timestamp: 70 }),
      ])

      const payload = await answer(setup)

      expect(payload.transactions.map(({ id, rail }) => [id, rail])).toEqual([
        ["g100", "graphql"],
        ["b90", "btc"],
        ["g80", "graphql"],
        ["b70", "btc"],
        ["g60", "graphql"],
      ])
      // GraphQL ran out of pages, so its whole history was read and the BTC
      // list is not bounded.
      expect(setup.btcRail.listPayments).toHaveBeenCalledWith(0, BTC_PAYMENTS_LIMIT, {
        fromTimestamp: undefined,
        assets: "bitcoin",
      })
      expect(payload.window).toMatchObject({ searchedCount: 5, oldestTimestamp: 60 })
    })

    it("bounds the BTC list by the oldest GraphQL row read, so both cover the same time", async () => {
      const setup = serve(pagesOf(10))
      enableBtc(setup, [btcPayment({ id: "b", timestamp: 9_990 })])

      await answer(setup, { query: "nothing matches this" })

      expect(setup.btcRail.listPayments).toHaveBeenCalledWith(0, BTC_PAYMENTS_LIMIT, {
        fromTimestamp: 10_000 - 99,
        assets: "bitcoin",
      })
    })

    it("starts the window at the oldest BTC payment listed when the BTC list was cut off", async () => {
      const setup = serve([
        [
          graphqlTx({ id: "g1000", createdAt: 1000 }),
          graphqlTx({ id: "g500", createdAt: 500 }),
          graphqlTx({ id: "g10", createdAt: 10 }),
        ],
      ])
      // A full list: older BTC payments may exist that it did not return.
      enableBtc(
        setup,
        Array.from({ length: BTC_PAYMENTS_LIMIT }, (_, i) =>
          btcPayment({ id: `b${900 - i}`, timestamp: 900 - i }),
        ),
      )

      const payload = await answer(setup, { first: 20 })

      // The GraphQL rows older than the BTC list's oldest were read on one
      // rail only, so they are not stated as searched.
      expect(payload.window).toMatchObject({ searchedCount: 101, oldestTimestamp: 801 })
      expect(payload.transactions.map((row) => row.id)).not.toContain("g500")
      expect(payload.transactions.map((row) => row.id)).not.toContain("g10")
    })

    it("answers from GraphQL alone, and says so, while the BTC wallet is off", async () => {
      const setup = serve([[graphqlTx({ id: "g1", createdAt: 1 })]])
      setup.btcRail.listPayments.mockRejectedValue(new BreezSdkNotInitializedError())

      const payload = await answer(setup)

      expect(payload.transactions.map((row) => row.id)).toEqual(["g1"])
      expect(payload.btc).toEqual({
        state: "disabled",
        replyKey: "Assistant.btcDisabled",
      })
      expect(payload.window.rails).toEqual(["graphql"])
    })

    it("says the BTC wallet is syncing while it starts", async () => {
      const setup = serve([[graphqlTx({ id: "g1", createdAt: 1 })]])
      setup.btcRail.listPayments.mockRejectedValue(
        new BreezSdkNotInitializedError({ reason: "starting" }),
      )

      const payload = await answer(setup)

      expect(payload.btc).toEqual({ state: "syncing", replyKey: "Assistant.btcSyncing" })
    })

    it("says the BTC wallet failed to start, not that it is off, when its start gave up", async () => {
      const setup = serve([[graphqlTx({ id: "g1", createdAt: 1 })]])
      setup.btcRail.listPayments.mockRejectedValue(
        new BreezSdkNotInitializedError({ reason: "failed" }),
      )

      const payload = await answer(setup)

      expect(payload.btc).toEqual({ state: "failed", replyKey: "Assistant.btcFailed" })
      expect(payload.window.rails).toEqual(["graphql"])
    })

    it("lets any other BTC failure reject, for runTool to report", async () => {
      const setup = serve([[graphqlTx({ id: "g1", createdAt: 1 })]])
      const failure = new Error("storage locked")
      setup.btcRail.listPayments.mockRejectedValue(failure)

      await expect(getTransactions.run({}, setup.ctx)).rejects.toBe(failure)
    })
  })

  describe("rows", () => {
    it("converts amounts to unsigned minor units with the rail's own currency", async () => {
      const setup = serve([
        [
          graphqlTx({
            id: "g",
            createdAt: 2,
            settlementAmount: -1250,
            settlementFee: -3,
            settlementCurrency: "USDT",
          }),
        ],
      ])
      enableBtc(setup, [btcPayment({ id: "b", timestamp: 1, sats: 2100, fees: 4 })])

      const payload = await answer(setup)

      expect(payload.transactions[0]).toMatchObject({
        amount: toWalletAmount({ amount: 1250, currency: "USDT" }),
        fee: toWalletAmount({ amount: 3, currency: "USDT" }),
      })
      expect(payload.transactions[1]).toMatchObject({
        amount: toBtcMoneyAmount(2100),
        fee: toBtcMoneyAmount(4),
        direction: "SEND",
        status: "SUCCESS",
        timestamp: 1,
      })
    })

    it("lists Bitcoin payments only, and never reports a Spark token payment as sats", async () => {
      // A 5 USDT receive on Spark is 5,000,000 token base units. The rail is
      // asked for Bitcoin payments; one that comes back anyway is left out.
      const setup = serve([[]])
      enableBtc(setup, [
        btcPayment({ id: "usdt-in", timestamp: 3, paymentType: 1, method: 2, sats: 5e6 }),
        btcPayment({ id: "sats-in", timestamp: 2, paymentType: 1, sats: 2100 }),
      ])

      const payload = await answer(setup)

      expect(setup.btcRail.listPayments).toHaveBeenCalledWith(0, BTC_PAYMENTS_LIMIT, {
        fromTimestamp: undefined,
        assets: "bitcoin",
      })
      expect(payload.transactions.map(({ id, amount }) => [id, amount])).toEqual([
        ["sats-in", toBtcMoneyAmount(2100)],
      ])
      expect(JSON.stringify(payload)).not.toMatch(/5000000|usdt-in/)
    })

    it("still bounds the window by the oldest payment listed when a token payment is left out", async () => {
      const setup = serve([[graphqlTx({ id: "g10", createdAt: 10 })]])
      // A full list whose oldest entry is a token payment.
      enableBtc(setup, [
        ...Array.from({ length: BTC_PAYMENTS_LIMIT - 1 }, (_, i) =>
          btcPayment({ id: `b${900 - i}`, timestamp: 900 - i }),
        ),
        btcPayment({ id: "usdt", timestamp: 500, method: 2 }),
      ])

      const payload = await answer(setup, { first: 20 })

      // Older BTC payments may exist that the full list left out, so the
      // window starts at the oldest one it listed and g10 is not searched.
      expect(payload.window).toMatchObject({ oldestTimestamp: 500 })
      expect(payload.transactions.map((row) => row.id)).not.toContain("g10")
      expect(payload.transactions.map((row) => row.id)).not.toContain("usdt")
    })

    it("reads a BTC payment's direction and status from the SDK's enums", async () => {
      const setup = serve([[]])
      enableBtc(setup, [
        btcPayment({ id: "received", timestamp: 3, paymentType: 1, status: 1 }),
        btcPayment({ id: "failed", timestamp: 2, paymentType: 0, status: 2 }),
      ])

      const payload = await answer(setup)

      expect(
        payload.transactions.map(({ id, direction, status }) => [id, direction, status]),
      ).toEqual([
        ["received", "RECEIVE", "PENDING"],
        ["failed", "SEND", "FAILURE"],
      ])
    })

    it("keeps only sends or only receives when asked", async () => {
      const setup = serve([
        [
          graphqlTx({ id: "sent", createdAt: 3 }),
          graphqlTx({ id: "received", createdAt: 2, direction: "RECEIVE" }),
        ],
      ])
      enableBtc(setup, [btcPayment({ id: "btc-in", timestamp: 1, paymentType: 1 })])

      const payload = await answer(setup, { direction: "RECEIVE" })

      expect(payload.transactions.map((row) => row.id)).toEqual(["received", "btc-in"])
    })

    it("matches a query against memo and payee on both rails, ignoring case", async () => {
      const setup = serve([
        [
          // A Lightning payment: it names no counterparty.
          graphqlTx({
            id: "rent",
            createdAt: 5,
            memo: "Rent for May",
            initiationVia: { __typename: "InitiationViaLn", paymentHash: "h-rent" },
            settlementVia: { __typename: "SettlementViaLn", paymentSecret: null },
          }),
          graphqlTx({ id: "to-bob", createdAt: 4 }),
        ],
      ])
      enableBtc(setup, [
        btcPayment({ id: "coffee", timestamp: 3, description: "Coffee" }),
        btcPayment({ id: "shop", timestamp: 2, lnAddress: "Shop@pay.example" }),
      ])
      const ids = async (query: string) =>
        (await answer(setup, { query })).transactions.map((row) => row.id)

      expect(await ids("RENT")).toEqual(["rent"])
      expect(await ids("bob")).toEqual(["to-bob"])
      expect(await ids("coffee")).toEqual(["coffee"])
      expect(await ids("shop@")).toEqual(["shop"])
    })
  })

  describe("a query that names someone", () => {
    /** A history with one send to each user, newest first, with its memo if it has one. */
    const history = (sends: (string | { username: string; memo: string })[]) =>
      serve([
        sends.map((send, i) => {
          const user = typeof send === "string" ? { username: send } : send
          return sentTo({ id: `to-${user.username}`, createdAt: 100 - i, ...user })
        }),
      ])

    const ids = async (
      setup: ReturnType<typeof fakeCtx>,
      args: Record<string, unknown>,
    ) => (await answer(setup, args)).transactions.map((row) => row.id)

    it("finds a username that holds none of the hyphen, apostrophe or space the name is typed with", async () => {
      // A Flash username has only letters, digits and "_".
      const setup = history(["kerryann_b", "dandre_w", "unclejoe", "bob"])

      expect(await ids(setup, { direction: "SEND", query: "kerry-ann" })).toEqual([
        "to-kerryann_b",
      ])
      expect(await ids(setup, { direction: "SEND", query: "d'andre" })).toEqual([
        "to-dandre_w",
      ])
      expect(await ids(setup, { direction: "SEND", query: "D’Andre" })).toEqual([
        "to-dandre_w",
      ])
      expect(await ids(setup, { direction: "SEND", query: "uncle joe" })).toEqual([
        "to-unclejoe",
      ])
    })

    it("finds them as the grammar asks for them, in English and in patois", async () => {
      const setup = history(["kerryann_b", "dandre_w", "unclejoe", "bob"])
      const JMD = { displayCurrency: "JMD", displaySymbol: "J$" }
      const asked = async (utterance: string) => {
        const match = matchGrammar(utterance, JMD)
        if (match?.kind !== "call") throw new Error(`no call for ${utterance}`)
        expect(match.call.intent).toBe("getTransactions")
        return ids(setup, match.call.args ?? {})
      }

      expect(await asked("payments fi Kerry-Ann")).toEqual(["to-kerryann_b"])
      expect(await asked("payments to D'Andre")).toEqual(["to-dandre_w"])
      expect(await asked("show my payments to Uncle Joe")).toEqual(["to-unclejoe"])
    })

    it("finds the payments to the contact the query names by alias, whatever their username", async () => {
      // Two-word aliases, and an alias that shares nothing with the username.
      const setup = history(["carol", "gloria_b", "tj_brown", "bob"])
      setup.graphql.contacts.mockResolvedValue([
        contact("carol", "Mom"),
        contact("gloria_b", "Grandma"),
        contact("tj_brown", "Uncle Tony"),
      ])

      expect(await ids(setup, { direction: "SEND", query: "mom" })).toEqual(["to-carol"])
      expect(await ids(setup, { direction: "SEND", query: "grandma" })).toEqual([
        "to-gloria_b",
      ])
      expect(await ids(setup, { direction: "SEND", query: "uncle tony" })).toEqual([
        "to-tj_brown",
      ])
      expect(await ids(setup, { direction: "SEND", query: "Tony" })).toEqual([
        "to-tj_brown",
      ])
    })

    it("never takes a contact whose name only looks like the query for the one it names", async () => {
      // As resolveContact reads a name: "gas" is not Vargas, "andrea" not Andre.
      const setup = history(["vargas_j", "andre_k", "bob"])
      setup.graphql.contacts.mockResolvedValue([
        contact("vargas_j", "Vargas"),
        contact("andre_k", "Andre"),
      ])

      expect(await ids(setup, { direction: "SEND", query: "andrea" })).toEqual([])
      // "gas" is in the username itself, which a search reads as typed.
      expect(await ids(setup, { query: "gas" })).toEqual(["to-vargas_j"])
    })

    it("keeps a memo's words apart: a name is not found across two of them", async () => {
      const setup = history([
        { username: "omar_x", memo: "from omar" },
        { username: "kerryann_b", memo: "lunch for Kerry-Ann" },
      ])

      expect(await ids(setup, { query: "mom" })).toEqual([])
      expect(await ids(setup, { query: "lunch for kerry-ann" })).toEqual([
        "to-kerryann_b",
      ])
    })

    it("still searches memo and payee when the contacts cannot be read", async () => {
      // Offline, the cache may hold no contact list.
      const setup = history(["carol", "bob"])
      setup.graphql.contacts.mockRejectedValue(new Error("No answer in the cache"))

      expect(await ids(setup, { query: "bob" })).toEqual(["to-bob"])
      expect(await ids(setup, { query: "mom" })).toEqual([])
    })

    it("reads the contacts only for a query", async () => {
      const setup = history(["bob"])

      await answer(setup, {})
      await answer(setup, { query: "  " })
      expect(setup.graphql.contacts).not.toHaveBeenCalled()
    })
  })

  describe("projection", () => {
    const sample = async () => {
      const setup = serve([[graphqlTx({ id: "g", createdAt: 2, memo: "Rent" })]])
      enableBtc(setup, [btcPayment({ id: "b", timestamp: 1, description: "Coffee" })])
      return answer(setup)
    }

    it("drops memos, payees and payment hashes when the call did not search", async () => {
      const projected = getTransactions.project(await sample(), {}) as TransactionsPayload

      projected.transactions.forEach((row) => {
        expect(row).not.toHaveProperty("memo")
        expect(row).not.toHaveProperty("counterparty")
        expect(row).not.toHaveProperty("paymentHash")
      })
      expect(JSON.stringify(projected)).not.toMatch(/Rent|Coffee|bob|hash-/)
    })

    it("keeps memo and payee, never the hash, when the call searched them", async () => {
      const projected = getTransactions.project(await sample(), {
        query: "rent",
      }) as TransactionsPayload

      expect(projected.transactions[0]).toMatchObject({
        memo: "Rent",
        counterparty: "bob",
      })
      expect(JSON.stringify(projected)).not.toMatch(/hash-/)
    })

    it("treats a blank query as no search", async () => {
      const projected = getTransactions.project(await sample(), {
        query: "   ",
      }) as TransactionsPayload

      expect(projected.transactions[0]).not.toHaveProperty("memo")
    })

    it("keeps the window and the BTC state", async () => {
      const payload = await sample()

      expect(getTransactions.project(payload, {})).toMatchObject({
        window: payload.window,
        btc: payload.btc,
      })
    })
  })
})
