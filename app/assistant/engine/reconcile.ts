import type { GraphqlRail, TransactionRow } from "../rails/graphql-rail"
import type { TransactionMatch } from "../registry/types"
import type { DispatchRecord } from "./attempt-journal"

// Reconciling a dispatch whose outcome was lost against the account's
// transaction list (docs/ai-assistant-tool-registry.md §5.1). The API has no
// lookup by idempotency key, so the payment is looked for by what it paid:
// its invoice's payment hash, the counterparty wallet and amount of an
// intraledger send, or its on-chain address. The verdict is absent only when
// the list proves the payment is not there; whatever it leaves in doubt is
// unknown, which keeps the payment from going again.
//
// On lnflash/flash main (d1cca3767) no row carries those identifiers yet.
// Account.transactions comes straight from IBEX: every Lightning row has
// paymentHash "" and every on-chain row address ""
// (src/app/wallets/get-transactions-for-wallet.ts), and a Flash-to-Flash
// send is an IBEX Lightning payment (intraledger-usd-payment-send.ts), so no
// row names an intraledger counterparty either. A sent row that names
// nothing could be the payment, so a list that holds one since the dispatch
// can never prove the payment absent: the verdict is unknown, as it is for a
// payment the list cannot show at all (a BTC-rail payment, a settlement).
// Only a list whose sent rows since the dispatch all name other payments, or
// that holds none, can prove it never landed.
//
// Nor does the API serve more than one page of the list. Account.transactions
// asks IBEX for page 0 of every history wallet, `first` rows long, newest
// first by settlement, not by creation (toIbexPaginationArgs sorts on
// settledAt, get-transactions-for-wallet.ts:202-236), and lists the wallets
// one after another (:18-30): an account cut over to USDT gets its USDT
// wallet's rows, then its legacy USD wallet's (cashWalletHistoryWalletIds,
// src/app/cash-wallet-cutover/presentation.ts). connectionFromPaginatedArray
// (src/graphql/connections.ts:21-71) then serves the list's first `first`
// rows, wherever a wallet's rows end, and says hasNextPage when more follow.
// It never serves the next page: its cursor is a row's IBEX id, a UUID
// (connections.ts:55), and checkedConnectionArgs refuses an `after` that is
// not 24 hex characters (connections.ts:9,171-175, consumer-account.ts:185).
// That read throws, so a list longer than one page is unknown. ENG-724 makes
// the next page real; the reasoning below about each wallet's rows is to be
// revisited then. Until it lands, a list the reconciler can judge is one page
// holding every row the API returned: each wallet's newest RECONCILE_PAGE_SIZE
// rows by settlement, one wallet's block after another's.
//
// Nor does a list without the paying wallet's rows prove anything, an empty
// list included: the API serves a wallet whose IBEX read failed as no rows
// and no error (get-transactions-for-wallet.ts:27-35, since
// src/services/ibex/errors.ts:142-171 returns the error instead of throwing
// it; ENG-725). Rows carry no wallet id, so a block is told by its settlement
// currency: an account holds one cash wallet per currency (legacy USD, USDT),
// and the record names the paying wallet's (sourceWalletCurrency). This
// client tells the API it supports the USDT cash wallet
// (X-Flash-Client-Capabilities: cash-wallet-usdt-v1, app/graphql/client.tsx),
// so the API never shows it the legacy USD wallet in the USDT one's place
// (src/app/cash-wallet-cutover/guard.ts:104): the cash wallet it shows and
// pays from is the account's active settlement wallet (presentation.ts:30-38,
// 54-59).
//
// A block that fills a page with rows since the dispatch may hide the
// payment one row further down, a row the API never serves. A wallet's rows
// since the dispatch were all served only when its block ends short of a
// page, or shows a row that settled before the dispatch: every row that
// settled after the dispatch ranks above that one. Rows carry no settledAt,
// so a row counts as settled before the dispatch when it was created before
// it and is not on-chain. An on-chain row is created when first seen and
// ranks by its confirmation, which can come long after: a deposit first seen
// before the dispatch can confirm after it, and rank above the payment. The
// paying wallet's block must be in the list, and every block in it read
// back so.

/**
 * - settled: the payment is in the list, sent or still pending.
 * - absent: the list shows the paying wallet's rows, and every wallet's
 *   rows since the first dispatch in full (see the note at the top), the
 *   latest dispatch (a retry's, if there was one) is old enough that the
 *   server would have recorded it, and the payment is not there.
 * - unknown: anything else. The caller blocks a new attempt.
 */
export type ReconcileVerdict = "settled" | "absent" | "unknown"

export type Reconcile = (record: DispatchRecord) => Promise<ReconcileVerdict>

