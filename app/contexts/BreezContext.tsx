import React, { createContext, useEffect, useRef, useState } from "react"
import { useUpdateExternalWalletMutation, WalletCurrency } from "@app/graphql/generated"
import { usePersistentStateContext } from "@app/store/persistent-state"
import { Alert, Platform } from "react-native"
import { v4 as uuidv4 } from "uuid"
import {
  initializeBreezSDK,
  getInfo,
  handleSparkMigration,
  registerLightningAddress,
  getLightningAddress,
} from "@app/utils/breez-sdk"
import { useAppConfig } from "@app/hooks/use-app-config"
import { useAddressScreenQuery } from "@app/graphql/generated"
import { useIsAuthed } from "@app/graphql/is-authed-context"
import SparkMigrationModal from "@app/components/spark-migration-modal"

type BtcWallet = {
  id: string
  walletCurrency: WalletCurrency
  balance: number
  isExternal: boolean
}

interface BreezInterface {
  refreshBreez: () => void
  retryExternalWalletRegistration: () => Promise<void>
  loading: boolean
  externalWalletLoading: boolean
  externalWalletError?: string
  btcWallet: BtcWallet
}

export const BreezContext = createContext<BreezInterface>({
  refreshBreez: () => {},
  retryExternalWalletRegistration: async () => {},
  loading: false,
  externalWalletLoading: false,
  externalWalletError: undefined,
  btcWallet: {
    id: "",
    walletCurrency: "BTC",
    balance: 0,
    isExternal: true,
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
  const [updateExternalWallet] = useUpdateExternalWalletMutation()

  const [loading, setLoading] = useState(false)
  const [btcWallet, setBtcWallet] = useState<BtcWallet>({
    id: "",
    walletCurrency: "BTC",
    balance: persistentState.breezBalance || 0,
    isExternal: true,
  })
  const initializingRef = useRef(false)
  const updatingBalanceRef = useRef(false)
  const registeringExternalWalletRef = useRef(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationModal, setMigrationModal] = useState(false)
  const [migrationErr, setMigrationErr] = useState<string | undefined>()
  const [externalWalletLoading, setExternalWalletLoading] = useState(false)
  const [externalWalletError, setExternalWalletError] = useState<string | undefined>()
  const [breezReady, setBreezReady] = useState(false)

  const onMigrate = async () => {
    setMigrating(true)
    const res = await handleSparkMigration(() => setMigrationModal(true))
    if (res.success) {
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            sparkMigrationCompleted: true,
          }
        return undefined
      })
      if (res.err?.includes("Fee reimbursement failed")) {
        setMigrationErr(res.err)
      }
    } else if (res.err) {
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
          isExternal: true,
        })
        setExternalWalletError(undefined)
      }
    }
  }, [persistentState.isAdvanceMode])

  const updateBalance = async () => {
    if (updatingBalanceRef.current) return
    updatingBalanceRef.current = true
    try {
      const walletInfo = await getInfo()
      setBtcWallet((prev) => ({
        ...prev,
        balance: Number(walletInfo.balanceSats),
      }))
      updateState((state: any) => {
        if (state)
          return {
            ...state,
            breezBalance: Number(walletInfo.balanceSats),
          }
        return undefined
      })
    } finally {
      updatingBalanceRef.current = false
    }
  }

  const updateExternalWalletLnurlp = async (lnurlp: string) => {
    const externalWalletRes = await updateExternalWallet({
      variables: { input: { lnurlp } },
    })
    console.log("Update External Wallet Response: ", externalWalletRes)
    const errors = externalWalletRes.data?.updateExternalWallet.errors
    if (errors?.length) {
      throw new Error(errors.map((error) => error.message).join(", "))
    }

    const walletId = externalWalletRes.data?.updateExternalWallet.walletId
    if (walletId) {
      setBtcWallet((prev) => ({
        ...prev,
        id: walletId,
      }))
    }

    return walletId
  }

  const ensureLightningAddress = async () => {
    const username = meData?.me?.username
    if (registeringExternalWalletRef.current || btcWallet.id) return
    if (!username) return

    registeringExternalWalletRef.current = true
    setExternalWalletLoading(true)
    setExternalWalletError(undefined)

    try {
      const existing = await getLightningAddress()
      console.log("BREEZ LIGHTNING ADDRESS: ", existing)

      if (existing) {
        const walletId = await updateExternalWalletLnurlp(existing.lnurl.bech32)
        if (!walletId) {
          throw new Error("External wallet registration returned no wallet id")
        }
        return
      }

      // Register with username as the Lightning address
      const lightningAddress = username + uuidv4()
      const res = await registerLightningAddress(
        lightningAddress,
        `Pay to ${username}@${appConfig.galoyInstance.lnAddressHostname}`,
      )
      console.log("BREEZ LIGHTNING ADDRESS RES: ", res)

      if (res) {
        const walletId = await updateExternalWalletLnurlp(res.lnurl.bech32)
        if (!walletId) {
          throw new Error("External wallet registration returned no wallet id")
        }
        return
      }

      throw new Error("Breez lightning address registration returned no address")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setExternalWalletError(message)
      console.warn("Failed to register Lightning address:", message)
    } finally {
      setExternalWalletLoading(false)
      registeringExternalWalletRef.current = false
    }
  }

  useEffect(() => {
    if (Platform.OS === "ios" && Number(Platform.Version) < 13) return
    if (!persistentState.isAdvanceMode) return
    if (!breezReady) return
    if (!meData?.me?.username) return
    if (btcWallet.id) return

    ensureLightningAddress()
  }, [persistentState.isAdvanceMode, breezReady, meData?.me?.username, btcWallet.id])

  const getBreezInfo = async () => {
    if (initializingRef.current) return
    initializingRef.current = true
    try {
      setLoading(true)
      await initializeBreezSDK()
      setBreezReady(true)
      await updateBalance()
      setLoading(false)

      // Register Lightning address
      await ensureLightningAddress()

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
    <BreezContext.Provider
      value={{
        btcWallet,
        loading,
        externalWalletLoading,
        externalWalletError,
        refreshBreez,
        retryExternalWalletRegistration: ensureLightningAddress,
      }}
    >
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
