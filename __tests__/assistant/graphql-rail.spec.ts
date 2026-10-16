import * as fs from "fs"
import * as path from "path"
import type { ApolloClient } from "@apollo/client"

import {
  AccountDefaultWalletDocument,
  AccountLimitsDocument,
  BusinessMapMarkersDocument,
  ContactsDocument,
  RealtimePriceUnauthedDocument,
  TransactionDetailsDocument,
  TransactionListForDefaultAccountDocument,
  WalletOverviewScreenDocument,
} from "@app/graphql/generated"
import { createGraphqlRail, GraphqlRailError } from "@app/assistant/rails/graphql-rail"

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

  it("has the eight reads and no way to send", () => {
    const { mutate, client } = fakeClient()

    const rail = createGraphqlRail(client)

    expect(Object.keys(rail).sort()).toEqual(
      [
        "accountDefaultWallet",
        "accountLimits",
        "businessMapMarkers",
        "contacts",
        "realtimePrice",
        "transactionDetails",
        "transactions",
        "wallets",
      ].sort(),
    )
    expect(mutate).not.toHaveBeenCalled()
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
      const { query, client } = fakeClient()
      query.mockResolvedValue({
        data: undefined,
        errors: [{ message: "Account not found" }],
      })

      await expect(
        createGraphqlRail(client).accountDefaultWallet("nobody"),
      ).resolves.toBeNull()
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
