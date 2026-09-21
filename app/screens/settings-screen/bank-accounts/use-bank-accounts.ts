import { useCallback, useMemo, useState } from "react"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import {
  useBankAccountDeleteMutation,
  useBankAccountSetDefaultMutation,
  useBankAccountsQuery,
  useBridgeDeleteExternalAccountMutation,
  useBridgeExternalAccountsQuery,
  useBridgeKycStatusQuery,
  useBridgeSetDefaultExternalAccountMutation,
  useBridgeVirtualAccountQuery,
} from "@app/graphql/generated"

import { BankAccountStatus, BankAccountVM, WithdrawGroup } from "./types"

const currencyKey = (currency?: string | null) => (currency ?? "").toUpperCase()

const normalizeStatus = (raw?: string | null): BankAccountStatus => {
  const s = (raw ?? "").toLowerCase()
  if (["active", "approved", "verified", "complete", "completed"].includes(s)) {
    return "verified"
  }
  if (["pending", "processing", "in_review", "under_review"].includes(s)) {
    return "pending"
  }
  if (["action_required", "rejected", "failed", "error"].includes(s)) {
    return "actionRequired"
  }
  return raw ? "unknown" : "verified"
}

const last4Of = (value?: string | null): string => {
  if (!value) return "----"
  return String(value).slice(-4)
}

export type BankAccountActionResult =
  | { ok: true }
  // `code` is the server error code when the payload carried one (see
  // bank-account-errors.ts for the user-facing mapping).
  | { ok: false; code?: string; message?: string }

export type BankAccountActionState = {
  loading: boolean
  /** Key of the account the action is (or was last) running against. */
  accountKey?: string
  /** Failure of the last run; cleared when the action starts again. */
  error?: { code?: string; message?: string }
}

export type UseBankAccounts = {
  loading: boolean
  kycApproved: boolean
  /** The single Flash receiving (virtual) account, or null when unavailable. */
  receiveAccount: BankAccountVM | null
  /** Withdrawal accounts grouped by currency, default-first within each group. */
  withdrawGroups: WithdrawGroup[]
  /** Make the account the server-side default for its rail, then refetch. */
  setDefault: (account: BankAccountVM) => Promise<BankAccountActionResult>
  /** Delete the account server-side, then refetch. */
  remove: (account: BankAccountVM) => Promise<BankAccountActionResult>
  setDefaultState: BankAccountActionState
  removeState: BankAccountActionState
  refetch: () => void
}

type PayloadError = { code?: string | null; message?: string | null }

const toResult = (
  errors: readonly (PayloadError | null)[] | null | undefined,
  succeeded: boolean,
): BankAccountActionResult => {
  const first = errors?.find(Boolean)
  if (first) {
    return {
      ok: false,
      code: first.code ?? undefined,
      message: first.message ?? undefined,
    }
  }
  return succeeded ? { ok: true } : { ok: false }
}

