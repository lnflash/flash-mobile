type SelectableBankAccount = {
  // id is nullable in the GraphQL schema; callers must still null-check the
  // picked account's id before using it (onNext does).
  id?: string | null
  currency: string
  isDefault?: boolean | null
}

type PickOptions = {
  /** Account the user explicitly chose for this cashout ("Withdraw to" picker). */
  selectedId?: string | null
  /**
   * Payout currency already fixed by an offer (the confirmation screen passes
   * "JMD" when the offer settles in JMD). Accounts in this currency win.
   */
  preferredCurrency?: string | null
}

const isCurrency = (account: SelectableBankAccount, currency: string) =>
  account.currency.toUpperCase() === currency.toUpperCase()

/**
 * The single source of truth for which bank account a cashout will pay to.
 * Within the preferred currency (when one is given), then among all accounts:
 * the user's selection for this cashout → the server default (set in
 * Settings → Bank accounts) → first JMD → first. Used by onNext (to pick the
 * account), by the settlement preview (to decide the payout currency) AND by
 * the "Withdraw to" card — keep them on this one function so they can never
 * disagree.
 */
export const pickDefaultBankAccount = <T extends SelectableBankAccount>(
  accounts: readonly T[],
  { selectedId, preferredCurrency }: PickOptions = {},
): T | undefined => {
  const preferred = preferredCurrency
    ? accounts.filter((a) => isCurrency(a, preferredCurrency))
    : []
  const pickFrom = (pool: readonly T[]) =>
    (selectedId ? pool.find((a) => a.id === selectedId) : undefined) ||
    pool.find((a) => a.isDefault)
  return (
    pickFrom(preferred) ||
    preferred[0] ||
    pickFrom(accounts) ||
    accounts.find((a) => isCurrency(a, "JMD")) ||
    accounts[0]
  )
}

/**
 * Whether the cashout will settle in JMD: the picked account's currency
 * decides the payout rail, so the preview must follow the same selection
 * (including the user's pick for this cashout) that onNext sends.
 */
export const selectsJmdPayout = (
  accounts: readonly SelectableBankAccount[],
  selectedId?: string | null,
): boolean =>
  pickDefaultBankAccount(accounts, { selectedId })?.currency.toUpperCase() === "JMD"

type SelectableExternalAccount = {
  id: string
  isDefault?: boolean | null
}

/**
 * Bridge (US) withdrawal destination: the user's selection for this
 * withdrawal → the server default → first.
 */
export const pickDefaultExternalAccount = <T extends SelectableExternalAccount>(
  accounts: readonly T[],
  selectedId?: string | null,
): T | undefined =>
  (selectedId ? accounts.find((a) => a.id === selectedId) : undefined) ||
  accounts.find((a) => a.isDefault) ||
  accounts[0]

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
