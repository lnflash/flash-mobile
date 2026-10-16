import type {
  ApolloClient,
  DocumentNode,
  FetchResult,
  MutationFunctionOptions,
  MutationOptions,
  OperationVariables,
} from "@apollo/client"
import { mergeOptions } from "@apollo/client/utilities"

import {
  AccountStatusDocument,
  AccountStatusQuery,
  BankAccountsDocument,
  BankAccountsQuery,
  InitiateCashoutDocument,
  InitiateCashoutInput,
  InitiateCashoutMutation,
  InitiateCashoutMutationVariables,
  LnInvoiceFeeProbeDocument,
  LnNoAmountInvoiceFeeProbeDocument,
  LnNoAmountUsdInvoiceFeeProbeDocument,
  LnUsdInvoiceCreateDocument,
  LnUsdInvoiceCreateInput,
  LnUsdInvoiceCreateMutation,
  LnUsdInvoiceCreateMutationVariables,
  LnUsdInvoiceFeeProbeDocument,
  OnChainAddressCurrentDocument,
  OnChainAddressCurrentMutation,
  OnChainAddressCurrentMutationVariables,
  OnChainTxFeeDocument,
  OnChainUsdTxFeeAsBtcDenominatedDocument,
  OnChainUsdTxFeeDocument,
  RequestCashoutDocument,
  RequestCashoutInput,
  RequestCashoutMutation,
  RequestCashoutMutationVariables,
} from "@app/graphql/generated"
import type { GetFeeParams } from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import { GraphqlRailError } from "./graphql-rail"

// The custodial rail (USD and USDT wallets) as the assistant's action tools
// see it (ENG-688): the fee probes, invoices, addresses and settlement calls
// the send, receive and settle screens already make, with the session's own
// auth (docs/ai-assistant-tool-registry.md §1, rule 4). The read tools never
// get this rail. The nine send triggers are not here either: those come from
// app/payments (createGraphqlMutationFns) and are reached only from a
// prepared action's execute(), journaled.

export type UsdInvoiceRow = NonNullable<
  LnUsdInvoiceCreateMutation["lnUsdInvoiceCreate"]["invoice"]
>

export type BankAccountRow = NonNullable<BankAccountsQuery["me"]>["bankAccounts"][number]

export type CashoutOfferRow = NonNullable<
  RequestCashoutMutation["requestCashout"]["offer"]
>

export type InitiatedCashoutRow = InitiateCashoutMutation["initiateCashout"]

export type GraphqlActionRail = {
  /**
   * The seven fee triggers a PaymentDetail's getFee takes, as the send
   * screen's useFee hands them in (use-fee.ts), so a detail is probed by
   * its own closure.
   */
  feeProbes: GetFeeParams
  /** A Lightning invoice on a USD or USDT wallet; `amount` in cents, 0 for none. */
  lnUsdInvoiceCreate: (input: LnUsdInvoiceCreateInput) => Promise<UsdInvoiceRow>
  /** A USD or USDT wallet's current on-chain address. */
  onChainAddressCurrent: (walletId: string) => Promise<string>
  /**
   * Whether the server lets this account settle to a bank. The server field
   * decides; an account type without capabilities cannot.
   */
  accountCapabilities: () => Promise<{ bankPayout: boolean }>
  /** The bank accounts the settle screen reads. */
  bankAccounts: () => Promise<readonly BankAccountRow[]>
  /** A settlement offer; rejects with the server's message when there is none. */
  requestCashout: (input: RequestCashoutInput) => Promise<CashoutOfferRow>
  /**
   * Execute an offer. The server's answer comes back as it is, errors and
   * all, so the caller can tell an offer already used from a failure.
   */
  initiateCashout: (input: InitiateCashoutInput) => Promise<InitiatedCashoutRow>
}

/** The first message of a payload's errors, if it has any. */
const firstError = (
  errors: readonly { message: string }[] | null | undefined,
): string | undefined => errors?.[0]?.message

