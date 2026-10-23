import type { ApolloClient, DocumentNode, OperationVariables } from "@apollo/client"

import {
  AccountDefaultWalletDocument,
  AccountDefaultWalletQuery,
  AccountDefaultWalletQueryVariables,
  AccountLimitsDocument,
  AccountLimitsQuery,
  BusinessMapMarkersDocument,
  BusinessMapMarkersQuery,
  ContactsDocument,
  ContactsQuery,
  RealtimePriceUnauthedDocument,
  RealtimePriceUnauthedQuery,
  RealtimePriceUnauthedQueryVariables,
  TransactionDetailsDocument,
  TransactionDetailsQuery,
  TransactionDetailsQueryVariables,
  TransactionFragment,
  TransactionListForDefaultAccountDocument,
  TransactionListForDefaultAccountQuery,
  TransactionListForDefaultAccountQueryVariables,
  WalletOverviewScreenDocument,
  WalletOverviewScreenQuery,
} from "@app/graphql/generated"

import { searchFlashUsernames } from "./username-search"

// The custodial rail (USD and USDT wallets) as the assistant's read tools see
// it: the queries the screens already make, with the session's own auth
// (docs/ai-assistant-tool-registry.md §1, rule 4, "No new powers"). There is
// no mutation here, so a read tool holding this rail cannot move money.
//
// Every read uses an existing generated document and asks the network, not
// the cache: a balance, a price or a limit the assistant reports has to be
// the server's current answer. The one exception is the thread offline
// (ENG-689, spec §7.2): it reads balances and history through a copy of
// the rail made with `fetchPolicy: "cache-only"`, and labels what that copy
// answers as stale. What the cache does not hold is a failed read there,
// never an empty answer. That copy reads the transaction list where the
// app's screens put it in the cache (CACHED_TRANSACTION_PAGES), joining
// two copies where they overlap.

export type WalletRow = NonNullable<
  WalletOverviewScreenQuery["me"]
>["defaultAccount"]["wallets"][number]

export type TransactionRow = TransactionFragment

/** One page of `Account.transactions`, newest first (schema `Account.transactions`). */
export type TransactionPage = {
  rows: readonly TransactionRow[]
  hasNextPage: boolean
  endCursor: string | null
}

export type TransactionDetailsRow = NonNullable<
  TransactionDetailsQuery["transactionDetails"]["transactionDetails"]
>

export type ContactRow = NonNullable<ContactsQuery["me"]>["contacts"][number]

export type PublicWalletRow = AccountDefaultWalletQuery["accountDefaultWallet"]

export type RealtimePriceRow = RealtimePriceUnauthedQuery["realtimePrice"]

export type MapMarkerRow = BusinessMapMarkersQuery["businessMapMarkers"][number]

export type AccountLimitsRow = NonNullable<
  AccountLimitsQuery["me"]
>["defaultAccount"]["limits"]

export type GraphqlRail = {
  /** Similar public usernames, including people outside the caller's contacts. */
  searchUsernames: (hint: string) => Promise<readonly string[]>
  /** The account's wallets with their balances (`Wallet.balance`, fractional cents). */
  wallets: () => Promise<readonly WalletRow[]>
  /** One page of the account's transactions, all wallets, newest first. */
  transactions: (page: { first: number; after?: string }) => Promise<TransactionPage>
  /** `transactionDetails`; null when the server has no details for the id. */
  transactionDetails: (transactionId: string) => Promise<TransactionDetailsRow | null>
  /**
   * The user's contacts. The only read of `User.contacts` in the assistant:
   * the field is deprecated ("will be moved to account"), so when it moves,
   * this is the one line that changes.
   */
  contacts: () => Promise<readonly ContactRow[]>
  /**
   * The default wallet of a Flash username, or null when the server says no
   * account has it. A lookup it fails for any other reason rejects.
   */
  accountDefaultWallet: (username: string) => Promise<PublicWalletRow | null>
  /** The live price, in a display currency's minor units. */
  realtimePrice: (currency: string) => Promise<RealtimePriceRow>
  businessMapMarkers: () => Promise<readonly MapMarkerRow[]>
  /** The account's daily limits, in cents. */
  accountLimits: () => Promise<AccountLimitsRow>
}

/** A read the server answered without the data the rail needs (signed out, say). */
export class GraphqlRailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GraphqlRailError"
  }
}

const signedInUser = <T>(me: T | null | undefined): T => {
  if (!me) throw new GraphqlRailError("No signed-in user")
  return me
}

/**
 * Where a rail's reads come from: the network (the default, and the only
 * source a tool that prepares a payment ever reads), or the cache alone,
 * for the thread's reads while it is offline (ENG-689).
 */
export type GraphqlRailFetchPolicy = "network-only" | "cache-only"

export type GraphqlRailOptions = { fetchPolicy?: GraphqlRailFetchPolicy }

/**
 * An answer the cache could not give in full: Apollo hands a cache-only
 * read it does not hold back as partial, with no data, rather than failing.
 */
