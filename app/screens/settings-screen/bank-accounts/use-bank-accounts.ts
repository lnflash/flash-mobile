import { useCallback, useEffect, useMemo, useState } from "react"

import { useFeatureFlags } from "@app/config/feature-flags-context"
import {
  useBankAccountsQuery,
  useBridgeExternalAccountsQuery,
  useBridgeKycStatusQuery,
  useBridgeVirtualAccountQuery,
} from "@app/graphql/generated"

import {
  DefaultMap,
  currencyKey,
  loadDefaultWithdrawMap,
  saveDefaultWithdrawAccountId,
} from "./default-account-store"
import { BankAccountStatus, BankAccountVM, WithdrawGroup } from "./types"

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

export type UseBankAccounts = {
  loading: boolean
  kycApproved: boolean
  /** The single Flash receiving (virtual) account, or null when unavailable. */
  receiveAccount: BankAccountVM | null
  /** Withdrawal accounts grouped by currency, default-first within each group. */
  withdrawGroups: WithdrawGroup[]
  /** Set (client-side, interim) the default withdrawal account for its currency. */
  setDefault: (account: BankAccountVM) => void
  refetch: () => void
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

  const [defaults, setDefaults] = useState<DefaultMap>({})

  useEffect(() => {
    let active = true
    ;(async () => {
      const stored = await loadDefaultWithdrawMap()
      if (active && stored) {
        setDefaults(stored)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const setDefault = useCallback(
    (account: BankAccountVM) => {
      const currency = currencyKey(account.currency)
      setDefaults((prev) => {
        const next = { ...prev, [currency]: account.id }
        // fire-and-forget persist; failure is non-fatal (falls back to server/first)
        saveDefaultWithdrawAccountId(account)
        return next
      })
    },
    [setDefaults],
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

    // USD — Bridge external accounts (add/set-default supported)
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
        isDefault: false,
        canSetDefault: true,
        canRemove: false, // TODO: enable once bridgeDeleteExternalAccount ships
      })
    })

    // Local — ERPNext bank accounts (read-only server-side; listed + selectable)
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
        isDefault: false,
        canSetDefault: true, // interim client-side; server has no mutation yet
        canRemove: false,
        serverDefault: bank.isDefault,
        // Prefill + in-review surface for the "update details" flow.
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
      // Resolve default (per currency): client store -> server isDefault -> first
      const storedId = defaults[currencyKey(currency)]
      let defaultIdx = accounts.findIndex((a) => storedId && a.id === storedId)
      if (defaultIdx < 0) {
        defaultIdx = accounts.findIndex((a) => a.serverDefault)
      }
      if (defaultIdx < 0) defaultIdx = 0

      const marked = accounts.map((a, i) => ({ ...a, isDefault: i === defaultIdx }))
      // default-first ordering for a clean read
      marked.sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      groups.push({ currency, accounts: marked })
    }

    // Stable currency ordering: USD first, then alpha
    groups.sort((a, b) => {
      if (a.currency === "USD") return -1
      if (b.currency === "USD") return 1
      return a.currency.localeCompare(b.currency)
    })

    return groups
  }, [externalData, bankData, defaults])

  const loading =
    kycLoading || bankLoading || (kycApproved && (virtualLoading || externalLoading))

  return {
    loading,
    kycApproved,
    receiveAccount,
    withdrawGroups,
    setDefault,
    refetch,
  }
}
