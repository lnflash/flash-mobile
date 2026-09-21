import {
  useBankAccountsQuery,
  useBridgeExternalAccountsQuery,
} from "@app/graphql/generated"
import {
  pickDefaultBankAccount,
  pickDefaultExternalAccount,
} from "@app/screens/topup-cashout-flow/cashout-estimate"
import { displayCurrencyCode } from "@app/utils/currency-display"

export type CashoutAccountSource = "local" | "bridge"

export type CashoutAccountOption = {
  id: string
  bankName: string
  last4: string
  currency: string
  isDefault: boolean
}

type Params = {
  source: CashoutAccountSource
  selectedAccountId?: string
  preferredCurrency?: string
}

export const last4Of = (value: string) => String(value).slice(-4)

// One read of the cash-out accounts for both the "Withdraw to" card and its
// picker sheet, so the two can never disagree on the list or the current pick.
export const useCashoutAccounts = ({
  source,
  selectedAccountId,
  preferredCurrency,
}: Params) => {
  const isBridge = source === "bridge"

  // cache-first: the cash-out screen's own query (or a Settings mutation's
  // refetch) fills the cache, and a cold cache still loads from the network.
  const { data: bankData } = useBankAccountsQuery({
    fetchPolicy: "cache-first",
    skip: isBridge,
  })
  const { data: externalData } = useBridgeExternalAccountsQuery({
    fetchPolicy: "cache-first",
    skip: !isBridge,
  })

  const bankAccounts = bankData?.me?.bankAccounts ?? []
  const externalAccounts =
    externalData?.bridgeExternalAccounts?.flatMap((account) =>
      account ? [account] : [],
    ) ?? []

  // Same selection functions the cash-out screen sends with — never re-derive.
  const bankAccount = isBridge
    ? undefined
    : pickDefaultBankAccount(bankAccounts, {
        selectedId: selectedAccountId,
        preferredCurrency,
      })
  const externalAccount = isBridge
    ? pickDefaultExternalAccount(externalAccounts, selectedAccountId)
    : undefined

  const options: CashoutAccountOption[] = isBridge
    ? externalAccounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        last4: last4Of(account.accountNumberLast4),
        currency: "USD",
        isDefault: account.isDefault,
      }))
    : bankAccounts.flatMap((account) =>
        account.id
          ? [
              {
                id: account.id,
                bankName: account.bankName,
                last4: last4Of(account.accountNumber),
                currency: displayCurrencyCode(account.currency),
                isDefault: account.isDefault,
              },
            ]
          : [],
      )

  return {
    isBridge,
    bankAccount,
    externalAccount,
    currentId: (bankAccount ?? externalAccount)?.id ?? undefined,
    options,
  }
}