const missedCache = (result: { data?: unknown; partial?: boolean }): boolean =>
  result.partial === true || result.data === undefined || result.data === null

/**
 * The sentence lnflash/flash answers a username that no account has with:
 * "Account does not exist for username <username>"
 * (CouldNotFindAccountFromUsernameError, src/graphql/error-map.ts:165-167 on
 * d1cca3767).
 */
export const ACCOUNT_NOT_FOUND_SENTENCE = "Account does not exist for username"

/** A GraphQL error as it reaches the app, with its code wherever a server puts it. */
type WireGraphqlError = {
  message?: unknown
  code?: unknown
  extensions?: { code?: unknown } | null
}

/**
 * Whether an accountDefaultWallet error is the server saying that no account
 * has the username, and nothing else. lnflash/flash gives this query
 * NOT_FOUND for that alone (account-default-wallet.ts:25-28). An account
 * that exists can still fail it, with DB_ERROR (error-map.ts:527-531) or a
 * cash-wallet presentation error such as CashWalletMissingUsdtWalletError
 * when the ENG-544 self-heal fails (presentation-for-account.ts:91-99). Each
 * is a GraphQL error on an HTTP 200 too, and none of them means no account.
 *
 * The code does not reach the app today. lnflash/flash's formatError moves
 * it out of `extensions` to a top-level `code`
 * (src/servers/graphql-server.ts:121-135), and the gateway in front of it
 * forwards neither: the Test API answers a missing username with
 * `extensions: { service: "public" }` alone. So the server's own sentence
 * is what tells the two apart, and NOT_FOUND counts wherever a server puts it.
 */
const saysNoAccount = ({ message, code, extensions }: WireGraphqlError): boolean =>
  code === "NOT_FOUND" ||
  extensions?.code === "NOT_FOUND" ||
  (typeof message === "string" && message.startsWith(ACCOUNT_NOT_FOUND_SENTENCE))

/**
 * Where the app's screens put the account's transaction list in the cache,
 * by the variables they ask with. The account's `transactions` field has
 * no keyArgs policy (app/graphql/cache.ts), so the cache keeps each set of
 * arguments apart, and a cache-only read finds only a list asked for with
 * the very same ones:
 *
 * - the history screen's first page: USDTransactionHistory asks with no
 *   variables at all;
 * - the home screen's three rows: homeAuthed asks for `first: 3`
 *   (app/graphql/front-end-queries.ts);
 * - and the assistant's own page, as an online read of it left it.
 *
 * A page after the first is cached only where the history screen's
 * fetchMore put it, under `after` alone, or where an online read of this
 * rail did.
 *
 * Each is the start of the account's list as it stood when it was read, so
 * a newer copy whose oldest row is in an older one continues into it: home
 * refreshed after a payment holds that payment and two rows the history
 * screen's twenty hold too. The two are then one list (cachedPage).
 */
export const CACHED_TRANSACTION_PAGES: Readonly<
  Record<"historyScreen" | "homeScreen", TransactionListForDefaultAccountQueryVariables>
> = {
  historyScreen: {},
  homeScreen: { first: 3 },
}

/** The newest row's time in a page, or -Infinity for an empty one. */
const newestOf = ({ rows }: TransactionPage): number =>
  Math.max(-Infinity, ...rows.map(({ createdAt }) => createdAt))

/**
 * `page` continued by `older`, when `older` holds `page`'s oldest row: the
 * rows of both, by id, newest first, and `older`'s page info, since it
 * reaches further back. When it does not, there may be payments between
 * the two that neither holds, so `page` stands alone and the window never
 * spans that gap.
 */
const continuedBy = (page: TransactionPage, older: TransactionPage): TransactionPage => {
  const last = page.rows[page.rows.length - 1]
  if (!last || !older.rows.some(({ id }) => id === last.id)) return page
  const ids = new Set(page.rows.map(({ id }) => id))
  return {
    rows: [...page.rows, ...older.rows.filter(({ id }) => !ids.has(id))].sort(
      (a, b) => b.createdAt - a.createdAt,
    ),
    hasNextPage: older.hasNextPage,
    endCursor: older.endCursor,
  }
}

/**
 * The rail over the app's Apollo client. The client is built inside a React
 * effect (app/graphql/client.tsx), so there is no static one to import: the
 * caller passes it in.
 */