export const createGraphqlActionRail = (
  client: ApolloClient<unknown>,
): GraphqlActionRail => {
  // A mutation trigger, made the way createGraphqlMutationFns makes the send
  // triggers, without their HomeAuthed refetch: a probe moves nothing.
  const mutateWith =
    <TData, TVariables extends OperationVariables>(mutation: DocumentNode) =>
    (
      options: MutationFunctionOptions<TData, TVariables> = {},
    ): Promise<FetchResult<TData>> =>
      client.mutate<TData, TVariables>(
        mergeOptions<
          MutationOptions<TData, TVariables>,
          MutationOptions<TData, TVariables>
        >({ mutation }, options),
      )

  // A lazy query's trigger. The getFee closures read only `data` from its
  // answer (payment-details/onchain.ts), so client.query's answer stands in
  // for a whole QueryResult, as the GraphQL rail's destination lookup does
  // for the destination resolvers.
  const queryWith =
    <TData, TVariables extends OperationVariables>(query: DocumentNode) =>
    (options?: { variables?: TVariables }) =>
      client.query<TData, TVariables>({
        query,
        variables: options?.variables,
        fetchPolicy: "network-only",
      })

  const feeProbes: GetFeeParams = {
    lnInvoiceFeeProbe: mutateWith(LnInvoiceFeeProbeDocument),
    lnNoAmountInvoiceFeeProbe: mutateWith(LnNoAmountInvoiceFeeProbeDocument),
    lnNoAmountUsdInvoiceFeeProbe: mutateWith(LnNoAmountUsdInvoiceFeeProbeDocument),
    lnUsdInvoiceFeeProbe: mutateWith(LnUsdInvoiceFeeProbeDocument),
    onChainTxFee: queryWith(
      OnChainTxFeeDocument,
    ) as unknown as GetFeeParams["onChainTxFee"],
    onChainUsdTxFee: queryWith(
      OnChainUsdTxFeeDocument,
    ) as unknown as GetFeeParams["onChainUsdTxFee"],
    onChainUsdTxFeeAsBtcDenominated: queryWith(
      OnChainUsdTxFeeAsBtcDenominatedDocument,
    ) as unknown as GetFeeParams["onChainUsdTxFeeAsBtcDenominated"],
  }

  return {
    feeProbes,

    lnUsdInvoiceCreate: async (input) => {
      const { data } = await client.mutate<
        LnUsdInvoiceCreateMutation,
        LnUsdInvoiceCreateMutationVariables
      >({ mutation: LnUsdInvoiceCreateDocument, variables: { input } })
      const payload = data?.lnUsdInvoiceCreate
      const error = firstError(payload?.errors)
      if (error) throw new GraphqlRailError(error)
      if (!payload?.invoice) throw new GraphqlRailError("No invoice was created")
      return payload.invoice
    },

    onChainAddressCurrent: async (walletId) => {
      const { data } = await client.mutate<
        OnChainAddressCurrentMutation,
        OnChainAddressCurrentMutationVariables
      >({ mutation: OnChainAddressCurrentDocument, variables: { input: { walletId } } })
      const payload = data?.onChainAddressCurrent
      const error = firstError(payload?.errors)
      if (error) throw new GraphqlRailError(error)
      if (!payload?.address) throw new GraphqlRailError("No address was returned")
      return payload.address
    },

    accountCapabilities: async () => {
      // The query use-account-status.ts makes, from the network: a stale
      // capability must not open the settle path.
      const { data } = await client.query<AccountStatusQuery>({
        query: AccountStatusDocument,
        fetchPolicy: "network-only",
      })
      if (!data?.me) throw new GraphqlRailError("No signed-in user")
      const account = data.me.defaultAccount
      const capabilities = "capabilities" in account ? account.capabilities : undefined
      return { bankPayout: capabilities?.bankPayout === true }
    },

    bankAccounts: async () => {
      const { data } = await client.query<BankAccountsQuery>({
        query: BankAccountsDocument,
        fetchPolicy: "network-only",
      })
      if (!data?.me) throw new GraphqlRailError("No signed-in user")
      return data.me.bankAccounts
    },

    requestCashout: async (input) => {
      const { data } = await client.mutate<
        RequestCashoutMutation,
        RequestCashoutMutationVariables
      >({ mutation: RequestCashoutDocument, variables: { input } })
      const payload = data?.requestCashout
      const error = firstError(payload?.errors)
      if (error) throw new GraphqlRailError(error)
      if (!payload?.offer) throw new GraphqlRailError("No offer was made")
      return payload.offer
    },

    initiateCashout: async (input) => {
      const { data } = await client.mutate<
        InitiateCashoutMutation,
        InitiateCashoutMutationVariables
      >({ mutation: InitiateCashoutDocument, variables: { input } })
      if (!data) throw new GraphqlRailError("No answer to initiateCashout")
      return data.initiateCashout
    },
  }
}
