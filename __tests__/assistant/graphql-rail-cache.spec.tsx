import * as React from "react"
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from "@apollo/client"
import { MockedProvider } from "@apollo/client/testing"
import { render, waitFor } from "@testing-library/react-native"
import { ThemeProvider } from "@rneui/themed"
import type { FieldNode, OperationDefinitionNode, SelectionNode } from "graphql"

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ navigate: jest.fn() }),
}))
jest.mock("@app/i18n/i18n-react", () => {
  const { i18nObject: i18n } = jest.requireActual("@app/i18n/i18n-util")
  return { useI18nContext: () => ({ LL: i18n("en"), locale: "en" }) }
})
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context")
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

import {
  CACHED_TRANSACTION_PAGES,
  createGraphqlRail,
  GraphqlRailError,
  TransactionRow,
} from "@app/assistant/rails/graphql-rail"
import { getTransactions } from "@app/assistant/registry/read/get-transactions"
import type { TransactionsPayload } from "@app/assistant/registry/projections"
import { createCache } from "@app/graphql/cache"
import {
  HomeAuthedDocument,
  TransactionListForDefaultAccountDocument,
} from "@app/graphql/generated"
import { IsAuthedContextProvider } from "@app/graphql/is-authed-context"
import appMocks from "@app/graphql/mocks"
import { loadLocale } from "@app/i18n/i18n-util.sync"
import theme from "@app/rne-theme/theme"
import { USDTransactionHistory } from "@app/screens/transaction-history/USDTransactionHistory"
import { fakeBtcRail, graphqlTx, NOW_MS } from "./fakes"

loadLocale("en")

// The thread's offline rail over the app's real Apollo cache (ENG-689,
// spec §7.2), filled the way the app's screens fill it. Every other spec
// fakes the cache-only rail, so none of them could see that the cache keeps
// the account's `transactions` apart by their arguments (app/graphql/
// cache.ts has no keyArgs policy for it): a list read with `first: 20`, the
// rail's own page, finds nothing the history screen or home put there.

jest.setTimeout(30000)

// The signed-in user and account of the app's own mocks (app/graphql/
// mocks.ts), whose answers the history screen's rows read too: one user,
// as in the app, so no answer moves `me` to another account.
const ME_ID = "70df9822-efe0-419c-b864-c9efa99872ea"
const ACCOUNT_ID = "84b26b88-89b0-5c6f-9d3d-fbead08f79d8"

const edge = (node: TransactionRow) => ({
  __typename: "TransactionEdge",
  cursor: node.id,
  node,
})

/** The transaction list as the API answers it, newest first. */
const list = (rows: readonly TransactionRow[], hasNextPage: boolean) => ({
  __typename: "TransactionConnection",
  pageInfo: {
    __typename: "PageInfo",
    hasNextPage,
    hasPreviousPage: false,
    startCursor: rows[0]?.id ?? null,
    endCursor: rows[rows.length - 1]?.id ?? null,
  },
  edges: rows.map(edge),
})

/** `transactionListForDefaultAccount`'s answer, as the history screen gets it. */
const historyAnswer = (rows: readonly TransactionRow[], hasNextPage = false) => ({
  me: {
    __typename: "User",
    id: ME_ID,
    defaultAccount: {
      __typename: "ConsumerAccount",
      id: ACCOUNT_ID,
      transactions: list(rows, hasNextPage),
    },
  },
})

/** `homeAuthed`'s answer: the home screen's three newest rows, and the rest of the home query. */
const homeAnswer = (rows: readonly TransactionRow[]) => ({
  me: {
    __typename: "User",
    id: ME_ID,
    language: "",
    username: "tanya",
    phone: "+18765550100",
    createdAt: 1_700_000_000,
    email: null,
    npub: null,
    defaultAccount: {
      __typename: "ConsumerAccount",
      id: ACCOUNT_ID,
      level: "ONE",
      defaultWalletId: "usd-wallet",
      transactions: list(rows, true),
      wallets: [
        {
          __typename: "UsdWallet",
          id: "usd-wallet",
          balance: 1_000,
          walletCurrency: "USD",
          isExternal: false,
        },
      ],
    },
  },
})

/** `count` rows, a minute apart, the newest at `newest` (unix seconds). */
const rows = (count: number, newest: number, prefix: string): TransactionRow[] =>
  Array.from({ length: count }, (_, i) =>
    graphqlTx({
      id: `${prefix}-${i}`,
      createdAt: newest - i * 60,
      memo: `${prefix} ${i}`,
    }),
  )

/** A client over `cache` with no network at all: a cache-only read never asks it. */
const offlineClient = (cache: InMemoryCache) =>
  new ApolloClient({
    cache,
    link: new ApolloLink(
      () =>
        new Observable((observer) => {
          observer.error(new Error("Network request failed"))
        }),
    ),
  })

/**
 * The history screen, as the app renders it, over `cache`: the app's own
 * mocks for what its rows read (the currency list, the price), and `answer`
 * for its list.
 */
