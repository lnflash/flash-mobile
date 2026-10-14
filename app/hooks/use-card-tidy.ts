import { useCallback, useState } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { v4 as uuidv4 } from "uuid"

import type { CashuCardState } from "@app/contexts/Flashcard"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { tidyOfferDismissed } from "@app/store/redux/slices/flashcardV2Slice"
import { verifyCardPin } from "@app/utils/cashu-card"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import { ownerKeyFor } from "@app/utils/cashu-card-owner-store"
import {
  TidyDeps,
  TidyOffer,
  TidyRecord,
  TidyResult,
  TopUpError,
  reclaimVerdicts,
  runTidy,
  showsTidyOffer,
  tidyKeyset,
  tidyOwed,
  unfinishedTidies,
} from "@app/utils/cashu-card-topup"
import { topUpMint, topUpStore } from "@app/utils/cashu-card-topup/connected"

import { useFlashcard } from "./useFlashcard"

type TidyCard = Pick<
  CashuCardState,
  | "pubkey"
  | "maxSlots"
  | "pinState"
  | "sealed"
  | "spentSlots"
  | "unspentSlots"
  | "tidyOffer"
>

/**
 * The card tidy (ENG-702) on the card screen: the offer the read made, unless
 * "Not now" was said to these same pieces; the card's tidies still owed; and
 * the tap that tidies (or finishes one), through `runCardOperation`.
 *
 * Everything the mint is asked before the tidy plans is asked before the tap
 * (the keyset's fee, the spent slots' verdicts), and the owner key is found
 * before it too. The tap itself swaps at the mint once the card has signed:
 * the change is the card's own, so it must reach the mint and come back in
 * the same tap, as Android's raised transceive timeout allows
 * (`runCardOperation` raises it).
 */
export const useCardTidy = (card: TidyCard | undefined) => {
  const { runCardOperation } = useFlashcard()
  const dispatch = useAppDispatch()
  const dismissed = useAppSelector((state) =>
    card ? state.flashcardV2.tidyDismissed?.[card.pubkey] : undefined,
  )
  const [records, setRecords] = useState<TidyRecord[]>([])
  const pubkey = card?.pubkey

  const list = useCallback(async () => {
    if (!pubkey) return
    try {
      setRecords(await unfinishedTidies({ store: topUpStore }, pubkey))
    } catch {
      setRecords([])
    }
  }, [pubkey])

  useFocusEffect(
    useCallback(() => {
      list()
    }, [list]),
  )

  // Only a tidy still owed holds the offer back, as the read's own
  // `tidyOfferForRead` decides: one kept for a human (`needs-card`) does not.
  const offer: TidyOffer | undefined =
    !records.some(tidyOwed) && showsTidyOffer(card?.tidyOffer, dismissed)
      ? card?.tidyOffer
      : undefined

  /** "Not now": hidden until the card's pieces change. */
  const notNow = useCallback(() => {
    if (card?.tidyOffer) {
      dispatch(
        tidyOfferDismissed({
          pubkey: card.pubkey,
          fingerprint: card.tidyOffer.fingerprint,
        }),
      )
    }
  }, [card, dispatch])

  /**
   * "Dismiss" on a tidy kept for a human (`needs-card`): moved to the tidy
   * archive, signature and all, for support; off the card screen.
   */
  const dismiss = useCallback(
    async (record: TidyRecord) => {
      try {
        await topUpStore.tidies.archive(record.id)
      } finally {
        await list()
      }
    },
    [list],
  )

  /**
   * One tap: a new tidy, or the card's tidy still owed finished. `pin` is the
   * PIN this screen asked for (Decision 1), verified in the tap before
   * SPEND_ALL_BEGIN; the change is loaded under the owner's grant.
   */
  const tidy = useCallback(
    async (pin?: string): Promise<TidyResult> => {
      if (!card) throw new TopUpError("state", "no card to tidy")
      const mint = topUpMint()
      const deps: TidyDeps = { mint, store: topUpStore, now: Date.now, newId: uuidv4 }
      const keysetId = card.unspentSlots && tidyKeyset(card.unspentSlots)
      const feePpk = keysetId ? await mint.feePpk(keysetId) : 0
      const verdicts = card.spentSlots?.length
        ? await reclaimVerdicts(deps, card.pubkey, card.spentSlots).catch(() => undefined)
        : new Map()
      const owner = await ownerKeyFor(card.pubkey).catch(() => undefined)
      // With neither the owner's key nor the PIN, a card with a PIN takes no
      // load: refused here, before the tap, not after SIGN has burned the
      // pieces whose change this phone could then not put back.
      if (!owner && !pin && card.pinState !== "unset") {
        throw new TopUpError("not-owner", "the card wants its PIN to load")
      }
      try {
        return await runCardOperation(
          (transceive) =>
            runTidy(deps, {
              transceive,
              card: { pubkey: card.pubkey, maxSlots: card.maxSlots },
              feePpk,
              verifyPin: pin
                ? (t) =>
                    verifyCardPin(t, pin, {
                      sealed: card.sealed,
                      cardPubkey: card.pubkey,
                    })
                : undefined,
              openForLoading: async (t) => {
                if (owner) {
                  await allowLoad(t, ownerSigner(owner.privateKey))
                } else if (!pin && card.pinState !== "unset") {
                  // A backstop: refused before the tap above.
                  throw new TopUpError("not-owner", "the card wants its PIN to load")
                }
              },
              verdicts,
            }),
          card.pubkey,
          { rereadSlots: true },
        )
      } finally {
        list()
      }
    },
    [card, runCardOperation, list],
  )

  return { offer, records, notNow, tidy, dismiss }
}