/**
 * How long after a record's latest dispatch its absence from the list means
 * it never landed. A retry under the same key starts the wait over.
 */
export const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000

/**
 * How long after a record's latest dispatch nothing about it can still be on
 * its way. lnflash/flash serves one page of the list, each wallet's newest
 * RECONCILE_PAGE_SIZE rows (see the note at the top), so a record whose
 * payment lies further back than that can never be settled by it, nor shown
 * absent; past this age the executor lets the user clear it on their word
 * that their history does not show the payment (executor.ts,
 * `historyChecked`).
 */
export const RECONCILE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Slack for the device clock against the server's createdAt (as invoice-expiry.ts allows). */
export const RECONCILE_CLOCK_SKEW_SECONDS = 120

/**
 * The most pages read looking for one payment. lnflash/flash refuses the
 * cursor of the second (see the note at the top), so until ENG-724 a list
 * longer than one page is unknown after two reads.
 */
export const RECONCILE_MAX_PAGES = 5

/**
 * How many rows each read asks for, and so how many of each wallet's newest
 * rows lnflash/flash serves (see the note at the top): a wallet whose rows
 * fill it may have more that the list never shows.
 */
export const RECONCILE_PAGE_SIZE = 20

/** One wallet's rows in the list, told apart by their settlement currency. */
type WalletBlock = {
  /** How many of its rows the list served. */
  rows: number
  /** Whether one of them settled before the dispatch (settledBefore). */
  reachesBack: boolean
}

/**
 * Whether a row settled before the dispatch, as far as the row can show it.
 * The list ranks rows by when they settled, which a row does not carry, so
 * a row created before the dispatch is taken to have settled before it,
 * unless it is on-chain: an on-chain row is created when first seen and
 * settles when it confirms, which can be long after, so one created before
 * the dispatch can rank above the payment.
 */
const settledBefore = (tx: TransactionRow, since: number): boolean =>
  tx.createdAt < since && tx.initiationVia.__typename !== "InitiationViaOnChain"

/**
 * Whether the list served every row a wallet made since the dispatch: its
 * block shows a row that settled before it, or ends short of a page, so
 * there is no row past it that the API kept back.
 */
const readBackToDispatch = ({ rows, reachesBack }: WalletBlock): boolean =>
  reachesBack || rows < RECONCILE_PAGE_SIZE

const intraledgerVia = (tx: TransactionRow) => {
  if (tx.settlementVia.__typename === "SettlementViaIntraLedger") return tx.settlementVia
  if (tx.initiationVia.__typename === "InitiationViaIntraLedger") return tx.initiationVia
  return undefined
}

/** Whether a transaction row is the payment a dispatch record describes. */
export const matchesTransaction = (
  match: TransactionMatch,
  tx: TransactionRow,
): boolean => {
  if (tx.direction !== "SEND") return false
  switch (match.kind) {
    case "lightning":
      return (
        tx.initiationVia.__typename === "InitiationViaLn" &&
        tx.initiationVia.paymentHash === match.paymentHash
      )
    case "intraledger":
      return (
        intraledgerVia(tx)?.counterPartyWalletId === match.counterPartyWalletId &&
        tx.settlementCurrency === match.settlementCurrency &&
        Math.abs(tx.settlementAmount) === match.amount
      )
    case "onchain":
      return (
        tx.initiationVia.__typename === "InitiationViaOnChain" &&
        tx.initiationVia.address === match.address
      )
    case "btcRail":
      // The BTC wallet's payments are not in this list.
      return false
    case "cashout":
      // Nothing in a row says which settlement it was (ENG-716).
      return false
    case "anyOf":
      return match.matches.some((leg) => matchesTransaction(leg, tx))
  }
}

/** A row of a kind the API could not name: an IBEX type it renders as intraledger, with no counterparty. */
const unnamedIntraledger = (tx: TransactionRow): boolean =>
  tx.initiationVia.__typename === "InitiationViaIntraLedger" &&
  !intraledgerVia(tx)?.counterPartyWalletId

/**
 * Whether a sent row might be the payment a match names while carrying
 * nothing that rules it out: the identifier the match would be checked
 * against is blank, or the row is one the payment can show up as and names
 * no counterparty. lnflash/flash sends every row this way today (see the
 * note at the top), so not finding the payment by name among such rows
 * proves nothing. A row that names a different payment rules itself out.
 */
