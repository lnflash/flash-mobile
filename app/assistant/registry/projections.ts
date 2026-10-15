import type { WalletCurrency } from "@app/graphql/generated"
import type { InvalidDestinationReason } from "@app/screens/send-bitcoin-screen/payment-destination/index.types"
import type { BtcMoneyAmount, MoneyAmount, UsdMoneyAmount } from "@app/types/amounts"
import type { TransactionDetailsRow } from "../rails/graphql-rail"

// What each read tool answers, and the compact form of it that leaves
// runTool (docs/ai-assistant-tool-registry.md §4, last paragraph). These are
// pure functions. By default they drop payment hashes, preimages, memos and
// counterparty names; a memo or a counterparty is kept only when the call's
// own query was about it. Internal ids that no reply needs (wallet ids) are
// dropped too.

// ---------------------------------------------------------------------------
// getBalances
// ---------------------------------------------------------------------------

export type CashWallet = "USD" | "USDT"

export type CashBalance =
  | { wallet: CashWallet; walletId: string; state: "ok"; balance: UsdMoneyAmount }
  | {
      wallet: CashWallet
      walletId: string
      state: "unavailable"
      replyKey: "Assistant.balanceUnavailable"
    }

/**
 * A BTC wallet with no figure to give, and the reply that says why: it is
 * still syncing, it is switched off (advance mode), or it failed to start.
 */
export type BtcUnavailable =
  | { state: "syncing"; replyKey: "Assistant.btcSyncing" }
  | { state: "disabled"; replyKey: "Assistant.btcDisabled" }
  | { state: "failed"; replyKey: "Assistant.btcFailed" }

export const btcUnavailable = (state: BtcUnavailable["state"]): BtcUnavailable => {
  switch (state) {
    case "syncing":
      return { state, replyKey: "Assistant.btcSyncing" }
    case "disabled":
      return { state, replyKey: "Assistant.btcDisabled" }
    case "failed":
      return { state, replyKey: "Assistant.btcFailed" }
  }
}

export type BtcBalanceEntry =
  | { wallet: "BTC"; state: "ok"; balance: BtcMoneyAmount }
  | ({ wallet: "BTC" } & BtcUnavailable)

export type BalancesPayload = { balances: (CashBalance | BtcBalanceEntry)[] }

export type BalancesProjection = {
  balances: (Omit<CashBalance, "walletId"> | BtcBalanceEntry)[]
}

export const projectBalances = (payload: BalancesPayload): BalancesProjection => ({
  balances: payload.balances.map((entry) => {
    if (entry.wallet === "BTC") return entry
    const { walletId: _walletId, ...rest } = entry
    return rest
  }),
})

// ---------------------------------------------------------------------------
// getTransactions
// ---------------------------------------------------------------------------

export type TxRail = "graphql" | "btc"

export type TxRow = {
  rail: TxRail
  id: string
  direction: "SEND" | "RECEIVE"
  status: "SUCCESS" | "PENDING" | "FAILURE"
  /** Unsigned; `direction` says which way it went. */
  amount: MoneyAmount<WalletCurrency>
  fee: MoneyAmount<WalletCurrency>
  /** Unix seconds. */
  timestamp: number
  memo: string | null
  /** The other party's username or Lightning address, where the rail names one. */
  counterparty: string | null
  paymentHash: string | null
}

/**
 * What was searched, so a miss is never silent ("in your last 100
 * payments"): every payment on the searched rails newer than
 * `oldestTimestamp` was looked at.
 */
export type TxWindow = {
  searchedCount: number
  /** Unix seconds; null when there was nothing to search. */
  oldestTimestamp: number | null
  rails: TxRail[]
  replyKey: "Assistant.searchedWindow"
}

export type BtcRailState = { state: "ok" } | BtcUnavailable

export type TransactionsPayload = {
  transactions: TxRow[]
  window: TxWindow
  btc: BtcRailState
}

export type TxRowProjection = Omit<TxRow, "memo" | "counterparty" | "paymentHash"> & {
  memo?: string | null
  counterparty?: string | null
}

export type TransactionsProjection = Omit<TransactionsPayload, "transactions"> & {
  transactions: TxRowProjection[]
}

