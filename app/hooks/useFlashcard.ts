import { useContext } from "react"
import { TagEvent } from "react-native-nfc-manager"
import { FlashcardContext } from "../contexts/Flashcard"

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
  resetFlashcard: () => void
  readFlashcard: (isPayment?: boolean) => void
}

export const useFlashcard = () => {
  const context: ContextProps = useContext(FlashcardContext)
  return context
}