export const cannotRuleOut = (match: TransactionMatch, tx: TransactionRow): boolean => {
  if (match.kind === "anyOf") return match.matches.some((leg) => cannotRuleOut(leg, tx))
  if (tx.direction !== "SEND") return false
  const via = tx.initiationVia
  switch (match.kind) {
    case "lightning":
      return via.__typename === "InitiationViaLn"
        ? !via.paymentHash
        : unnamedIntraledger(tx)
    case "intraledger":
      // A Flash-to-Flash send is an IBEX Lightning payment, so its row can
      // be a Lightning one, which names no counterparty: only a row that
      // names one, or an on-chain row, rules it out.
      return (
        via.__typename !== "InitiationViaOnChain" &&
        !intraledgerVia(tx)?.counterPartyWalletId
      )
    case "onchain":
      return via.__typename === "InitiationViaOnChain"
        ? !via.address
        : unnamedIntraledger(tx)
    case "btcRail":
    case "cashout":
      // Never in the list: the reconciler answers these without reading it.
      return false
  }
}

/**
 * Whether the GraphQL list could show every payment a match names, so that
 * not finding them there can mean they never went. A BTC-rail payment is
 * never in it, and nor is anything that says which settlement a row was
 * (ENG-688).
 */
export const listCanShow = (match: TransactionMatch): boolean => {
  switch (match.kind) {
    case "btcRail":
    case "cashout":
      return false
    case "anyOf":
      return match.matches.every(listCanShow)
    default:
      return true
  }
}

export const createTransactionListReconciler = ({
  graphql,
  now,
  minAgeMs = RECONCILE_MIN_AGE_MS,
}: {
  graphql: GraphqlRail
  now: () => number
  minAgeMs?: number
}): Reconcile => {
  return async (record) => {
    // Nothing the list holds can settle a BTC-rail payment or a settlement,
    // or prove it never went: there is nothing to read.
    if (record.match.kind === "btcRail" || record.match.kind === "cashout") {
      return "unknown"
    }
    // Back to the first dispatch: a retry can only have landed after it.
    const since = Math.floor(record.dispatchedAt / 1000) - RECONCILE_CLOCK_SKEW_SECONDS
    let after: string | undefined
    // The list was read to its end: its last page said there is no next.
    let listEnded = false
    const blocks = new Map<string, WalletBlock>()
    // A sent row since the dispatch that names nothing, which could be it.
    let unnamedSince = false
    try {
      for (let page = 0; page < RECONCILE_MAX_PAGES && !listEnded; page += 1) {
        const result = await graphql.transactions({ first: RECONCILE_PAGE_SIZE, after })
        // A failed payment moved nothing: it is not the dispatch landing.
        const landed = result.rows.filter(
          (tx) => tx.createdAt >= since && tx.status !== "FAILURE",
        )
        if (landed.some((tx) => matchesTransaction(record.match, tx))) return "settled"
        if (landed.some((tx) => cannotRuleOut(record.match, tx))) unnamedSince = true
        result.rows.forEach((tx) => {
          const block = blocks.get(tx.settlementCurrency)
          blocks.set(tx.settlementCurrency, {
            rows: (block?.rows ?? 0) + 1,
            reachesBack: (block?.reachesBack ?? false) || settledBefore(tx, since),
          })
        })
        listEnded = !result.hasNextPage
        // More rows, and no way to ask for them: the rest stays unread.
        if (!listEnded && !result.endCursor) break
        after = result.endCursor ?? undefined
      }
    } catch {
      // lnflash/flash refuses the next page's cursor (see the note at the
      // top): a list read in part is unknown, as is one that cannot be read.
      return "unknown"
    }
    // The list must be read to its end: every wallet's block is judged
    // whole, and the rows past a page could hold the payment.
    if (!listEnded) return "unknown"
    // The paying wallet's rows must be in the list. A list without them, an
    // empty one included, may be one whose read of that wallet failed
    // (ENG-725), and a record that does not say which wallet paid cannot be
    // judged at all.
    if (
      record.sourceWalletCurrency === null ||
      !blocks.has(record.sourceWalletCurrency)
    ) {
      return "unknown"
    }
    // Every wallet's block must be read back past the dispatch. A block whose
    // rows all came since the dispatch proves nothing on its own: it may be
    // all the API serves of a wallet whose payment lies one row past it.
    if (![...blocks.values()].every(readBackToDispatch)) return "unknown"
    // Part of it is a payment the list cannot show: not seeing the rest says
    // nothing about that part.
    if (!listCanShow(record.match)) return "unknown"
    // A row since the dispatch might be the payment, under no name: its
    // absence by name proves nothing (lnflash/flash names no row today).
    if (unnamedSince) return "unknown"
    // Measured from the latest dispatch: a retry can still land for as long
    // after it as the first could after the first.
    return now() - record.lastDispatchedAt >= minAgeMs ? "absent" : "unknown"
  }
}
