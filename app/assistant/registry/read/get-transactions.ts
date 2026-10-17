import { LNURL_DOMAINS } from "@app/config/appinfo"
import { btcRailUnavailableState } from "@app/payments/btc-rail"
import { toBtcMoneyAmount, toWalletAmount } from "@app/types/amounts"
import { isPlainObject } from "../../engine/schema-validator"
import type { ContactRow, GraphqlRail, TransactionRow } from "../../rails/graphql-rail"
import { defineRead } from "../define"
import {
  BtcRailState,
  btcUnavailable,
  projectTransactions,
  TransactionsPayload,
  TxRail,
  TxRow,
} from "../projections"
import type { BtcReadRail, ReadToolCtx, ToolResult } from "../types"

// getTransactions (docs/ai-assistant-tool-registry.md §4). Both rails, one
// newest-first list. A search pages through at most TX_MAX_PAGES pages of
// TX_PAGE_SIZE on GraphQL, then lists the BTC wallet's payments over the
// same stretch of time, so neither rail's window is wider than the other's.
// The answer always states the window, so a miss is never silent.
//
// A page past the first that cannot be read ends the search there, with
// what was read: lnflash/flash refuses the next page's cursor (spec §5.1,
// ENG-724), so wherever the list says it has a next page that read fails,
// and offline the cache holds a later page only if the history screen
// fetched it. The window then says how far the search reached. Only a
// failed first page fails the answer.
//
// A query finds a payment by its memo, by its payee (a Flash username, or
// a Lightning address on the BTC rail), or by a contact whose alias holds it
// (rowMatcher), whose BTC payments name them by Lightning address
// (flashUsername). A search that misses a payment it should find tells the
// user they never paid that person, and they may pay twice.

export const TX_PAGE_SIZE = 20
export const TX_MAX_PAGES = 5
/** How many matches to answer with when the call does not say. */
export const TX_DEFAULT_RESULTS = 10
/** The BTC side lists at most as many payments as the GraphQL side can. */
export const BTC_PAYMENTS_LIMIT = TX_PAGE_SIZE * TX_MAX_PAGES

type Args = {
  first?: number
  direction?: "SEND" | "RECEIVE"
  query?: string
}

type BtcPayment = Awaited<ReturnType<BtcReadRail["listPayments"]>>[number]

// The SDK's numeric enums (PaymentType, PaymentStatus), keyed exhaustively
// as send-payment.ts keys them: an SDK bump that adds a member fails tsc
// here until someone decides what it means. The registry never imports the
// SDK, so the values are written out.
const BTC_DIRECTION: Record<BtcPayment["paymentType"], TxRow["direction"]> = {
  0: "SEND", // Send
  1: "RECEIVE", // Receive
}
const BTC_STATUS: Record<BtcPayment["status"], TxRow["status"]> = {
  0: "SUCCESS", // Completed
  1: "PENDING", // Pending
  2: "FAILURE", // Failed
}
// PaymentMethod: whether a payment of each method states its amount and fee
// in sats. A Spark token payment states them in the token's base units (5
// USDT is 5,000,000), and this tool reports every BTC row as sats, so it
// leaves token payments out.
const BTC_METHOD_IN_SATS: Record<BtcPayment["method"], boolean> = {
  0: true, // Lightning
  1: true, // Spark
  2: false, // Token
  3: true, // Deposit
  4: true, // Withdraw
  5: true, // Unknown: listed under the Bitcoin asset filter, so not a token
}

/** A string field of an SDK object, read without the SDK's types. */
const stringField = (value: unknown, key: string): string | null => {
  if (!isPlainObject(value)) return null
  const field = value[key]
  return typeof field === "string" ? field : null
}

const objectField = (value: unknown, key: string): unknown =>
  isPlainObject(value) ? value[key] : undefined

