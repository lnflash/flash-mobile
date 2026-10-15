import { useCallback, useState } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { v4 as uuidv4 } from "uuid"

import type { CashuCardState } from "@app/contexts/Flashcard"
import { useI18nContext } from "@app/i18n/i18n-react"
import { useAppDispatch, useAppSelector } from "@app/store/redux"
import { tidyOfferDismissed } from "@app/store/redux/slices/flashcardV2Slice"
import { verifyCardPin } from "@app/utils/cashu-card"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import { ownerKeyFor } from "@app/utils/cashu-card-owner-store"
import {
  TidyDeps,
  TidyOffer,
  TidyProgress,
  TidyRecord,
  TidyResult,
  TopUpError,
  owedTidy,
  reclaimVerdicts,
  runTidy,
  showsTidyOffer,
  tidyKeyset,
  tidyOwed,
  unfinishedTidies,
} from "@app/utils/cashu-card-topup"
import { topUpMint, topUpStore } from "@app/utils/cashu-card-topup/connected"

import { nudgeTopUpMinter } from "./use-card-top-up"
import { useFlashcard } from "./useFlashcard"

type LLType = ReturnType<typeof useI18nContext>["LL"]

/** Where a tap's tidy has got to, in the owner's words (ENG-706). */
export const tidyProgressText = (progress: TidyProgress, LL: LLType): string => {
  switch (progress.stage) {
    case "reading":
      return LL.FlashcardV2.tidyProgressReading()
    case "making":
      return LL.FlashcardV2.tidyProgressMaking({
        done: progress.done,
        total: progress.total,
      })
    case "mint":
      return LL.FlashcardV2.tidyProgressMint()
    case "loading":
      return LL.FlashcardV2.tidyProgressLoading({
        done: progress.done,
        total: progress.total,
      })
    case "done":
      return LL.FlashcardV2.tidyProgressDone()
  }
}

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
 *
 * While the tap runs, `progress` says where its tidy has got to (ENG-706),
 * and the same words, with "Keep holding the card", go to the NFC sheet.
 */
export const useCardTidy = (card: TidyCard | undefined) => {
  const { LL } = useI18nContext()
  const { runCardOperation } = useFlashcard()
  const dispatch = useAppDispatch()
  const dismissed = useAppSelector((state) =>
    card ? state.flashcardV2.tidyDismissed?.[card.pubkey] : undefined,
  )
  const [records, setRecords] = useState<TidyRecord[]>([])
  const [progress, setProgress] = useState<TidyProgress>()
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
   *
   * `finishOnly` is "Finish" on a listed tidy: it finishes the card's tidy
   * still owed and never starts a new one. The listed tidy may have left the
   * owed states since the screen read it (a minter pass gave it up as
   * `needs-card`); a new tidy then would burn pieces the owner was never
   * offered, its fee and its PIN choice unseen. With nothing owed it taps
   * nothing and reports nothing done.
   */
  const tidy = useCallback(
    async ({
      pin,
      finishOnly = false,
    }: { pin?: string; finishOnly?: boolean } = {}): Promise<TidyResult> => {
      setProgress(undefined)
      if (!card) throw new TopUpError("state", "no card to tidy")
      const mint = topUpMint()
      const deps: TidyDeps = { mint, store: topUpStore, now: Date.now, newId: uuidv4 }
      // A tidy still owed is finished first, and its fee and keyset are in
      // its record: the mint is not asked (its keyset may be rotated out by
      // now, and the change it signed must still come back to the card).
      // Otherwise the keyset of the read the owner was offered, and its fee,
      // go into the tap together, so a new tidy plans in that keyset alone.
      const owed = await owedTidy(deps, card.pubkey)
      if (finishOnly && !owed) {
        await list()
        return { status: "skipped", reason: "at-target" }
      }
      // No keyset, no new tidy: `runTidy` can then only finish one.
      const keysetId =
        !owed && !finishOnly && card.unspentSlots
          ? tidyKeyset(card.unspentSlots)
          : undefined
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
      let threw = false
      try {
        return await runCardOperation(
          (transceive, report) =>
            runTidy(deps, {
              transceive,
              card: { pubkey: card.pubkey, maxSlots: card.maxSlots },
              keysetId,
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
              // Between APDUs, never awaited: the screen and the NFC sheet.
              onProgress: (p) => {
                setProgress(p)
                report?.(`${tidyProgressText(p, LL)} ${LL.FlashcardV2.tidyKeepHolding()}`)
              },
            }),
          card.pubkey,
          { rereadSlots: true },
        )
      } catch (err) {
        threw = true
        throw err
      } finally {
        setProgress(undefined)
        list()
        // A tidy the card signed whose swap this tap did not make is the
        // minter's to swap without the card: asked now, and kept asking
        // while it stays signed (`advanceTidies`).
        if (threw) {
          nudgeTopUpMinter()
        } else {
          owedTidy(deps, card.pubkey)
            .then((left) => left?.state === "signed" && nudgeTopUpMinter())
            .catch(() => undefined)
        }
      }
    },
    [card, runCardOperation, list, LL],
  )

  return { offer, records, progress, notNow, tidy, dismiss }
}