const showHistoryScreen = (
  cache: InMemoryCache,
  answer: ReturnType<typeof historyAnswer>,
) =>
  render(
    <MockedProvider
      cache={cache}
      mocks={[
        ...appMocks,
        {
          request: { query: TransactionListForDefaultAccountDocument },
          result: { data: answer },
        },
      ]}
    >
      <ThemeProvider theme={theme}>
        <IsAuthedContextProvider value={true}>
          <USDTransactionHistory />
        </IsAuthedContextProvider>
      </ThemeProvider>
    </MockedProvider>,
  )

/** getTransactions over the cache-only rail on `cache`, with a BTC wallet that has no payments. */
const askOffline = async (cache: InMemoryCache, args: Record<string, unknown> = {}) =>
  getTransactions.run(args, {
    graphql: createGraphqlRail(offlineClient(cache), { fetchPolicy: "cache-only" }),
    btcRail: fakeBtcRail(),
    displayCurrency: "USD",
    now: () => NOW_MS,
  })

const payloadOf = (
  result: Awaited<ReturnType<typeof askOffline>>,
): TransactionsPayload => {
  if (result.kind !== "answer") throw new Error(`expected an answer, got ${result.kind}`)
  return result.payload as TransactionsPayload
}

const NEWEST = Math.floor(NOW_MS / 1000) - 3_600

