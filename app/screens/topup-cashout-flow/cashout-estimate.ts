type SelectableBankAccount = {
  // id is nullable in the GraphQL schema; callers must still null-check the
  // picked account's id before using it (onNext does).
  id?: string | null
  currency: string
  isDefault?: boolean | null
}

/**
 * The single source of truth for which bank account a cashout will pay to:
 * stored default among JMD accounts → default-flagged JMD → first JMD →
 * stored default among all → default-flagged → first. Used by onNext (to
 * pick the account) AND by the settlement preview (to decide the payout
 * currency) — keep them on this one function so they can never disagree.
 */
export const pickDefaultBankAccount = <T extends SelectableBankAccount>(
  accounts: readonly T[],
  storedDefaultId?: string | null,
): T | undefined => {
  const jmdAccounts = accounts.filter((a) => a.currency.toUpperCase() === "JMD")
  return (
    jmdAccounts.find((a) => a.id === storedDefaultId) ||
    jmdAccounts.find((a) => a.isDefault) ||
    jmdAccounts[0] ||
    accounts.find((a) => a.id === storedDefaultId) ||
    accounts.find((a) => a.isDefault) ||
    accounts[0]
  )
}

/**
 * Whether the cashout will settle in JMD. The stored default id cannot change
 * the outcome (JMD accounts always win the selection when any exist), so the
 * preview can decide before the async stored id loads.
 */
export const selectsJmdPayout = (accounts: readonly SelectableBankAccount[]): boolean =>
  pickDefaultBankAccount(accounts)?.currency.toUpperCase() === "JMD"

/**
 * Mirrors the backend cashout quote math (flash CashoutManager.createOffer):
 * the service fee (basis points) comes off the USD amount first, then the
 * remainder converts at the settlement rate (JMD cents per 1 USD, integer
 * division like USDAmount.convertAtRate). The result previews the offer's
 * receiveJmd — the authoritative number still comes from requestCashout.
 */
export const estimateJmdReceiveCents = (
  usdCents: number,
  rateJmdCentsPerUsd: number,
  feeBasisPoints: number,
): number => {
  if (!(usdCents > 0) || !(rateJmdCentsPerUsd > 0) || feeBasisPoints < 0) return 0
  const feeCents = Math.floor((usdCents * feeBasisPoints) / 10_000)
  const payoutUsdCents = usdCents - feeCents
  return Math.floor((payoutUsdCents * rateJmdCentsPerUsd) / 100)
}
