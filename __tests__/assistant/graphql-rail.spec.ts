import * as fs from "fs"
import * as path from "path"
import type { ApolloClient } from "@apollo/client"

import {
  AccountDefaultWalletDocument,
  AccountLimitsDocument,
  BusinessMapMarkersDocument,
  ContactsDocument,
  RealtimePriceUnauthedDocument,
  SearchUsernamesDocument,
  TransactionDetailsDocument,
  TransactionListForDefaultAccountDocument,
  WalletOverviewScreenDocument,
} from "@app/graphql/generated"
import {
  ACCOUNT_NOT_FOUND_SENTENCE,
  createGraphqlRail,
  GraphqlRail,
  GraphqlRailError,
} from "@app/assistant/rails/graphql-rail"

const fakeClient = () => {
  const query = jest.fn()
  const mutate = jest.fn()
  return { query, mutate, client: { query, mutate } as unknown as ApolloClient<unknown> }
}

const wallets = [
  {
    __typename: "UsdWallet",
    id: "usd-1",
    balance: 1234.5,
    walletCurrency: "USD",
    isExternal: false,
  },
]

describe("createGraphqlRail", () => {
  it("reads every query from the network, never the cache", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: { me: { defaultAccount: { wallets } } } })

    await createGraphqlRail(client).wallets()

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: WalletOverviewScreenDocument,
        fetchPolicy: "network-only",
      }),
    )
  })

  it("has the nine reads and no way to send", () => {
    const { mutate, client } = fakeClient()

    const rail = createGraphqlRail(client)

    expect(Object.keys(rail).sort()).toEqual(
      [
        "accountDefaultWallet",
        "accountLimits",
        "businessMapMarkers",
        "contacts",
        "realtimePrice",
        "searchUsernames",
        "transactionDetails",
        "transactions",
        "wallets",
      ].sort(),
    )
    expect(mutate).not.toHaveBeenCalled()
  })

  it("searches the public directory online and never starts a search offline", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: { searchUsernames: ["dreadmax"] } })
    await expect(createGraphqlRail(client).searchUsernames("dread ma")).resolves.toEqual([
      "dreadmax",
    ])
    expect(query).toHaveBeenCalledWith({
      query: SearchUsernamesDocument,
      variables: { query: "dreadma" },
      fetchPolicy: "network-only",
      errorPolicy: "none",
    })
    query.mockClear()
    await expect(
      createGraphqlRail(client, { fetchPolicy: "cache-only" }).searchUsernames("dreadma"),
    ).rejects.toThrow("Search needs internet")
    expect(query).not.toHaveBeenCalled()
  })

  it("answers the wallets with their balances", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: { me: { defaultAccount: { wallets } } } })

    await expect(createGraphqlRail(client).wallets()).resolves.toEqual(wallets)
  })

  it("refuses to answer for a signed-out session", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: { me: null } })

    await expect(createGraphqlRail(client).wallets()).rejects.toBeInstanceOf(
      GraphqlRailError,
    )
  })

  it("passes a query's failure through, for runTool to report", async () => {
    const { query, client } = fakeClient()
    const failure = new Error("Network request failed")
    query.mockRejectedValue(failure)

    await expect(createGraphqlRail(client).accountLimits()).rejects.toBe(failure)
  })

  describe("transactions", () => {
    it("pages with first and after and hands back the nodes", async () => {
      const { query, client } = fakeClient()
      query.mockResolvedValue({
        data: {
          me: {
            defaultAccount: {
              transactions: {
                pageInfo: { hasNextPage: true, endCursor: "cursor-2" },
                edges: [{ cursor: "cursor-2", node: { id: "tx-1" } }],
              },
            },
          },
        },
      })

      const page = await createGraphqlRail(client).transactions({
        first: 20,
        after: "cursor-1",
      })

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: TransactionListForDefaultAccountDocument,
          variables: { first: 20, after: "cursor-1" },
        }),
      )
      expect(page).toEqual({
        rows: [{ id: "tx-1" }],
        hasNextPage: true,
        endCursor: "cursor-2",
      })
    })

    it("reads an account with no transactions as an empty last page", async () => {
      const { query, client } = fakeClient()
      query.mockResolvedValue({
        data: { me: { defaultAccount: { transactions: null } } },
      })

      await expect(
        createGraphqlRail(client).transactions({ first: 20 }),
      ).resolves.toEqual({
        rows: [],
        hasNextPage: false,
        endCursor: null,
      })
    })
  })

  describe("transactionDetails", () => {
    const answer = (payload: unknown) => ({ data: { transactionDetails: payload } })

    it("asks by transaction id and returns the details", async () => {
      const { query, client } = fakeClient()
      const details = { id: "tx-1", status: "SUCCESS" }
      query.mockResolvedValue(answer({ errors: [], transactionDetails: details }))

      await expect(createGraphqlRail(client).transactionDetails("tx-1")).resolves.toBe(
        details,
      )
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: TransactionDetailsDocument,
          variables: { input: { transactionId: "tx-1" } },
        }),
      )
    })

    it("answers null when the server has no details for the id", async () => {
      const { query, client } = fakeClient()
      query.mockResolvedValueOnce(
        answer({
          errors: [{ message: "Transaction not found" }],
          transactionDetails: null,
        }),
      )
      query.mockResolvedValueOnce(answer({ errors: [], transactionDetails: null }))
      const rail = createGraphqlRail(client)

      await expect(rail.transactionDetails("tx-x")).resolves.toBeNull()
      await expect(rail.transactionDetails("tx-y")).resolves.toBeNull()
    })
  })

  describe("accountDefaultWallet", () => {
    it("asks by username and keeps GraphQL errors as data, like the send screens' lazy query", async () => {
      const { query, client } = fakeClient()
      const wallet = { id: "w-1", walletCurrency: "USD" }
      query.mockResolvedValue({ data: { accountDefaultWallet: wallet } })

      await expect(createGraphqlRail(client).accountDefaultWallet("alice")).resolves.toBe(
        wallet,
      )
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: AccountDefaultWalletDocument,
          variables: { username: "alice" },
          errorPolicy: "all",
          fetchPolicy: "network-only",
        }),
      )
    })

    it("answers null for a username with no account", async () => {
      // What lnflash/flash answers a missing username with, through the
      // gateway in front of it, as the Test API answered it: the sentence
      // error-map.ts:165-167 builds, and no code (ENG-730 review).
      const { query, client } = fakeClient()
      query.mockResolvedValue({
        data: null,
        errors: [
          {
            message: `${ACCOUNT_NOT_FOUND_SENTENCE} nobody`,
            path: ["accountDefaultWallet"],
            extensions: { service: "public" },
          },
        ],
      })

      await expect(
        createGraphqlRail(client).accountDefaultWallet("nobody"),
      ).resolves.toBeNull()
      expect(ACCOUNT_NOT_FOUND_SENTENCE).toBe("Account does not exist for username")
    })

    it("answers null for a NOT_FOUND code, wherever a server puts it", async () => {
      // lnflash/flash gives this query NOT_FOUND for a missing account alone.
      // Its formatError writes the code at the top level; a GraphQL server's
      // default is extensions.code.
      const { query, client } = fakeClient()
      query
        .mockResolvedValueOnce({
          data: null,
          errors: [{ message: "x", code: "NOT_FOUND" }],
        })
        .mockResolvedValueOnce({
          data: null,
          errors: [{ message: "x", extensions: { code: "NOT_FOUND" } }],
        })
      const rail = createGraphqlRail(client)

      await expect(rail.accountDefaultWallet("nobody")).resolves.toBeNull()
      await expect(rail.accountDefaultWallet("nobody")).resolves.toBeNull()
    })

    it("rejects a lookup the server failed for an account that may exist, never calling it no account", async () => {
      // Each comes on an HTTP 200 with data null, as the missing account's
      // answer does (ENG-730 review): the database down (DB_ERROR,
      // error-map.ts:527-531), a cash wallet it could not present
      // (CashWalletMissingUsdtWalletError when the ENG-544 self-heal fails,
      // INVALID_INPUT), a word its Username scalar refuses, and errors with
      // neither the code nor the sentence. Read as no account, each would
      // refuse a payment to a real user.
      const failures: [string, Record<string, unknown>[]][] = [
        [
          "DB_ERROR as the gateway forwards it",
          [
            {
              message:
                "Service offline, please try again in a few minutes. If the problem persists, please contact support.",
              extensions: { service: "public" },
            },
          ],
        ],
        [
          "DB_ERROR with its code",
          [
            {
              message: "Unknown error occurred (code: UnknownRepositoryError)",
              code: "DB_ERROR",
            },
          ],
        ],
        ["DB_ERROR with its code in extensions", [{ extensions: { code: "DB_ERROR" } }]],
        [
          "a cash wallet it could not present",
          [
            {
              message: "USDT Cash Wallet is missing for this account.",
              code: "INVALID_INPUT",
            },
          ],
        ],
        [
          "a word the Username scalar refuses",
          [{ message: "Invalid value for Username" }],
        ],
        ["an error with nothing in it", [{}]],
        [
          "no account beside a failure",
          [
            { message: `${ACCOUNT_NOT_FOUND_SENTENCE} alice` },
            { message: "Service offline", code: "DB_ERROR" },
          ],
        ],
      ]

      for (const [label, errors] of failures) {
        const { query, client } = fakeClient()
        query.mockResolvedValue({ data: null, errors })

        const outcome = await createGraphqlRail(client)
          .accountDefaultWallet("alice")
          .then(
            (answer) => ({ answer }),
            (err: unknown) => err,
          )

        expect([label, outcome]).toEqual([label, expect.any(GraphqlRailError)])
      }
    })
  })

  it("reads the price in the currency asked for", async () => {
    const { query, client } = fakeClient()
    const price = { timestamp: 1, denominatorCurrency: "JMD" }
    query.mockResolvedValue({ data: { realtimePrice: price } })

    await expect(createGraphqlRail(client).realtimePrice("JMD")).resolves.toBe(price)
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: RealtimePriceUnauthedDocument,
        variables: { currency: "JMD" },
      }),
    )
  })

  it("reads contacts, markers and limits from their documents", async () => {
    const { query, client } = fakeClient()
    const contacts = [
      { id: "bob", username: "bob", alias: "Bobby", transactionsCount: 3 },
    ]
    const markers = [{ username: "shop", mapInfo: { title: "Shop" } }]
    const limits = { withdrawal: [], internalSend: [], convert: [] }
    query.mockImplementation(async ({ query: document }) => {
      if (document === ContactsDocument) return { data: { me: { contacts } } }
      if (document === BusinessMapMarkersDocument) {
        return { data: { businessMapMarkers: markers } }
      }
      if (document === AccountLimitsDocument) {
        return { data: { me: { defaultAccount: { limits } } } }
      }
      throw new Error("unexpected document")
    })
    const rail = createGraphqlRail(client)

    await expect(rail.contacts()).resolves.toBe(contacts)
    await expect(rail.businessMapMarkers()).resolves.toBe(markers)
    await expect(rail.accountLimits()).resolves.toBe(limits)
  })
})

