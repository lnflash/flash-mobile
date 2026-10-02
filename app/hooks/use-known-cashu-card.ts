import { useAppSelector } from "@app/store/redux"
import type {
  FlashcardV2Slice,
  KnownCard,
} from "@app/store/redux/slices/flashcardV2Slice"

/** The card attached to the app, from the cards this phone remembers. */
export const attachedCard = (slice: FlashcardV2Slice): KnownCard | undefined =>
  slice.attachedPubkey ? slice.cards[slice.attachedPubkey] : undefined

/**
 * The Cashu card attached to the app (ENG-616): the one this phone read last
 * while signed in, until Remove card detaches it. Logout forgets every card.
 * Undefined when no card is attached.
 */
export const useKnownCashuCard = (): KnownCard | undefined =>
  useAppSelector((state) => attachedCard(state.flashcardV2))
