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

// The custodial rail (USD and USDT wallets) as the assistant's read tools see
// it: the queries the screens already make, with the session's own auth
// (docs/ai-assistant-tool-registry.md §1, rule 4, "No new powers"). There is
// no mutation here, so a read tool holding this rail cannot move money.
//
// Every read uses an existing generated document and asks the network, not
// the cache: a balance, a price or a limit the assistant reports has to be
// the server's current answer.

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
  /** The default wallet of a Flash username; null when there is none. */
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
 * The rail over the app's Apollo client. The client is built inside a React
 * effect (app/graphql/client.tsx), so there is no static one to import: the
 * caller passes it in.
 */
export const createGraphqlRail = (client: ApolloClient<unknown>): GraphqlRail => {
  const read = async <TData, TVariables extends OperationVariables = OperationVariables>(
    query: DocumentNode,
    variables?: TVariables,
  ): Promise<TData> => {
    const { data } = await client.query<TData, TVariables>({
      query,
      variables,
      fetchPolicy: "network-only",
    })
    return data
  }

  return {
    wallets: async () => {
      const data = await read<WalletOverviewScreenQuery>(WalletOverviewScreenDocument)
      return signedInUser(data.me).defaultAccount.wallets
    },

    transactions: async ({ first, after }) => {
      const data = await read<
        TransactionListForDefaultAccountQuery,
        TransactionListForDefaultAccountQueryVariables
      >(TransactionListForDefaultAccountDocument, { first, after })
      const connection = signedInUser(data.me).defaultAccount.transactions
      return {
        rows: (connection?.edges ?? []).map((edge) => edge.node),
        hasNextPage: connection?.pageInfo.hasNextPage ?? false,
        endCursor: connection?.pageInfo.endCursor ?? null,
      }
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
      // As the send screens' lazy query does: a username with no account is
      // a GraphQL error and means "no wallet", not a failed read. Network
      // failures still reject.
      const { data } = await client.query<
        AccountDefaultWalletQuery,
        AccountDefaultWalletQueryVariables
      >({
        query: AccountDefaultWalletDocument,
        variables: { username },
        fetchPolicy: "network-only",
        errorPolicy: "all",
      })
      return data?.accountDefaultWallet ?? null
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
