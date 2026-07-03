import { loadJson, saveJson } from "@app/utils/storage"

import { BankAccountVM } from "./types"

/**
 * INTERIM client-side default store (per currency).
 *
 * The Bridge external-account API has no `isDefault` field or set-default
 * mutation yet. Until that lands (see PR plan), we persist the user's chosen
 * default withdrawal account per currency in AsyncStorage. This is deliberately
 * isolated from the versioned persistentState blob so the migration chain stays
 * untouched and the swap to a server field is a one-file change.
 *
 * Kept free of React/context imports so the cash-out flow can read the stored
 * default without pulling the settings hook (and its feature-flag/Firebase
 * dependencies) into its module graph.
 *
 * currency (upper-case) -> account id
 */
export const DEFAULT_WITHDRAW_STORE_KEY = "bankAccounts.defaultWithdraw.v1"
export type DefaultMap = Record<string, string>

export const currencyKey = (currency?: string | null) => (currency ?? "").toUpperCase()

export const loadDefaultWithdrawMap = async (): Promise<DefaultMap | null> => {
  const stored = (await loadJson(DEFAULT_WITHDRAW_STORE_KEY)) as DefaultMap | null
  if (!stored || typeof stored !== "object") return null
  return stored
}

export const loadDefaultWithdrawAccountId = async (
  currency?: string | null,
): Promise<string | undefined> => {
  const key = currencyKey(currency)
  if (!key) return undefined
  const stored = await loadDefaultWithdrawMap()
  return stored?.[key]
}

export const saveDefaultWithdrawAccountId = async (
  account: Pick<BankAccountVM, "currency" | "id">,
): Promise<boolean> => {
  const key = currencyKey(account.currency)
  if (!key) return false
  const current = (await loadDefaultWithdrawMap()) ?? {}
  return saveJson(DEFAULT_WITHDRAW_STORE_KEY, { ...current, [key]: account.id })
}