describe("the offline rail over the app's own cache", () => {
  it("reads the history list where the history screen put it", async () => {
    const cache = createCache()
    const screenRows = rows(20, NEWEST, "history")
    const screen = showHistoryScreen(cache, historyAnswer(screenRows, true))
    // The screen drew its list, so its answer is in the cache.
    await waitFor(() => expect(screen.getByText("history 0")).toBeTruthy())

    // Where it is: under the arguments the screen asked with, none.
    const account = cache.extract()[`ConsumerAccount:${ACCOUNT_ID}`] as Record<
      string,
      unknown
    >
    expect(Object.keys(account)).toContain("transactions({})")
    // The rail's own page, `first: 20`, is not there: Apollo answers it partial.
    const ownPage = await offlineClient(cache).query({
      query: TransactionListForDefaultAccountDocument,
      variables: { first: 20 },
      fetchPolicy: "cache-only",
    })
    expect(ownPage.partial).toBe(true)

    // The cache-only rail reads the screen's list anyway.
    const rail = createGraphqlRail(offlineClient(cache), { fetchPolicy: "cache-only" })
    const page = await rail.transactions({ first: 20 })
    expect(page.rows.map(({ id }) => id)).toEqual(screenRows.map(({ id }) => id))
    expect(page.hasNextPage).toBe(true)
  })

  it("answers a history ask offline from that list, and ends the search where the cache does", async () => {
    // The list says it has a next page, which the cache does not hold: the
    // answer is the first page and its window, never "something went wrong".
    const cache = createCache()
    const screenRows = rows(20, NEWEST, "history")
    const screen = showHistoryScreen(cache, historyAnswer(screenRows, true))
    await waitFor(() => expect(screen.getByText("history 0")).toBeTruthy())

    const payload = payloadOf(await askOffline(cache, { direction: "RECEIVE" }))

    expect(payload.transactions).toEqual([])
    expect(payload.window).toEqual({
      searchedCount: 20,
      oldestTimestamp: screenRows[19].createdAt,
      rails: ["graphql", "btc"],
      replyKey: "Assistant.searchedWindow",
    })
    const shown = payloadOf(await askOffline(cache))
    expect(shown.transactions.map(({ id }) => id)).toEqual(
      screenRows.slice(0, 10).map(({ id }) => id),
    )
  })

  it("reads the home screen's three rows when the history screen never ran", async () => {
    const cache = createCache()
    const homeRows = rows(3, NEWEST, "home")
    cache.writeQuery({ query: HomeAuthedDocument, data: homeAnswer(homeRows) })

    const payload = payloadOf(await askOffline(cache))

    expect(payload.transactions.map(({ id }) => id)).toEqual(homeRows.map(({ id }) => id))
    // Home's list says more follow, and the cache holds none of them.
    expect(payload.window.searchedCount).toBe(3)
  })

  it("reads the latest copy, continued by an older one it overlaps: home's newer rows, then the history list", async () => {
    const cache = createCache()
    // The history screen ran a week ago; home refreshed since, with a newer
    // payment and two rows the history list holds too.
    const old = rows(20, NEWEST - 7 * 86_400, "history")
    cache.writeQuery({
      query: TransactionListForDefaultAccountDocument,
      data: historyAnswer(old),
    })
    const homeRows = [
      graphqlTx({ id: "new-1", createdAt: NEWEST, memo: "new" }),
      ...old.slice(0, 2),
    ]
    cache.writeQuery({ query: HomeAuthedDocument, data: homeAnswer(homeRows) })

    const payload = payloadOf(await askOffline(cache, { first: 20 }))

    expect(payload.transactions[0].id).toBe("new-1")
    // One list: home's new row and the history screen's twenty, each once.
    expect(payload.window).toEqual({
      searchedCount: 21,
      oldestTimestamp: old[19].createdAt,
      rails: ["graphql", "btc"],
      replyKey: "Assistant.searchedWindow",
    })
    expect(payload.transactions.map(({ id }) => id)).toEqual(
      ["new-1", ...old.map(({ id }) => id)].slice(0, 20),
    )
    // A search reaches the history list's rows: last week's payment to mom.
    const rail = createGraphqlRail(offlineClient(cache), { fetchPolicy: "cache-only" })
    const page = await rail.transactions({ first: 20 })
    expect(page.rows.map(({ id }) => id)).toEqual(["new-1", ...old.map(({ id }) => id)])
    // The page info is the history list's, which reaches further back.
    expect(page).toMatchObject({ hasNextPage: false, endCursor: old[19].id })
  })

  it("never joins two copies with a gap between them: the latest stands alone", async () => {
    const cache = createCache()
    // Home refreshed after three new payments, none of which the week-old
    // history list holds: there may be others between the two.
    const old = rows(20, NEWEST - 7 * 86_400, "history")
    cache.writeQuery({
      query: TransactionListForDefaultAccountDocument,
      data: historyAnswer(old),
    })
    const homeRows = rows(3, NEWEST, "new")
    cache.writeQuery({ query: HomeAuthedDocument, data: homeAnswer(homeRows) })

    const payload = payloadOf(await askOffline(cache, { first: 20 }))

    expect(payload.transactions.map(({ id }) => id)).toEqual(homeRows.map(({ id }) => id))
    expect(payload.window.searchedCount).toBe(3)
  })

  it("keeps the older copy's next page, and ends the search where the cache does", async () => {
    // The history list says more follow; the cache holds no page after it.
    const cache = createCache()
    const old = rows(20, NEWEST - 86_400, "history")
    cache.writeQuery({
      query: TransactionListForDefaultAccountDocument,
      data: historyAnswer(old, true),
    })
    const homeRows = [graphqlTx({ id: "new-1", createdAt: NEWEST }), ...old.slice(0, 2)]
    cache.writeQuery({ query: HomeAuthedDocument, data: homeAnswer(homeRows) })
    const rail = createGraphqlRail(offlineClient(cache), { fetchPolicy: "cache-only" })

    await expect(rail.transactions({ first: 20 })).resolves.toMatchObject({
      hasNextPage: true,
      endCursor: old[19].id,
    })
    await expect(
      rail.transactions({ first: 20, after: old[19].id }),
    ).rejects.toBeInstanceOf(GraphqlRailError)

    // A search that wants more than the joined list holds reads it whole
    // and says how far it reached.
    const payload = payloadOf(await askOffline(cache, { direction: "RECEIVE" }))
    expect(payload.window).toMatchObject({
      searchedCount: 21,
      oldestTimestamp: old[19].createdAt,
    })
  })

  it("reads the longer of two copies as new as each other", async () => {
    const cache = createCache()
    const screenRows = rows(20, NEWEST, "history")
    cache.writeQuery({
      query: TransactionListForDefaultAccountDocument,
      data: historyAnswer(screenRows),
    })
    cache.writeQuery({
      query: HomeAuthedDocument,
      data: homeAnswer(screenRows.slice(0, 3)),
    })

    const payload = payloadOf(await askOffline(cache))

    expect(payload.window.searchedCount).toBe(20)
  })

  it("still fails a read the cache holds no list for", async () => {
    const rail = createGraphqlRail(offlineClient(createCache()), {
      fetchPolicy: "cache-only",
    })

    await expect(rail.transactions({ first: 20 })).rejects.toBeInstanceOf(
      GraphqlRailError,
    )
  })

  it("names the home screen's list by the arguments homeAuthed asks with", () => {
    // CACHED_TRANSACTION_PAGES.homeScreen must be homeAuthed's own
    // `transactions(first: 3)`, or the rail reads a key home never writes.
    const operation = HomeAuthedDocument.definitions.find(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === "OperationDefinition",
    )
    const field = (selections: readonly SelectionNode[], name: string): FieldNode => {
      const found = selections.find(
        (selection): selection is FieldNode =>
          selection.kind === "Field" && selection.name.value === name,
      )
      if (!found) throw new Error(`homeAuthed has no ${name}`)
      return found
    }
    const me = field(operation?.selectionSet.selections ?? [], "me")
    const account = field(me.selectionSet?.selections ?? [], "defaultAccount")
    const transactions = field(account.selectionSet?.selections ?? [], "transactions")
    const args = Object.fromEntries(
      (transactions.arguments ?? []).map((argument) => [
        argument.name.value,
        argument.value.kind === "IntValue" ? Number(argument.value.value) : undefined,
      ]),
    )

    expect(args).toEqual(CACHED_TRANSACTION_PAGES.homeScreen)
  })
})
