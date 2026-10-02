import { useAppSelector } from "@app/store/redux"
import type { KnownCard } from "@app/store/redux/slices/flashcardV2Slice"

/** The card read most recently, from the cards this phone remembers. */
export const latestKnownCard = (
  cards: Record<string, KnownCard>,
): KnownCard | undefined => {
  let latest: KnownCard | undefined
  Object.values(cards).forEach((card) => {
    if (!latest || card.lastSeenAt > latest.lastSeenAt) latest = card
  })
  return latest
}

/**
 * The Cashu card this phone read last (ENG-616), from `flashcardV2`: only a
 * signed-in read writes it, Remove card drops it, and logout clears them all.
 * Undefined when the phone remembers none.
 */
export const useKnownCashuCard = (): KnownCard | undefined =>
  useAppSelector((state) => latestKnownCard(state.flashcardV2.cards))
