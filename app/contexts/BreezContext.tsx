import React, { createContext, useEffect, useRef, useState } from "react"
import { WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { Alert, Platform } from "react-native"
import { v4 as uuidv4 } from "uuid"
import {
  initializeBreezSDK,
  getInfo,
  handleSparkMigration,
  registerLightningAddress,
  getLightningAddress,
  checkLightningAddressAvailable,
} from "@app/utils/breez-sdk"
import { useAppConfig } from "@app/hooks/use-app-config"
import { useAddressScreenQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import SparkMigrationModal from "@app/components/spark-migration-modal"

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
  const { appConfig } = useAppConfig()
  const isAuthed = useIsAuthed()
  const { data: meData } = useAddressScreenQuery({
    fetchPolicy: "cache-first",
    skip: !isAuthed,
  })
  const [loading, setLoading] = useState(false)
  const [btcWallet, setBtcWallet] = useState<BtcWallet>({
    id: "",
    walletCurrency: "BTC",
    balance: persistentState.breezBalance || 0,
  })
  const initializingRef = useRef(false)
  const updatingBalanceRef = useRef(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationModal, setMigrationModal] = useState(false)
  const [migrationErr, setMigrationErr] = useState<string | undefined>()

  const onMigrate = async () => {
    setMigrating(true)
    const res = await handleSparkMigration(() => setMigrationModal(true))
    console.log("MIGRATION RESPONSE: ", res)
    if (res.success) {
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            sparkMigrationCompleted: true,
          }
        return undefined
      })
    } else {
      setMigrationErr(res.err)
    }
    setMigrating(false)
  }

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

  const updateBalance = async () => {
    if (updatingBalanceRef.current) return
    updatingBalanceRef.current = true
    try {
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
    } finally {
      updatingBalanceRef.current = false
    }
  }

  const getBreezInfo = async () => {
    if (initializingRef.current) return
    initializingRef.current = true
    try {
      setLoading(true)
      await initializeBreezSDK(appConfig.galoyInstance.lnAddressHostname)
      await updateBalance()
      setLoading(false)

      // Register Lightning address if user has a username
      const username = meData?.me?.username
      if (username) {
        try {
          const available = await checkLightningAddressAvailable(meData.me.username)
          console.log(`Is username ${meData.me.username} available: ${available}`)
          const existing = await getLightningAddress()
          console.log(`Username ${meData.me.username} is registered`)
          if (available && !existing) {
            await registerLightningAddress(username)
          }
        } catch (err) {
          console.warn("Failed to register Lightning address:", err)
        }
      }

      // Trigger migration after Spark SDK is ready
      if (!persistentState.sparkMigrationCompleted) {
        await onMigrate()
        await updateBalance()
      }
    } catch (err: any) {
      Alert.alert("BTC wallet initialization failed", err.toString())
    } finally {
      initializingRef.current = false
    }
  }

  const refreshBreez = async () => {
    if (persistentState.isAdvanceMode) {
      await updateBalance()
    }
  }

  return (
    <BreezContext.Provider value={{ btcWallet, loading, refreshBreez }}>
      {children}
      <SparkMigrationModal
        isVisible={migrationModal}
        loading={migrating}
        err={migrationErr}
        closeModal={() => setMigrationModal(false)}
      />
    </BreezContext.Provider>
  )
}