const graphqlTxRow = (tx: TransactionRow): TxRow => {
  const intraledger =
    tx.settlementVia.__typename === "SettlementViaIntraLedger"
      ? tx.settlementVia
      : tx.initiationVia.__typename === "InitiationViaIntraLedger"
      ? tx.initiationVia
      : undefined
  return {
    rail: "graphql",
    id: tx.id,
    direction: tx.direction,
    status: tx.status,
    // Signed on the wire (a send is negative); unsigned here, as TxItem
    // shows it, with `direction` saying which way it went.
    amount: toWalletAmount({
      amount: Math.abs(tx.settlementAmount),
      currency: tx.settlementCurrency,
    }),
    fee: toWalletAmount({
      amount: Math.abs(tx.settlementFee),
      currency: tx.settlementCurrency,
    }),
    timestamp: tx.createdAt,
    memo: tx.memo ?? null,
    counterparty: intraledger?.counterPartyUsername ?? null,
    paymentHash:
      tx.initiationVia.__typename === "InitiationViaLn"
        ? tx.initiationVia.paymentHash
        : null,
  }
}

const btcTxRow = (payment: BtcPayment): TxRow => {
  // PaymentDetails_Tags.Lightning in the SDK's generated enum. Only a
  // Lightning payment carries a description and a payee address.
  const lightning =
    String(payment.details?.tag) === "Lightning" ? payment.details?.inner : undefined
  return {
    rail: "btc",
    id: payment.id,
    direction: BTC_DIRECTION[payment.paymentType],
    status: BTC_STATUS[payment.status],
    amount: toBtcMoneyAmount(Number(payment.amount)),
    fee: toBtcMoneyAmount(Number(payment.fees)),
    timestamp: Number(payment.timestamp),
    memo: stringField(lightning, "description"),
    counterparty: stringField(objectField(lightning, "lnurlPayInfo"), "lnAddress"),
    paymentHash: stringField(objectField(lightning, "htlcDetails"), "paymentHash"),
  }
}

/** Newest first; ties broken by rail and id, so the order never wobbles. */
const newestFirst = (a: TxRow, b: TxRow): number =>
  b.timestamp - a.timestamp || a.rail.localeCompare(b.rail) || a.id.localeCompare(b.id)

/**
 * A payee as a search compares it: lower case, letters and digits only. A
 * Flash username holds no hyphen, apostrophe or space, so "Kerry-Ann",
 * "D'Andre" and "uncle joe" must lose theirs to find kerryann_b, dandre_w
 * and unclejoe.
 */
const asHandle = (text: string): string =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")

/**
 * A memo as a search compares it: lower case, letters, digits and single
 * spaces. Its words keep their edges, so "mom" is not found in "from omar",
 * while "kerry-ann" is found in "lunch for Kerry-Ann".
 */
const asText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()

/** The query as a search reads it: trimmed and lower case; "" for none. */
const typedQuery = (query: string | undefined): string =>
  query?.trim().toLowerCase() ?? ""

/**
 * A test for whether a field holds the query, as typed or as `fold`
 * compares them, with the query folded once for the whole search.
 */
const finder = (typed: string, fold: (text: string) => string) => {
  const needle = fold(typed)
  return (field: string | null): boolean =>
    field !== null &&
    (field.toLowerCase().includes(typed) ||
      (needle !== "" && fold(field).includes(needle)))
}

/**
 * The hosts of Flash's own Lightning addresses, lower case: the app's
 * LNURL domains and the instance's own host, which they may lack
 * (test.flashapp.me on Test).
 */
const flashHosts = (lnAddressHostname: string): ReadonlySet<string> =>
  new Set([...LNURL_DOMAINS, lnAddressHostname].map((host) => host.toLowerCase()))

/**
 * The Flash username a payee names, lower case, or null when it names none.
 * The GraphQL rail names a Flash user by username. The BTC rail names one by
 * Lightning address: a BTC-wallet send to a Flash user pays username@host
 * over LNURL (sendPayment), and the SDK records that address as the payee
 * (btcTxRow). An address at one of Flash's hosts names its handle; one at
 * any other host is not a Flash user's, whatever its handle.
 */
