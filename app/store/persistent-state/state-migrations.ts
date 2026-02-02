import jwtDecode from "jwt-decode"

import { GALOY_INSTANCES, GaloyInstance, GaloyInstanceInput } from "@app/config"
import { Network, TransactionFragment, Wallet } from "@app/graphql/generated"
import { loadString } from "@app/utils/storage"
import { SectionTransactions } from "@app/screens/transaction-history/index.types"
import { TagEvent } from "react-native-nfc-manager"

type WalletBalance = Pick<Wallet, "id" | "walletCurrency" | "balance">

type PersistentState_0 = {
  schemaVersion: 0
  isUsdDisabled: boolean
}

type PersistentState_1 = {
  schemaVersion: 1
  isUsdDisabled: boolean
}

type PersistentState_2 = {
  schemaVersion: 2
  hasShownStableSatsWelcome: boolean
  isUsdDisabled: boolean
}

type PersistentState_3 = {
  schemaVersion: 3
  hasShownStableSatsWelcome: boolean
  isUsdDisabled: boolean
  galoyInstance: GaloyInstance
  galoyAuthToken: string
  isAnalyticsEnabled: boolean
}

type PersistentState_4 = {
  schemaVersion: 4
  hasShownStableSatsWelcome: boolean
  isUsdDisabled: boolean
  galoyInstance: GaloyInstance
  galoyAuthToken: string
  isAnalyticsEnabled: boolean
}

type PersistentState_5 = {
  schemaVersion: 5
  galoyInstance: GaloyInstanceInput
  galoyAuthToken: string
}

type PersistentState_6 = {
  schemaVersion: 6
  galoyInstance: GaloyInstanceInput
  galoyAuthToken: string
}

type PersistentState_7 = {
  schemaVersion: 7
  galoyInstance: GaloyInstanceInput
  galoyAuthToken: string
  hasInitializedBreezSDK: boolean
  breezBalance?: number
  balance?: string
  btcBalance?: string
  cashBalance?: string
  btcDisplayBalance?: string
  cashDisplayBalance?: string
  mergedTransactions?: TransactionFragment[]
  btcTransactions?: TransactionFragment[]
  defaultWallet?: WalletBalance
  helpTriggered?: boolean
  isAdvanceMode?: boolean
  chatEnabled?: boolean
  numOfRefundables: number
  backedUpBtcWallet?: boolean // true if user backed up recovery phrase (btc wallet)
  currencyChanged?: boolean
  flashcardAdded?: boolean
  closedQuickStartTypes: string[]
  flashcardTag?: TagEvent
  flashcardHtml?: string
  hasPostedToNostr?: boolean // true if user has made at least one Nostr post
}

type PersistentState_8 = {
  schemaVersion: 8
  galoyInstance: GaloyInstanceInput
  galoyAuthToken: string
  hasInitializedBreezSDK: boolean
  breezBalance?: number
  balance?: string
  btcBalance?: string
  cashBalance?: string
  btcDisplayBalance?: string
  cashDisplayBalance?: string
  mergedTransactions?: TransactionFragment[]
  btcTransactions?: TransactionFragment[]
  defaultWallet?: WalletBalance
  helpTriggered?: boolean
  isAdvanceMode?: boolean
  chatEnabled?: boolean
  numOfRefundables: number
  backedUpBtcWallet?: boolean // true if user backed up recovery phrase (btc wallet)
  currencyChanged?: boolean
  flashcardAdded?: boolean
  closedQuickStartTypes: string[]
  flashcardTag?: TagEvent
  flashcardHtml?: string
  hasPostedToNostr?: boolean // true if user has made at least one Nostr post
  sparkMigrationStatus: "pending" | "transferring" | "completed" | "skipped"
  sparkInitialized: boolean
  sparkBalance: number
}

type JwtPayload = {
  uid: string
  network: Network
}

const decodeToken = (token: string): { uid: string; network: Network } | null => {
  try {
    const { uid, network } = jwtDecode<JwtPayload>(token)
    return { uid, network }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.debug(err.toString())
    }
    return null
  }
}

const migrate8ToCurrent = (state: PersistentState_8): Promise<PersistentState> => {
  return Promise.resolve({
    ...state,
    schemaVersion: 8,
  })
}

const migrate7ToCurrent = (state: PersistentState_7): Promise<PersistentState> => {
  return migrate8ToCurrent({
    ...state,
    schemaVersion: 8,
    sparkMigrationStatus: "pending",
    sparkInitialized: false,
    sparkBalance: 0,
  } as PersistentState_8)
}

const migrate6ToCurrent = (state: PersistentState_6): Promise<PersistentState> => {
  return migrate7ToCurrent({
    ...state,
    schemaVersion: 7,
    hasInitializedBreezSDK: false,
    helpTriggered: false,
    numOfRefundables: 0,
    closedQuickStartTypes: [],
  } as PersistentState_7)
}

const migrate5ToCurrent = (state: PersistentState_5): Promise<PersistentState> => {
  return migrate6ToCurrent({
    ...state,
    schemaVersion: 6,
  })
}

