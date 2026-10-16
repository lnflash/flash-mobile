import type { GraphqlRail, TransactionRow } from "../rails/graphql-rail"
import type { TransactionMatch } from "../registry/types"
import type { DispatchRecord } from "./attempt-journal"

// Reconciling a dispatch whose outcome was lost against the account's
// transaction list (docs/ai-assistant-tool-registry.md §5.1). The API has no
// lookup by idempotency key, so the payment is looked for by what it paid:
// its invoice's payment hash, the counterparty wallet and amount of an
// intraledger send, or its on-chain address.

/**
 * - settled: the payment is in the list, sent or still pending.
 * - absent: the list since the first dispatch was read in full, the latest
 *   dispatch (a retry's, if there was one) is old enough that the server
 *   would have recorded it, and the payment is not there.
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
 * its way. The list is read back only RECONCILE_MAX_PAGES pages, so a record
 * older than the newest hundred payments can never be settled by it; past
 * this age the executor lets the user clear it on their word that their
 * history does not show the payment (executor.ts, `historyChecked`).
 */
export const RECONCILE_STALE_AFTER_MS = 24 * 60 * 60 * 1000

/** Slack for the device clock against the server's createdAt (as invoice-expiry.ts allows). */
export const RECONCILE_CLOCK_SKEW_SECONDS = 120

/** The most of the list read looking for one payment. */
export const RECONCILE_MAX_PAGES = 5

const RECONCILE_PAGE_SIZE = 20

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
    case "anyOf":
      return match.matches.some((leg) => matchesTransaction(leg, tx))
  }
}

/**
 * Whether the GraphQL list could show every payment a match names, so that
 * not finding them there can mean they never went. A BTC-rail payment is
 * never in it (ENG-688).
 */
export const listCanShow = (match: TransactionMatch): boolean => {
  switch (match.kind) {
    case "btcRail":
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
    // Nothing the list holds can settle a BTC-rail payment or prove it never
    // went: there is nothing to read.
    if (record.match.kind === "btcRail") return "unknown"
    // Back to the first dispatch: a retry can only have landed after it.
    const since = Math.floor(record.dispatchedAt / 1000) - RECONCILE_CLOCK_SKEW_SECONDS
    let after: string | undefined
    let readSinceDispatch = false
    try {
      for (let page = 0; page < RECONCILE_MAX_PAGES && !readSinceDispatch; page += 1) {
        const result = await graphql.transactions({ first: RECONCILE_PAGE_SIZE, after })
        const recent = result.rows.filter((tx) => tx.createdAt >= since)
        // A failed payment moved nothing: it is not the dispatch landing.
        if (
          recent.some(
            (tx) => tx.status !== "FAILURE" && matchesTransaction(record.match, tx),
          )
        ) {
          return "settled"
        }
        readSinceDispatch =
          recent.length < result.rows.length || !result.hasNextPage || !result.endCursor
        after = result.endCursor ?? undefined
      }
    } catch {
      return "unknown"
    }
    if (!readSinceDispatch) return "unknown"
    // Part of it is a payment the list cannot show: not seeing the rest says
    // nothing about that part.
    if (!listCanShow(record.match)) return "unknown"
    // Measured from the latest dispatch: a retry can still land for as long
    // after it as the first could after the first.
    return now() - record.lastDispatchedAt >= minAgeMs ? "absent" : "unknown"
  }
}