const flashUsername = (
  counterparty: string,
  hosts: ReadonlySet<string>,
): string | null => {
  const payee = counterparty.toLowerCase()
  if (!payee.includes("@")) return payee
  const address = /^([^@]+)@([^@]+)$/.exec(payee)
  return address !== null && hosts.has(address[2]) ? address[1] : null
}

/**
 * Which rows a call asks for: its direction, and a query found in the
 * memo, in the payee, or in the alias of the payee's contact
 * (`contactUsernames`, contactsNamed), whose username a payee at one of
 * `hosts` names too.
 */
const rowMatcher = (
  { direction, query }: Args,
  contactUsernames: ReadonlySet<string>,
  hosts: ReadonlySet<string>,
) => {
  const typed = typedQuery(query)
  const inMemo = finder(typed, asText)
  const inPayee = finder(typed, asHandle)
  const paysContact = (counterparty: string | null): boolean => {
    if (counterparty === null) return false
    const username = flashUsername(counterparty, hosts)
    return username !== null && contactUsernames.has(username)
  }
  return (row: TxRow): boolean => {
    if (direction && row.direction !== direction) return false
    if (!typed) return true
    return inMemo(row.memo) || inPayee(row.counterparty) || paysContact(row.counterparty)
  }
}

/**
 * The usernames of the contacts whose alias holds the query, as inPayee
 * finds it in a username (as typed, or on letters and digits alone):
 * "payments to mom" finds the payments to the contact the user calls Mom,
 * whatever her username, and "kerry ann" those to Kerry-Ann. This reads a
 * name more loosely than resolveContact does (namesContact), which a payee
 * needs: in a search, a contact taken wrongly is a row the user sees, and a
 * payment missed is one they are told they never made. A username needs no
 * contact, since the payee holds it. A contact list the rail cannot read
 * (offline, when the cache holds none) names no one; the memo and the payee
 * are still searched.
 */
const contactsNamed = async (
  graphql: GraphqlRail,
  query: string | undefined,
): Promise<ReadonlySet<string>> => {
  const typed = typedQuery(query)
  if (!typed) return new Set()
  let contacts: readonly ContactRow[]
  try {
    contacts = await graphql.contacts()
  } catch {
    return new Set()
  }
  const inAlias = finder(typed, asHandle)
  return new Set(
    contacts
      .filter(({ alias }) => inAlias(alias ?? null))
      .map(({ username }) => username.toLowerCase()),
  )
}

const oldest = (rows: readonly TxRow[]): number =>
  rows.reduce((min, row) => Math.min(min, row.timestamp), Infinity)

const oldestPayment = (payments: readonly BtcPayment[]): number =>
  payments.reduce((min, payment) => Math.min(min, Number(payment.timestamp)), Infinity)

/**
 * The GraphQL pages a search reads: up to TX_MAX_PAGES, stopping on enough
 * matches, or at a page past the first that cannot be read (the note at
 * the top). `exhausted` only when the list said it had no more.
 */
const readGraphql = async (
  graphql: GraphqlRail,
  { want, matches }: { want: number; matches: (row: TxRow) => boolean },
): Promise<{ rows: TxRow[]; exhausted: boolean }> => {
  const rows: TxRow[] = []
  let after: string | undefined
  for (let page = 0; page < TX_MAX_PAGES; page += 1) {
    let result: Awaited<ReturnType<GraphqlRail["transactions"]>>
    try {
      result = await graphql.transactions({ first: TX_PAGE_SIZE, after })
    } catch (err) {
      if (page === 0) throw err
      break
    }
    rows.push(...result.rows.map(graphqlTxRow))
    if (!result.hasNextPage || !result.endCursor) return { rows, exhausted: true }
    after = result.endCursor
    if (rows.filter(matches).length >= want) break
  }
  return { rows, exhausted: false }
}

