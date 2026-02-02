import React, { createContext, useEffect, useState } from "react"
import { WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { initializeBreezSDK, getSparkSdk } from "@app/utils/breez-sdk-spark"
import { initializeBreezSDK as initializeLiquidSDK } from "@app/utils/breez-sdk-spark"
import { GetInfoRequest } from "@breeztech/breez-sdk-spark-react-native"
import { Alert, Platform } from "react-native"

type BtcWallet = {
  id: string
  walletCurrency: WalletCurrency
  balance: number
  pendingReceiveSat: number
  pendingSendSat: number
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
    pendingReceiveSat: 0,
    pendingSendSat: 0,
  },
})

type Props = {
  children: string | JSX.Element | JSX.Element[]
}

export const BreezProvider = ({ children }: Props) => {
  const { persistentState, updateState } = usePersistentStateContext()
  const [loading, setLoading] = useState(false)
  const [btcWallet, setBtcWallet] = useState<BtcWallet>({
    id: "",
    walletCurrency: "BTC",
    balance: persistentState.breezBalance || 0,
    pendingReceiveSat: 0,
    pendingSendSat: 0,
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
          pendingReceiveSat: 0,
          pendingSendSat: 0,
        })
      }
    }
  }, [persistentState.isAdvanceMode])

  const getBreezInfo = async () => {
    try {
      setLoading(true)

      // Primary: Initialize Spark SDK
      await initializeBreezSDK()
      const sparkSdk = getSparkSdk()
      const info = await sparkSdk.getInfo(
        GetInfoRequest.create({ ensureSynced: undefined }),
      )
      const balanceSats = Number(info.balanceSats)

      setBtcWallet({
        id: "spark",
        walletCurrency: WalletCurrency.Btc,
        balance: balanceSats,
        pendingReceiveSat: 0,
        pendingSendSat: 0,
      })
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            breezBalance: balanceSats,
            sparkBalance: balanceSats,
            sparkInitialized: true,
          }
        return undefined
      })

      // Secondary: Also connect Liquid SDK if migration is in progress
      const migrationStatus = persistentState.sparkMigrationStatus
      if (
        persistentState.isAdvanceMode &&
        (migrationStatus === "pending" || migrationStatus === "transferring")
      ) {
        try {
          await initializeLiquidSDK()
        } catch (liquidErr) {
          console.warn("Liquid SDK init for migration failed:", liquidErr)
        }
      }

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
