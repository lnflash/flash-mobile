import { useContext } from "react"
import { FlashcardContext, FlashcardInterface } from "../contexts/Flashcard"

// The context's own interface is the contract. This file used to carry a
// hand-copied shadow of it, which is how #738's `cashuCard` field was added to
// the provider and never became visible to a single screen (ENG-616).
export const useFlashcard = (): FlashcardInterface => useContext(FlashcardContext)