describe("createGraphqlRail's fetch policy (ENG-689)", () => {
  // The thread reads balances and history from the cache while it is
  // offline, through a cache-only copy of the rail, and labels the answer
  // stale (spec §7.2). Everything else reads the network.

  /** An answer every one of the eight reads can take. */
  const ANY_ANSWER = {
    data: {
      me: {
        defaultAccount: { wallets, transactions: null, limits: {} },
        contacts: [],
      },
      transactionDetails: { errors: [], transactionDetails: null },
      accountDefaultWallet: null,
      realtimePrice: {},
      businessMapMarkers: [],
    },
  }

  /** Each of the rail's eight reads, called once. */
  const readAll = (rail: GraphqlRail) =>
    Promise.all([
      rail.wallets(),
      rail.transactions({ first: 20 }),
      rail.transactionDetails("tx-1"),
      rail.contacts(),
      rail.accountDefaultWallet("alice"),
      rail.realtimePrice("JMD"),
      rail.businessMapMarkers(),
      rail.accountLimits(),
    ])

  const policiesAsked = (query: jest.Mock): unknown[] =>
    query.mock.calls.map(([options]) => options.fetchPolicy)

  it("asks the network for every read unless told otherwise", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue(ANY_ANSWER)

    await readAll(createGraphqlRail(client))

    expect(policiesAsked(query)).toEqual(Array(8).fill("network-only"))
  })

  it("asks the network when told to", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue(ANY_ANSWER)

    await readAll(createGraphqlRail(client, { fetchPolicy: "network-only" }))

    expect(policiesAsked(query)).toEqual(Array(8).fill("network-only"))
  })

  it("asks only the cache for every read of a cache-only rail", async () => {
    const { query, mutate, client } = fakeClient()
    query.mockResolvedValue(ANY_ANSWER)

    await readAll(createGraphqlRail(client, { fetchPolicy: "cache-only" }))

    // Eight reads, the transaction list's three times over: offline it
    // looks for the list in each place the app's screens put one
    // (CACHED_TRANSACTION_PAGES, graphql-rail-cache.spec.tsx).
    expect(policiesAsked(query)).toEqual(Array(10).fill("cache-only"))
    expect(
      query.mock.calls
        .filter(([options]) => options.query === TransactionListForDefaultAccountDocument)
        .map(([options]) => options.variables),
    ).toEqual([{}, { first: 3 }, { first: 20 }])
    expect(mutate).not.toHaveBeenCalled()
  })

  it("reads a later page from the cache where the history screen's fetchMore put it", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: {}, partial: true })

    await expect(
      createGraphqlRail(client, { fetchPolicy: "cache-only" }).transactions({
        first: 20,
        after: "cursor-1",
      }),
    ).rejects.toThrow(new GraphqlRailError("No answer in the cache"))
    expect(query.mock.calls.map(([options]) => options.variables)).toEqual([
      { after: "cursor-1" },
      { first: 20, after: "cursor-1" },
    ])
  })

  it("answers from the cache what the cache holds", async () => {
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: { me: { defaultAccount: { wallets } } } })

    await expect(
      createGraphqlRail(client, { fetchPolicy: "cache-only" }).wallets(),
    ).resolves.toEqual(wallets)
  })

  it("fails a read the cache does not hold, never answering it empty or signed out", async () => {
    // Apollo answers a cache-only query it cannot fill as partial, with
    // empty data, rather than failing it.
    const { query, client } = fakeClient()
    query.mockResolvedValue({ data: {}, partial: true, loading: false, networkStatus: 7 })
    const rail = createGraphqlRail(client, { fetchPolicy: "cache-only" })

    await expect(rail.wallets()).rejects.toThrow(
      new GraphqlRailError("No answer in the cache"),
    )
    await expect(rail.transactions({ first: 20 })).rejects.toThrow(
      new GraphqlRailError("No answer in the cache"),
    )
    // Not "no wallet for that username", which is what null would say.
    await expect(rail.accountDefaultWallet("alice")).rejects.toThrow(
      new GraphqlRailError("No answer in the cache"),
    )
  })
})

describe("app/assistant", () => {
  it("reads the deprecated User.contacts in exactly one place", () => {
    // `User.contacts` is marked "will be moved to account". Wrapping the read
    // in the rail keeps that move a one-line change (spec §4).
    const dir = path.join(__dirname, "../../app/assistant")
    const readers = fs
      .readdirSync(dir, { encoding: "utf8", recursive: true })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        /\bContactsDocument\b/.test(fs.readFileSync(path.join(dir, file), "utf8")),
      )

    expect(readers).toEqual([path.join("rails", "graphql-rail.ts")])
  })
})
