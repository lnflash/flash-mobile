import React, { createContext, useEffect, useState } from "react"
import { WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { initializeBreezSDK, getInfo } from "@app/utils/breez-sdk"
import { Alert, Platform } from "react-native"
import { v4 as uuidv4 } from "uuid"

type BtcWallet = {
  id: string
  walletCurrency: WalletCurrency
  balance: number
}

interface BreezInterface {
  refreshBreez: () => void
  loading: boolean
  btcWallet: BtcWallet
}

export const BreezContext = createContext<BreezInterface>({
  refreshBreez: () => {},
  loading: false,
  btcWallet: {
    id: "",
    walletCurrency: "BTC",
    balance: 0,
  },
})

type Props = {
  children: React.ReactNode
}

export const BreezProvider = ({ children }: Props) => {
  const { persistentState, updateState } = usePersistentStateContext()
  const [loading, setLoading] = useState(false)
  const [btcWallet, setBtcWallet] = useState<BtcWallet>({
    id: "",
    walletCurrency: "BTC",
    balance: persistentState.breezBalance || 0,
  })

  useEffect(() => {
    if (Platform.OS === "ios" && Number(Platform.Version) < 13) {
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            isAdvanceMode: false,
          }
        return undefined
      })
    } else {
      if (persistentState.isAdvanceMode) {
        getBreezInfo()
      } else {
        setBtcWallet({
          id: "",
          walletCurrency: "BTC",
          balance: 0,
        })
      }
    }
  }, [persistentState.isAdvanceMode])

  const getBreezInfo = async () => {
    try {
      setLoading(true)
      await initializeBreezSDK()
      const balanceSats = await getInfo()

      setBtcWallet({
        id: uuidv4(),
        walletCurrency: WalletCurrency.Btc,
        balance: balanceSats,
      })
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            breezBalance: balanceSats,
          }
        return undefined
      })
      setLoading(false)
    } catch (err: any) {
      Alert.alert("BTC wallet initialization failed", err.toString())
    }
  }

  const refreshBreez = () => {
    if (persistentState.isAdvanceMode) getBreezInfo()
  }

  return (
    <BreezContext.Provider value={{ btcWallet, loading, refreshBreez }}>
      {children}
    </BreezContext.Provider>
  )
}