export const projectTransactions = (
  payload: TransactionsPayload,
  { query }: { query?: string },
): TransactionsProjection => {
  // A query is a memo or payee search, so the rows it matched keep the
  // fields it matched on. A blank query searched nothing and keeps nothing.
  const queried = Boolean(query?.trim())
  return {
    ...payload,
    transactions: payload.transactions.map(
      ({ memo, counterparty, paymentHash: _paymentHash, ...row }) =>
        queried ? { ...row, memo, counterparty } : row,
    ),
  }
}

// ---------------------------------------------------------------------------
// getTransactionDetails
// ---------------------------------------------------------------------------

export type TransactionDetailsPayload = { details: TransactionDetailsRow }

/**
 * The status of a payment, nothing that identifies it on a network or names
 * the other side. The amount is not here on purpose: `transactionDetails`
 * reports it as a float in units the schema does not state, and the row from
 * getTransactions already carries the settlement amount in minor units.
 */
export type TransactionDetailsProjection = Pick<
  TransactionDetailsRow,
  "id" | "status" | "type" | "createdAt" | "updatedAt" | "confirmations"
>

export const projectTransactionDetails = ({
  details,
}: TransactionDetailsPayload): TransactionDetailsProjection => ({
  id: details.id,
  status: details.status,
  type: details.type,
  createdAt: details.createdAt,
  updatedAt: details.updatedAt,
  confirmations: details.confirmations,
})

// ---------------------------------------------------------------------------
// resolveContact
// ---------------------------------------------------------------------------

export type ContactPayload = {
  /** Always shown in full on any card that names the payee (spec §4). */
  username: string
  alias: string | null
  defaultWallet: { id: string; walletCurrency: WalletCurrency }
}

export type ContactProjection = {
  username: string
  alias: string | null
  walletCurrency: WalletCurrency
}

/** The contact was the query, so its names stay; its wallet id does not. */
export const projectContact = (payload: ContactPayload): ContactProjection => ({
  username: payload.username,
  alias: payload.alias,
  walletCurrency: payload.defaultWallet.walletCurrency,
})

// ---------------------------------------------------------------------------
// getPrice
// ---------------------------------------------------------------------------

/** A price as `base / 10^offset` minor units of `currency`, exact integers. */
export type PricePayload = {
  currency: string
  /** Unix seconds. */
  timestamp: number
  btcSatPrice: { base: number; offset: number }
  usdCentPrice: { base: number; offset: number }
}

export const projectPrice = (payload: PricePayload): PricePayload => payload

// ---------------------------------------------------------------------------
// searchMerchants
// ---------------------------------------------------------------------------

export type MerchantsPayload = {
  merchants: { title: string; username: string | null }[]
  /** How many matched before the list was capped. */
  matchedCount: number
}

export const projectMerchants = (payload: MerchantsPayload): MerchantsPayload => payload

// ---------------------------------------------------------------------------
// getAccountLimits
// ---------------------------------------------------------------------------

export type LimitEntry = {
  total: UsdMoneyAmount
  /** Null when the server does not report what is left. */
  remaining: UsdMoneyAmount | null
  intervalSeconds: number | null
}

export type AccountLimitsPayload = {
  withdrawal: LimitEntry[]
  internalSend: LimitEntry[]
  convert: LimitEntry[]
}

export const projectAccountLimits = (
  payload: AccountLimitsPayload,
): AccountLimitsPayload => payload

// ---------------------------------------------------------------------------
// decodePaymentRequest
// ---------------------------------------------------------------------------

export type DecodedPaymentRequest =
  | {
      valid: true
      direction: "send"
      destinationType: "lightning" | "lnurl" | "onchain" | "intraledger"
      /** Null when the request carries no amount. */
      amount: BtcMoneyAmount | null
      /** Unix seconds; only an invoice states one. */
      expiresAt: number | null
      /** A username, a Lightning address or an LNURL domain, or an on-chain address. */
      payee: string | null
    }
  | {
      valid: true
      direction: "receive"
      destinationType: "lnurlWithdraw"
      /** The most the service will pay out. */
      amount: BtcMoneyAmount
      payee: string
    }
  | { valid: false; reason: InvalidDestinationReason }

export const projectDecodedPaymentRequest = (
  payload: DecodedPaymentRequest,
): DecodedPaymentRequest => payload