export const createGraphqlRail = (
  client: ApolloClient<unknown>,
  { fetchPolicy = "network-only" }: GraphqlRailOptions = {},
): GraphqlRail => {
  const read = async <TData, TVariables extends OperationVariables = OperationVariables>(
    query: DocumentNode,
    variables?: TVariables,
  ): Promise<TData> => {
    const result = await client.query<TData, TVariables>({
      query,
      variables,
      fetchPolicy,
    })
    if (missedCache(result)) throw new GraphqlRailError("No answer in the cache")
    return result.data
  }

  /** One page of the account's transactions, from the network or the cache. */
  const readTransactions = async (
    variables: TransactionListForDefaultAccountQueryVariables,
  ): Promise<TransactionPage> => {
    const data = await read<
      TransactionListForDefaultAccountQuery,
      TransactionListForDefaultAccountQueryVariables
    >(TransactionListForDefaultAccountDocument, variables)
    const connection = signedInUser(data.me).defaultAccount.transactions
    return {
      rows: (connection?.edges ?? []).map((edge) => edge.node),
      hasNextPage: connection?.pageInfo.hasNextPage ?? false,
      endCursor: connection?.pageInfo.endCursor ?? null,
    }
  }

  /**
   * Of these lists, the cache's latest copy: of those it holds whole, the
   * one with the newest row, and of two as new, the longer (a list read
   * later holds every row since; one with no newer row is as fresh). Each
   * older copy that holds the latest one's oldest row continues it
   * (continuedBy). A list it does not hold is a failed read; when it holds
   * none, so is this.
   */
  const cachedPage = async (
    candidates: readonly TransactionListForDefaultAccountQueryVariables[],
  ): Promise<TransactionPage> => {
    const held: TransactionPage[] = []
    for (const variables of candidates) {
      try {
        held.push(await readTransactions(variables))
      } catch (err) {
        if (!(err instanceof GraphqlRailError)) throw err
      }
    }
    const [latest, ...older] = [...held].sort(
      (a, b) => newestOf(b) - newestOf(a) || b.rows.length - a.rows.length,
    )
    if (!latest) throw new GraphqlRailError("No answer in the cache")
    return older.reduce(continuedBy, latest)
  }

  return {
    searchUsernames: async (hint) => {
      if (fetchPolicy === "cache-only")
        throw new GraphqlRailError("Search needs internet")
      return searchFlashUsernames(client, hint)
    },
    wallets: async () => {
      const data = await read<WalletOverviewScreenQuery>(WalletOverviewScreenDocument)
      return signedInUser(data.me).defaultAccount.wallets
    },

    transactions: async ({ first, after }) => {
      // From the network, the page asked for. From the cache, the latest
      // copy of it the screens left there, with any older copy it runs
      // into (CACHED_TRANSACTION_PAGES). A page the cache does not hold is
      // a failed read: the search ends at the page before it
      // (getTransactions).
      if (fetchPolicy === "network-only") return readTransactions({ first, after })
      if (after === undefined) {
        return cachedPage([
          CACHED_TRANSACTION_PAGES.historyScreen,
          CACHED_TRANSACTION_PAGES.homeScreen,
          { first },
        ])
      }
      return cachedPage([{ after }, { first, after }])
    },

    transactionDetails: async (transactionId) => {
      const data = await read<TransactionDetailsQuery, TransactionDetailsQueryVariables>(
        TransactionDetailsDocument,
        { input: { transactionId } },
      )
      const { errors, transactionDetails } = data.transactionDetails
      // "Not found" and its kin come back as payload errors, not as a failed
      // request: there are no details to show, which is an answer.
      if (errors.length > 0) return null
      return transactionDetails ?? null
    },

    contacts: async () => {
      const data = await read<ContactsQuery>(ContactsDocument)
      return signedInUser(data.me).contacts
    },

    accountDefaultWallet: async (username) => {
      // A GraphQL error comes back as data here (errorPolicy "all"), as it
      // does for the send screens' lazy query. Only the server saying that
      // no account has the username means "no wallet" (saysNoAccount). Any
      // other error is about an account that may well exist, so it is a
      // failed read, never "no such user" (ENG-730 review). Network failures
      // reject too, and so does a cache that does not hold the answer.
      const result = await client.query<
        AccountDefaultWalletQuery,
        AccountDefaultWalletQueryVariables
      >({
        query: AccountDefaultWalletDocument,
        variables: { username },
        fetchPolicy,
        errorPolicy: "all",
      })
      if (fetchPolicy === "cache-only" && missedCache(result)) {
        throw new GraphqlRailError("No answer in the cache")
      }
      const errors: readonly WireGraphqlError[] = result.errors ?? []
      if (errors.length > 0) {
        if (errors.every(saysNoAccount)) return null
        throw new GraphqlRailError("The username lookup failed")
      }
      return result.data?.accountDefaultWallet ?? null
    },

    realtimePrice: async (currency) => {
      const data = await read<
        RealtimePriceUnauthedQuery,
        RealtimePriceUnauthedQueryVariables
      >(RealtimePriceUnauthedDocument, { currency })
      return data.realtimePrice
    },

    businessMapMarkers: async () => {
      const data = await read<BusinessMapMarkersQuery>(BusinessMapMarkersDocument)
      return data.businessMapMarkers
    },

    accountLimits: async () => {
      const data = await read<AccountLimitsQuery>(AccountLimitsDocument)
      return signedInUser(data.me).defaultAccount.limits
    },
  }
}
