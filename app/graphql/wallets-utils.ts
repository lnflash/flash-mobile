import { Wallet, WalletCurrency } from "@app/graphql/generated"

type WalletBalance = Pick<Wallet, "id" | "walletCurrency" | "balance" | "isExternal">

export const getBtcWallet = (wallets: readonly WalletBalance[] | undefined) => {
  if (wallets === undefined || wallets.length === 0) {
    return undefined
  }

  return wallets.find((wallet) => wallet.walletCurrency === WalletCurrency.Btc)
}

export const getUsdWallet = (wallets: readonly WalletBalance[] | undefined) => {
  if (wallets === undefined || wallets.length === 0) {
    return undefined
  }

  return wallets.find((wallet) => wallet.walletCurrency === WalletCurrency.Usd)
}

export const getDefaultWallet = (
  wallets: readonly WalletBalance[] | undefined,
  defaultWalletId: string | undefined,
) => {
  if (wallets === undefined || wallets.length === 0) {
    return undefined
  }

  return wallets.find((wallet) => wallet.id === defaultWalletId)
}

export const getInternalWallets = (wallets: readonly WalletBalance[] | undefined) => {
  if (wallets === undefined || wallets.length === 0) {
    return undefined
  }

  return wallets.filter((wallet) => !wallet.isExternal)
}
