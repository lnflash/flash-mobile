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
import { flashUserWallet } from "./resolve-contact"

// decodePaymentRequest (docs/ai-assistant-tool-registry.md §4): what a pasted
// or scanned request is, through the send flow's own destination parser
// (send-bitcoin-screen/payment-destination). Decode only: no fee probe (that
// belongs to prepareSend, ENG-688) and no payment. The parser's answer
// carries a createPaymentDetail builder; the payload keeps only the type,
// amount, expiry and payee, so nothing a caller gets back can build a send.

type Args = { raw: string }

type AccountDefaultWalletQueryFn = AccountDefaultWalletLazyQueryHookResult[0]

/** The parser's username lookup over the GraphQL rail, and the failure it hid. */
type AccountDefaultWalletQueryOver = {
  query: AccountDefaultWalletQueryFn
  /** What the first lookup the rail failed rejected with, or undefined when none failed. */
  failure: () => { error: unknown } | undefined
}

/**
 * The destination resolvers take the send screens' lazy query and read only
 * `data` from its answer (payment-destination/intraledger.ts and
 * resolve-username-to-lnurl.ts): `{ data }` from the GraphQL rail stands in
 * for the rest of a QueryResult, which nothing reads. A handle that cannot
 * be a username has no wallet and costs no query (flashUserWallet): the
 * parser passes "LNBC1abc", which the server refuses with an error.
 *
 * A lookup the rail fails, a network error or a server error that does not
 * say no account has the username, answers no data, as the lazy query does:
 * Apollo 3.9 resolves it on an error and never rejects
 * (@apollo/client/react/hooks/useQuery.js:105-106). The parser then reads
 * it as it does on the send screen, so a Flash user's LNURL falls back to
 * its LNURL-pay request (payment-destination/lnurl.ts:56-79), where a
 * rejection would reach the catch that calls the LNURL unsupported. The
 * failure is kept for parseDestinationOver, which fails the read when the
 * parser's answer is invalid.
 */
const accountDefaultWalletQueryOver = (
  graphql: GraphqlRail,
): AccountDefaultWalletQueryOver => {
  let failure: { error: unknown } | undefined
  const query = async (options?: { variables?: { username?: string } }) => {
    const username = options?.variables?.username
    try {
      const wallet = username ? await flashUserWallet(username, graphql) : null
      const data: AccountDefaultWalletQuery | undefined = wallet
        ? { __typename: "Query", accountDefaultWallet: wallet }
        : undefined
      return { data }
    } catch (error) {
      if (!failure) failure = { error }
      return { data: undefined }
    }
  }
  return {
    query: query as unknown as AccountDefaultWalletQueryFn,
    failure: () => failure,
  }
}

/**
 * The send flow's destination parser over the GraphQL rail, as
 * decodePaymentRequest and prepareSend's payees read a destination. The
 * parser reads a username lookup that failed as no account
 * (accountDefaultWalletQueryOver). Where it falls back, that is the send
 * screen's answer: a Flash user's LNURL is still a valid LNURL-pay request.
 * Where it does not, it would call a username or a Flash Lightning address
 * unknown (UsernameDoesNotExist), so an invalid answer after a failed
 * lookup fails the read with the lookup's own error, which runTool answers
 * with Assistant.toolFailed (ENG-730 review).
 */
export const parseDestinationOver = async (
  rawInput: string,
  graphql: GraphqlRail,
  myWalletIds: readonly string[],
): Promise<ParseDestinationResult> => {
  const lookup = accountDefaultWalletQueryOver(graphql)
  const result = await parseDestination({
    rawInput,
    myWalletIds: [...myWalletIds],
    bitcoinNetwork: "mainnet", // parseDestination hard-codes mainnet too
    lnurlDomains: LNURL_DOMAINS,
    accountDefaultWalletQuery: lookup.query,
  })
  const failed = lookup.failure()
  if (!result.valid && failed) throw failed.error
  return result
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
  const result = await parseDestinationOver(
    raw.trim(),
    ctx.graphql,
    wallets.map((wallet) => wallet.id),
  )
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