/**
 * The BTC wallet's payments since `fromTimestamp`, or the reason there are
 * none. `listedFrom` is set when the list came back full: older payments may
 * exist that it did not return, so it covers time only back to its oldest.
 */
const readBtc = async (
  btcRail: BtcReadRail,
  fromTimestamp: number | undefined,
): Promise<{ rows: TxRow[]; listedFrom: number | undefined; state: BtcRailState }> => {
  try {
    // Bitcoin payments only: the wallet can hold Spark tokens too (USDT,
    // ENG-473), and a token payment's amount is not sats.
    const payments = await btcRail.listPayments(0, BTC_PAYMENTS_LIMIT, {
      fromTimestamp,
      assets: "bitcoin",
    })
    return {
      // A token payment that reaches here anyway is left out, never read as sats.
      rows: payments
        .filter((payment) => BTC_METHOD_IN_SATS[payment.method] === true)
        .map(btcTxRow),
      listedFrom:
        payments.length >= BTC_PAYMENTS_LIMIT ? oldestPayment(payments) : undefined,
      state: { state: "ok" },
    }
  } catch (err) {
    const state = btcRailUnavailableState(err)
    if (!state) throw err
    return { rows: [], listedFrom: undefined, state: btcUnavailable(state) }
  }
}

const run = async (
  args: Args,
  ctx: ReadToolCtx,
): Promise<ToolResult<TransactionsPayload>> => {
  const want = args.first ?? TX_DEFAULT_RESULTS
  // The schema caps `first` at 20; it cannot say "at least 1".
  if (want < 1) return { kind: "error", userMessage: "Assistant.invalidArguments" }
  const matches = rowMatcher(
    args,
    await contactsNamed(ctx.graphql, args.query),
    flashHosts(ctx.lnAddressHostname),
  )

  const graphql = await readGraphql(ctx.graphql, { want, matches })
  // Every GraphQL payment newer than this was read; undefined when all were.
  const graphqlFrom =
    graphql.exhausted || graphql.rows.length === 0 ? undefined : oldest(graphql.rows)
  const btc = await readBtc(ctx.btcRail, graphqlFrom)

  // A full BTC list may have left older payments out: then the window
  // starts at the oldest one it listed.
  const bounds = [graphqlFrom, btc.listedFrom].filter(
    (bound): bound is number => bound !== undefined,
  )
  const windowFrom = bounds.length > 0 ? Math.max(...bounds) : undefined
  // Rows older than the window were read on one rail but not on the other,
  // so they are left out rather than stated as searched.
  const searched = [...graphql.rows, ...btc.rows]
    .filter((row) => windowFrom === undefined || row.timestamp >= windowFrom)
    .sort(newestFirst)

  const rails: TxRail[] = btc.state.state === "ok" ? ["graphql", "btc"] : ["graphql"]
  const payload: TransactionsPayload = {
    transactions: searched.filter(matches).slice(0, want),
    window: {
      searchedCount: searched.length,
      oldestTimestamp: windowFrom ?? (searched.length > 0 ? oldest(searched) : null),
      rails,
      replyKey: "Assistant.searchedWindow",
    },
    btc: btc.state,
  }
  return { kind: "answer", payload }
}

export const getTransactions = defineRead({
  intent: "getTransactions",
  description:
    "List the user's recent payments, newest first, optionally only sends or receives, or those whose memo, payee or contact name matches a query.",
  input: {
    type: "object",
    properties: {
      first: { type: "integer", maximum: TX_PAGE_SIZE },
      direction: { enum: ["SEND", "RECEIVE"] }, // TxDirection
      // What to search for, 1 to 80 characters (the subset has no maxLength).
      query: { type: "string", pattern: "^[\\s\\S]{1,80}$" },
    },
    additionalProperties: false,
  },
  run,
  project: projectTransactions,
})
