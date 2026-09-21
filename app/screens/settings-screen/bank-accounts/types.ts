// Normalized, rail-agnostic view model for the unified "Bank accounts" hub.
//
// The UI must never branch on the underlying rail (Bridge vs ERPNext) or leak
// internal words like "virtual account". Every account — money-in or money-out —
// is projected into this single shape so the screen stays one mental model.

export type BankAccountRole = "receive" | "withdraw"

export type BankAccountSource = "bridge-virtual" | "bridge-external" | "erpnext"

export type BankAccountStatus = "verified" | "pending" | "actionRequired" | "unknown"

export type BankAccountVM = {
  /** Stable key for RN lists. */
  key: string
  /** Underlying account id (rail-specific). */
  id: string
  source: BankAccountSource
  role: BankAccountRole
  bankName: string
  /** Last 4 of the account number, already masked upstream where required. */
  last4: string
  /** ISO-ish currency code, upper-cased (e.g. "USD", "JMD"). */
  currency: string
  status: BankAccountStatus
  /**
   * Server-side default for the account's rail: ERPNext keeps one default
   * across the customer's local accounts, Bridge one across external accounts.
   */
  isDefault: boolean
  /** Whether the default can be changed from the app (withdrawal accounts: yes). */
  canSetDefault: boolean
  /** Whether the account can be removed in-app (ERPNext + Bridge external). */
  canRemove: boolean

  // Receive-role extras (virtual account) — undefined for withdrawal accounts.
  accountNumber?: string | null
  routingNumber?: string | null
  /** Provisioning still in flight (receive account not ready yet). */
  pending?: boolean

  // Withdraw (ERPNext) extras — prefill the edit screen. Undefined for other rails.
  bankBranch?: string
  accountType?: string
  /** Raw currency value as stored server-side (echoed back on update; currency is locked). */
  currencyRaw?: string
  /**
   * Legacy review-gated change request. Edits are instant now, so the server
   * normally returns null; still rendered if one is in flight.
   */
  pendingUpdate?: {
    status: string
    bankName: string
    bankBranch: string
    accountType: string
    accountNumber: string
    currency: string
    rejectionReason?: string | null
  } | null
}

/**
 * The payout rail a withdrawal account belongs to. The server keeps exactly one
 * default per rail, so the hub groups by rail (NOT by currency: a legacy USD
 * ERPNext account shares its default with the JMD ones, not with Bridge).
 */
export type WithdrawRail = "us" | "local"

export type WithdrawGroup = {
  rail: WithdrawRail
  /** Default-first. At most one account in a group is the default. */
  accounts: BankAccountVM[]
}
