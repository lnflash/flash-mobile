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
  /** True when this is the default withdrawal account for its currency. */
  isDefault: boolean
  /**
   * Whether the user can change the default from the app. USD/Bridge: yes.
   * Local/ERPNext: interim client-side only until a backend mutation exists.
   */
  canSetDefault: boolean
  /** Whether the account can be removed in-app (needs a backend delete mutation). */
  canRemove: boolean

  // Receive-role extras (virtual account) — undefined for withdrawal accounts.
  accountNumber?: string | null
  routingNumber?: string | null
  /** Provisioning still in flight (receive account not ready yet). */
  pending?: boolean
}

export type WithdrawGroup = {
  currency: string
  accounts: BankAccountVM[]
}
