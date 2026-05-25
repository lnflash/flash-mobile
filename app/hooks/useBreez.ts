import { useContext } from "react"
import { BreezContext } from "@app/contexts/BreezContext"
import { WalletCurrency } from "@app/graphql/generated"

type BtcWallet = {
  id: string
  walletCurrency: WalletCurrency
  balance: number
  isExternal: boolean
}

interface ContextProps {
  btcWallet: BtcWallet
  loading: boolean
  externalWalletLoading: boolean
  externalWalletError?: string
  refreshBreez: () => void
  retryExternalWalletRegistration: () => Promise<void>
}

export const useBreez = () => {
  const context: ContextProps = useContext(BreezContext)
  return context
}
