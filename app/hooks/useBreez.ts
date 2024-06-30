import { useState, useEffect } from "react"
import { nodeInfo } from "@breeztech/react-native-breez-sdk"
import { initializeBreezSDK } from "@app/utils/breez-sdk"

// hooks
import { WalletCurrency } from "@app/graphql/generated"
import { useAppSelector } from "@app/store/redux"

type BtcWallet = {
  id: string
  walletCurrency: WalletCurrency
  balance: number
}

export const useBreez = (): { btcWallet: BtcWallet | undefined; loading: boolean } => {
  const { isAdvanceMode } = useAppSelector((state) => state.settings)
  const [loading, setLoading] = useState(false)
  const [btcWallet, setBtcWallet] = useState<BtcWallet>()

  useEffect(() => {
    if (isAdvanceMode) getBreezInfo()
  }, [isAdvanceMode])

  const getBreezInfo = async () => {
    setLoading(true)
    await initializeBreezSDK()
    const nodeState = await nodeInfo()

    setBtcWallet({
      id: nodeState.id,
      walletCurrency: WalletCurrency.Btc,
      balance: nodeState.channelsBalanceMsat / 1000,
    })
    setLoading(false)
  }

  return { btcWallet, loading }
}