const migrate4ToCurrent = (state: PersistentState_4): Promise<PersistentState> => {
  const newGaloyInstance = GALOY_INSTANCES.find(
    (instance) => instance.name === state.galoyInstance.name,
  )

  if (!newGaloyInstance) {
    if (state.galoyInstance.name === "BBW") {
      const newGaloyInstanceTest = GALOY_INSTANCES.find(
        (instance) => instance.name === "Flash",
      )

      if (!newGaloyInstanceTest) {
        throw new Error("Galoy instance not found")
      }
    }
  }

  let galoyInstance: GaloyInstanceInput

  if (state.galoyInstance.name === "Custom") {
    // we only keep the full object if we are on Custom
    // otherwise data will be stored in GaloyInstancesInput[]
    galoyInstance = { ...state.galoyInstance, id: "Custom" }
  } else if (state.galoyInstance.name === "BBW" || state.galoyInstance.name === "Flash") {
    // we are using "Main" instead of "BBW", so that the bankName is not hardcoded in the saved json
    galoyInstance = { id: "Main" } as const
  } else {
    galoyInstance = { id: state.galoyInstance.name as "Staging" | "Local" }
  }

  return migrate5ToCurrent({
    schemaVersion: 5,
    galoyAuthToken: state.galoyAuthToken,
    galoyInstance,
  })
}

const migrate3ToCurrent = (state: PersistentState_3): Promise<PersistentState> => {
  const newGaloyInstance = GALOY_INSTANCES.find(
    (instance) => instance.name === state.galoyInstance.name,
  )

  if (!newGaloyInstance) {
    throw new Error("Galoy instance not found")
  }

  return migrate4ToCurrent({
    ...state,
    galoyInstance: newGaloyInstance,
    schemaVersion: 4,
  })
}

const migrate2ToCurrent = async (state: PersistentState_2): Promise<PersistentState> => {
  const LEGACY_TOKEN_KEY = "GaloyToken"
  const token = await loadString(LEGACY_TOKEN_KEY)

  if (token && decodeToken(token)) {
    const decodedToken = decodeToken(token)
    const network = decodedToken?.network
    if (network === "mainnet") {
      const galoyInstance = GALOY_INSTANCES.find(
        (instance) => instance.name === "BBW" || instance.name === "Flash",
      )
      if (galoyInstance) {
        return migrate3ToCurrent({
          ...state,
          schemaVersion: 3,
          galoyInstance,
          galoyAuthToken: token,
          isAnalyticsEnabled: true,
        })
      }
    }
  }

  const newGaloyInstance = GALOY_INSTANCES.find(
    (instance) => instance.name === "BBW" || instance.name === "Flash",
  )
  if (!newGaloyInstance) {
    throw new Error("Galoy instance not found")
  }

  return migrate3ToCurrent({
    ...state,
    schemaVersion: 3,
    galoyInstance: newGaloyInstance,
    galoyAuthToken: "",
    isAnalyticsEnabled: true,
  })
}

const migrate1ToCurrent = (state: PersistentState_1): Promise<PersistentState> => {
  return migrate2ToCurrent({
    ...state,
    hasShownStableSatsWelcome: false,
    schemaVersion: 2,
  })
}

const migrate0ToCurrent = (state: PersistentState_0): Promise<PersistentState> => {
  return migrate1ToCurrent({
    schemaVersion: 1,
    isUsdDisabled: state.isUsdDisabled,
  })
}

type StateMigrations = {
  0: (state: PersistentState_0) => Promise<PersistentState>
  1: (state: PersistentState_1) => Promise<PersistentState>
  2: (state: PersistentState_2) => Promise<PersistentState>
  3: (state: PersistentState_3) => Promise<PersistentState>
  4: (state: PersistentState_4) => Promise<PersistentState>
  5: (state: PersistentState_5) => Promise<PersistentState>
  6: (state: PersistentState_6) => Promise<PersistentState>
  7: (state: PersistentState_7) => Promise<PersistentState>
  8: (state: PersistentState_8) => Promise<PersistentState>
}

const stateMigrations: StateMigrations = {
  0: migrate0ToCurrent,
  1: migrate1ToCurrent,
  2: migrate2ToCurrent,
  3: migrate3ToCurrent,
  4: migrate4ToCurrent,
  5: migrate5ToCurrent,
  6: migrate6ToCurrent,
  7: migrate7ToCurrent,
  8: migrate8ToCurrent,
}

export type PersistentState = PersistentState_8

export const defaultPersistentState: PersistentState = {
  schemaVersion: 8,
  galoyInstance: { id: __DEV__ ? "Test" : "Main" },
  galoyAuthToken: "",
  hasInitializedBreezSDK: false,
  helpTriggered: false,
  numOfRefundables: 0,
  closedQuickStartTypes: [],
  sparkMigrationStatus: "pending",
  sparkInitialized: false,
  sparkBalance: 0,
}

export const migrateAndGetPersistentState = async (
  // TODO: pass the correct type.
  // this is especially important given this is migration code and it's hard to test manually
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): Promise<PersistentState> => {
  if (Boolean(data) && data.schemaVersion in stateMigrations) {
    const schemaVersion: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = data.schemaVersion
    try {
      const migration = stateMigrations[schemaVersion]
      const persistentState = await migration(data)
      if (persistentState) {
        return persistentState
      }
    } catch (err) {
      console.error({ err }, "error migrating persistent state")
    }
  }

  return defaultPersistentState
}