export const useBankAccounts = (): UseBankAccounts => {
  // ENG-465 kill switch: when Bridge is remotely disabled, skip every Bridge
  // query (KYC, virtual account, external accounts) — same contract as
  // AccountType and TopupCashout. Local ERPNext accounts still load.
  const { bridgeTopupEnabled } = useFeatureFlags()

  const { data: kycData, loading: kycLoading } = useBridgeKycStatusQuery({
    fetchPolicy: "cache-and-network",
    skip: !bridgeTopupEnabled,
  })
  const kycApproved = bridgeTopupEnabled && kycData?.bridgeKycStatus === "approved"

  const { data: virtualData, loading: virtualLoading } = useBridgeVirtualAccountQuery({
    fetchPolicy: "cache-and-network",
    skip: !kycApproved,
  })

  const {
    data: externalData,
    loading: externalLoading,
    refetch: refetchExternal,
  } = useBridgeExternalAccountsQuery({
    fetchPolicy: "cache-and-network",
    skip: !kycApproved,
  })

  const {
    data: bankData,
    loading: bankLoading,
    refetch: refetchBank,
  } = useBankAccountsQuery({ fetchPolicy: "cache-and-network" })

  // The server owns the default (ERPNext `isDefault`, Bridge `isDefault`) and
  // the account list. After every successful mutation the matching list query
  // is refetched and awaited, so the hub, the cash-out picker and any other
  // watcher of BankAccounts / BridgeExternalAccounts read fresh data from the
  // shared cache.
  const [bankAccountSetDefault] = useBankAccountSetDefaultMutation()
  const [bankAccountDelete] = useBankAccountDeleteMutation()
  const [bridgeSetDefault] = useBridgeSetDefaultExternalAccountMutation()
  const [bridgeDelete] = useBridgeDeleteExternalAccountMutation()

  const [setDefaultState, setSetDefaultState] = useState<BankAccountActionState>({
    loading: false,
  })
  const [removeState, setRemoveState] = useState<BankAccountActionState>({
    loading: false,
  })

  const runAction = useCallback(
    async (
      account: BankAccountVM,
      setState: (state: BankAccountActionState) => void,
      action: () => Promise<BankAccountActionResult>,
    ): Promise<BankAccountActionResult> => {
      setState({ loading: true, accountKey: account.key })
      let result: BankAccountActionResult
      try {
        result = await action()
      } catch (err) {
        result = { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
      if (result.ok) {
        // Best effort: the change IS applied server-side, so a failed refetch
        // must never be reported as a failed action.
        try {
          await (account.source === "erpnext" ? refetchBank() : refetchExternal())
        } catch {
          // The hub refetches on focus.
        }
      }
      setState({
        loading: false,
        accountKey: account.key,
        error: result.ok ? undefined : { code: result.code, message: result.message },
      })
      return result
    },
    [refetchBank, refetchExternal],
  )

  const setDefault = useCallback(
    (account: BankAccountVM) =>
      runAction(account, setSetDefaultState, async () => {
        if (account.source === "erpnext") {
          const res = await bankAccountSetDefault({
            variables: { input: { bankAccountId: account.id } },
          })
          const payload = res.data?.bankAccountSetDefault
          return toResult(payload?.errors, Boolean(payload?.bankAccount))
        }
        if (account.source === "bridge-external") {
          const res = await bridgeSetDefault({
            variables: { input: { externalAccountId: account.id } },
          })
          const payload = res.data?.bridgeSetDefaultExternalAccount
          return toResult(payload?.errors, Boolean(payload?.externalAccount))
        }
        return { ok: false }
      }),
    [runAction, bankAccountSetDefault, bridgeSetDefault],
  )

  const remove = useCallback(
    (account: BankAccountVM) =>
      runAction(account, setRemoveState, async () => {
        if (account.source === "erpnext") {
          const res = await bankAccountDelete({
            variables: { input: { bankAccountId: account.id } },
          })
          const payload = res.data?.bankAccountDelete
          return toResult(payload?.errors, Boolean(payload?.success))
        }
        if (account.source === "bridge-external") {
          const res = await bridgeDelete({
            variables: { input: { externalAccountId: account.id } },
          })
          const payload = res.data?.bridgeDeleteExternalAccount
          // No errors is success: the payload's externalAccount is the deleted
          // record and may legitimately come back null.
          return toResult(payload?.errors, Boolean(payload))
        }
        return { ok: false }
      }),
    [runAction, bankAccountDelete, bridgeDelete],
  )

  const refetch = useCallback(() => {
    refetchExternal?.()
    refetchBank?.()
  }, [refetchExternal, refetchBank])

  const receiveAccount = useMemo<BankAccountVM | null>(() => {
    const va = virtualData?.bridgeVirtualAccount
    if (!va) return null
    return {
      key: `receive-${va.id ?? "flash"}`,
      id: va.id ?? "flash-virtual",
      source: "bridge-virtual",
      role: "receive",
      bankName: va.bankName ?? "Flash",
      last4: last4Of(va.accountNumberLast4 ?? va.accountNumber),
      currency: "USD",
      status: va.pending ? "pending" : "verified",
      isDefault: false,
      canSetDefault: false,
      canRemove: false,
      accountNumber: va.accountNumber,
      routingNumber: va.routingNumber,
      pending: Boolean(va.pending),
    }
  }, [virtualData])

  const withdrawGroups = useMemo<WithdrawGroup[]>(() => {
    const all: BankAccountVM[] = []

    // USD — Bridge external accounts (add / set-default / remove; no edit API)
    ;(externalData?.bridgeExternalAccounts ?? []).forEach((ext) => {
      if (!ext) return
      all.push({
        key: `bridge-${ext.id}`,
        id: ext.id,
        source: "bridge-external",
        role: "withdraw",
        bankName: ext.bankName,
        last4: last4Of(ext.accountNumberLast4),
        currency: "USD",
        status: normalizeStatus(ext.status),
        isDefault: Boolean(ext.isDefault),
        canSetDefault: true,
        canRemove: true,
      })
    })

    // Local — ERPNext bank accounts (add / edit / set-default / remove)
    ;(bankData?.me?.bankAccounts ?? []).forEach((bank) => {
      if (!bank?.id) return
      all.push({
        key: `erpnext-${bank.id}`,
        id: bank.id,
        source: "erpnext",
        role: "withdraw",
        bankName: bank.bankName,
        last4: last4Of(bank.accountNumber),
        currency: currencyKey(bank.currency) || "LOCAL",
        status: bank.pendingUpdate
          ? normalizeStatus(bank.pendingUpdate.status)
          : "verified",
        isDefault: Boolean(bank.isDefault),
        canSetDefault: true,
        canRemove: true,
        // Prefill for the edit screen (+ a legacy in-review change, if any).
        accountNumber: bank.accountNumber,
        bankBranch: bank.bankBranch,
        accountType: bank.accountType,
        currencyRaw: bank.currency,
        pendingUpdate: bank.pendingUpdate ?? null,
      })
    })

    // Group by currency
    const byCurrency = new Map<string, BankAccountVM[]>()
    for (const acc of all) {
      const list = byCurrency.get(acc.currency) ?? []
      list.push(acc)
      byCurrency.set(acc.currency, list)
    }

    const groups: WithdrawGroup[] = []
    for (const [currency, accounts] of byCurrency.entries()) {
      // default-first ordering for a clean read (sort is stable)
      const marked = [...accounts].sort(
        (a, b) => Number(b.isDefault) - Number(a.isDefault),
      )
      groups.push({ currency, accounts: marked })
    }

    // Stable currency ordering: USD first, then alpha
    groups.sort((a, b) => {
      if (a.currency === "USD") return -1
      if (b.currency === "USD") return 1
      return a.currency.localeCompare(b.currency)
    })

    return groups
  }, [externalData, bankData])

  const loading =
    kycLoading || bankLoading || (kycApproved && (virtualLoading || externalLoading))

  return {
    loading,
    kycApproved,
    receiveAccount,
    withdrawGroups,
    setDefault,
    remove,
    setDefaultState,
    removeState,
    refetch,
  }
}
