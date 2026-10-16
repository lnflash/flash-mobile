import { decodeInvoiceString, Network as NetworkLibGaloy } from "@galoymoney/client"

import { LNURL_DOMAINS } from "@app/config/appinfo"
import {
  AccountDefaultWalletLazyQueryHookResult,
  AccountDefaultWalletQuery,
} from "@app/graphql/generated"
import { networkForPaymentRequest } from "@app/screens/send-bitcoin-screen/invoice-expiry"
import { parseDestination } from "@app/screens/send-bitcoin-screen/payment-destination"
import {
  DestinationDirection,
  ParseDestinationResult,
} from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import { toBtcMoneyAmount } from "@app/types/amounts"
import type { GraphqlRail } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import { DecodedPaymentRequest, projectDecodedPaymentRequest } from "../projections"
import type { ReadToolCtx, ToolResult } from "../types"

// decodePaymentRequest (docs/ai-assistant-tool-registry.md §4): what a pasted
// or scanned request is, through the send flow's own destination parser
// (send-bitcoin-screen/payment-destination). Decode only: no fee probe (that
// belongs to prepareSend, ENG-688) and no payment. The parser's answer
// carries a createPaymentDetail builder; the payload keeps only the type,
// amount, expiry and payee, so nothing a caller gets back can build a send.

type Args = { raw: string }

type AccountDefaultWalletQueryFn = AccountDefaultWalletLazyQueryHookResult[0]

/**
 * The destination resolvers take the send screens' lazy query and read only
 * `data` from its answer (payment-destination/intraledger.ts and
 * resolve-username-to-lnurl.ts): `{ data }` from the GraphQL rail stands in
 * for the rest of a QueryResult, which nothing reads.
 */
export const accountDefaultWalletQueryOver = (
  graphql: GraphqlRail,
): AccountDefaultWalletQueryFn => {
  const query = async (options?: { variables?: { username?: string } }) => {
    const username = options?.variables?.username
    const wallet = username ? await graphql.accountDefaultWallet(username) : null
    const data: AccountDefaultWalletQuery | undefined = wallet
      ? { __typename: "Query", accountDefaultWallet: wallet }
      : undefined
    return { data }
  }
  return query as unknown as AccountDefaultWalletQueryFn
}

/** The invoice's own expiry, in Unix seconds, when it can be read. */
const invoiceExpiresAt = (paymentRequest: string): number | null => {
  const network = networkForPaymentRequest(paymentRequest)
  if (!network) return null
  try {
    const { timeExpireDate } = decodeInvoiceString(
      paymentRequest,
      network as NetworkLibGaloy,
    )
    return timeExpireDate ?? null
  } catch {
    return null
  }
}

const decoded = (result: ParseDestinationResult): DecodedPaymentRequest => {
  if (!result.valid) return { valid: false, reason: result.invalidReason }

  if (result.destinationDirection === DestinationDirection.Receive) {
    const withdraw = result.validDestination
    return {
      valid: true,
      direction: "receive",
      destinationType: "lnurlWithdraw",
      // Millisats, converted as the redeem screen converts them
      // (redeem-bitcoin-detail-screen.tsx).
      amount: toBtcMoneyAmount(Math.round(withdraw.maxWithdrawable / 1000)),
      payee: withdraw.domain,
    }
  }

  const destination = result.validDestination
  switch (destination.paymentType) {
    case "lightning":
      return {
        valid: true,
        direction: "send",
        destinationType: "lightning",
        amount: destination.amount ? toBtcMoneyAmount(destination.amount) : null,
        expiresAt: invoiceExpiresAt(destination.paymentRequest),
        // A bolt11 names a node, not a person.
        payee: null,
      }
    case "lnurl":
      return {
        valid: true,
        direction: "send",
        destinationType: "lnurl",
        // Only a fixed LNURL-pay request states one amount (in sats).
        amount: destination.lnurlParams.fixed
          ? toBtcMoneyAmount(destination.lnurlParams.min)
          : null,
        expiresAt: null,
        payee:
          destination.lnurlParams.identifier || destination.lnurlParams.domain || null,
      }
    case "onchain":
      return {
        valid: true,
        direction: "send",
        destinationType: "onchain",
        amount: destination.amount ? toBtcMoneyAmount(destination.amount) : null,
        expiresAt: null,
        payee: destination.address,
      }
    case "intraledger":
    case "intraledgerWithFlag":
      return {
        valid: true,
        direction: "send",
        destinationType: "intraledger",
        amount: null,
        expiresAt: null,
        payee: destination.handle,
      }
  }
}

const run = async (
  { raw }: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<DecodedPaymentRequest>> => {
  const wallets = await ctx.graphql.wallets()
  const result = await parseDestination({
    rawInput: raw.trim(),
    myWalletIds: wallets.map((wallet) => wallet.id),
    bitcoinNetwork: "mainnet", // parseDestination hard-codes mainnet too
    lnurlDomains: LNURL_DOMAINS,
    accountDefaultWalletQuery: accountDefaultWalletQueryOver(ctx.graphql),
  })
  return { kind: "answer", payload: decoded(result) }
}

export const decodePaymentRequest = defineRead({
  intent: "decodePaymentRequest",
  description:
    "Say what a payment request, invoice, address or username is, without paying it.",
  input: {
    type: "object",
    properties: {
      raw: { type: "string", pattern: "^[\\s\\S]{1,2048}$" },
    },
    required: ["raw"],
    additionalProperties: false,
  },
  run,
  project: projectDecodedPaymentRequest,
})
