import { useContext } from "react"
import { TagEvent } from "react-native-nfc-manager"
import { FlashcardContext } from "../contexts/Flashcard"
import { BoltcardSettings, BoltcardSettingsUpdate, PinStatus } from "../utils/boltcard-api"

type TransactionItem = {
  date: string
  sats: string
}

interface ContextProps {
  tag?: TagEvent
  k1?: string
  callback?: string
  lnurl?: string
  balanceInSats?: number
  transactions?: TransactionItem[]
  loading?: boolean
  error?: string
  // Boltcard settings
  cardId?: string
  storeId?: string
  apiBaseUrl?: string
  settings?: BoltcardSettings
  pinStatus?: PinStatus
  settingsLoading?: boolean
  settingsError?: string
  // Methods
  resetFlashcard: () => void
  readFlashcard: (isPayment?: boolean) => void
  fetchSettings: () => Promise<void>
  updateCardSettings: (settings: BoltcardSettingsUpdate) => Promise<boolean>
  setCardPin: (pin: string) => Promise<boolean>
  removeCardPin: () => Promise<boolean>
  fetchPinStatus: () => Promise<void>
  unlockCard: () => Promise<boolean>
  verifyCardOwnership: () => Promise<boolean>
}

export const useFlashcard = () => {
  const context: ContextProps = useContext(FlashcardContext)
  return context
}
