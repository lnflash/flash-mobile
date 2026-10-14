import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import { gql } from "@apollo/client"
import { useFocusEffect } from "@react-navigation/native"
import { v4 as uuidv4 } from "uuid"

import {
  HomeAuthedDocument,
  PaymentSendResult,
  useCardTopUpInvoicePaymentSendMutation,
  useLnUsdInvoiceFeeProbeMutation,
} from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  IDEMPOTENT_SEND_INPUTS,
  isIdempotencyKeyReuseError,
  isUnsupportedIdempotencyKeyError,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import {
  CardError,
  CashuCardInfo,
  SW_NO_OWNER,
  SW_OWNER_PROOF,
  Transceiver,
  verifyCardPin,
} from "@app/utils/cashu-card"
import { allowLoad, ownerSigner } from "@app/utils/cashu-card-owner"
import { OwnerKey, ownerKeyFor, saveOwnerKey } from "@app/utils/cashu-card-owner-store"
import { isStaleDevMint, stubbedPayOutcome } from "@app/utils/cashu-card-bridge"
import {
  CardFreeDeps,
  PayOutcome,
  ProofState,
  ReclaimPlan,
  ReclaimResult,
  TopUpDeps,
  TopUpError,
  TopUpMint,
  TopUpRecord,
  advanceTidies,
  advanceTopUps,
  cancelTopUp,
  createMinterLoop,
  loadTopUp,
  proofStatesForLoad,
  reclaimPlan,
  reclaimSpentSlots,
  reclaimVerdicts,
  unfinishedTopUps,
} from "@app/utils/cashu-card-topup"

import { topUpMint, topUpStore } from "@app/utils/cashu-card-topup/connected"

import { useFlashcard } from "./useFlashcard"

// The top-up's own spelling of lnInvoicePaymentSend, with each error's code:
// whether a refused payment may still have left the wallet depends on WHICH
// refusal it was, and the message text alone cannot tell (see
// `readPaymentAnswer`). Its own document, so the send flow's is untouched.
gql`
  mutation cardTopUpInvoicePaymentSend($input: LnInvoicePaymentInput!) {
    lnInvoicePaymentSend(input: $input) {
      errors {
        code
        message
      }
      status
    }
  }
`

// The app's one top-up store and its client for the connected mint
// (`connected.ts`), shared with the card context's tidy offer (ENG-702).
const store = topUpStore
export { topUpMint }
/** What the card-free steps need: the mint and the store, no wallet, no card. */
const cardFreeDeps = (mint: TopUpMint = topUpMint()): CardFreeDeps => ({
  mint,
  store,
  now: Date.now,
})

/**
 * Error codes flash's lnInvoicePaymentSend returns only for a payment refused
 * BEFORE it executed (src/graphql/public/root/mutation/ln-invoice-payment-send.ts):
 * the send guard in `authorize` (limits and a limit it cannot read,
 * TRANSACTION_RESTRICTED; the attempt budget, TOO_MANY_REQUEST; an amount,
 * key or invoice it will not take, INVALID_INPUT and INVOICE_DECODE_ERROR),
 * and IBEX refusing for balance (INSUFFICIENT_BALANCE).
 *
 * Nothing else may read as "failed", which tells the user nothing left the
 * wallet and takes a fresh key for the next attempt: the busy-lock answer to
 * a same-key request still executing must be retried under the same key
 * (src/app/payments/idempotency.ts), and IBEX's generic error (no code) can
 * come back after IBEX debited. The busy lock is ResourceAttemptsLockServiceError,
 * which flash sends as UNEXPECTED_CLIENT_ERROR, "Unexpected error occurred,
 * please try again or contact support if it persists (code:
 * ResourceAttemptsLockServiceError: Unknown error)" (src/graphql/error-map.ts,
 * the catch-all that returns UnexpectedClientError).
 */
const REFUSED_BEFORE_EXECUTION: readonly string[] = [
  "INSUFFICIENT_BALANCE",
  "TRANSACTION_RESTRICTED",
  "TOO_MANY_REQUEST",
  "INVALID_INPUT",
  "INVOICE_DECODE_ERROR",
]

type PaymentAnswer = {
  status?: PaymentSendResult | null
  errors: readonly { code?: string | null; message: string }[]
}

/** How a top-up reads the server's answer to its payment. */
const readPaymentAnswer = (answer: PaymentAnswer | null | undefined): PayOutcome => {
  if (!answer) return { kind: "unknown" }
  const { status, errors } = answer
  const message = errors[0]?.message || undefined
  // The server holds an outcome for this key under other parameters: never a
  // failure, which would take a fresh key and pay again. (Its code is the
  // generic INVALID_INPUT, so this is checked first.)
  if (isIdempotencyKeyReuseError(errors)) return { kind: "unknown", message }
  switch (status) {
    case PaymentSendResult.Success:
    case PaymentSendResult.AlreadyPaid:
      return { kind: "paid" }
    case PaymentSendResult.Pending:
      return { kind: "pending" }
    case PaymentSendResult.Failure:
      // No error attached: IBEX's own verdict that the payment ran and
      // failed (a route failure, say), which the server reports only when
      // IBEX corroborates it (src/services/ibex/payment-status.ts) and
      // caches under the key, replaying it to every retry. Nothing left the
      // wallet, and this key can never pay: definitive, even on a retry.
      if (errors.length === 0) return { kind: "failed", definitive: true }
      if (errors.every((error) => REFUSED_BEFORE_EXECUTION.includes(error.code ?? ""))) {
        return { kind: "failed", message }
      }
      return { kind: "unknown", message }
    default:
      return { kind: "unknown", message }
  }
}

/**
 * The Cashu card top-up (ENG-616), wired to this app: the mint it is
 * connected to, the Keychain store, the Cash wallet paying the mint's invoice
 * under an idempotency key, and the card through `runCardOperation`.
 */
export const useCardTopUp = () => {
  const { LL } = useI18nContext()
  const { runCardOperation } = useFlashcard()
  const [payInvoice] = useCardTopUpInvoicePaymentSendMutation({
    refetchQueries: [HomeAuthedDocument],
  })
  const [lnUsdInvoiceFeeProbe] = useLnUsdInvoiceFeeProbeMutation()

  const deps: TopUpDeps = useMemo(() => {
    // The mint these deps quote, pay and mint at, fixed for the screen's
    // life. The engine pays only a record bound to it (`ofThisMint`), so
    // `pay` judges the dev stub against it, never the bridge's mint of the
    // moment: a dev link arriving after the screen mounted cannot pair the
    // stub with a production quote, nor turn a dev quote into a real payment.
    const mint = topUpMint()
    return {
      ...cardFreeDeps(mint),
      newId: uuidv4,
      pay: async ({ walletId, paymentRequest, idempotencyKey }): Promise<PayOutcome> => {
        // Development builds only, against a dev mint that is never the
        // production one (ENG-634): a FakeWallet mint marks its own quote
        // paid, so nothing is sent. Undefined in a release build.
        const stub = stubbedPayOutcome(mint.url)
        if (stub) return stub
        // A dev mint the bridge has since let go of: its invoice is never
        // paid from the Cash wallet. Refused before anything is sent, so
        // nothing left the wallet. Never true for the production mint.
        if (isStaleDevMint(mint.url)) {
          return {
            kind: "failed",
            message: "the card bridge no longer points at this top-up's dev mint",
          }
        }
        let answer
        try {
          // Always with the key, never the send flow's keyless fallback: a
          // top-up whose dispatch went out without a key could not be
          // retried safely, and the mint's quote would be the only way to
          // learn whether it landed.
          const { data } = await payInvoice({
            variables: {
              input: {
                walletId,
                paymentRequest,
                memo: LL.FlashcardV2.topUpMemo(),
                idempotencyKey,
              },
            },
          })
          answer = data?.lnInvoicePaymentSend
        } catch (err) {
          // A server without the key field refuses the whole input while
          // coercing it, before anything executes: a refusal of THIS
          // dispatch. (The engine reads a refused retry as unknown.)
          if (isUnsupportedIdempotencyKeyError(err, IDEMPOTENT_SEND_INPUTS.lnInvoice)) {
            return {
              kind: "failed",
              message: err instanceof Error ? err.message : undefined,
            }
          }
          throw err
        }
        return readPaymentAnswer(answer)
      },
    }
  }, [payInvoice, LL])

  /** The Cash wallet's fee to pay the top-up's invoice, in cents; undefined if it cannot be probed. */
  const feeFor = async (record: TopUpRecord): Promise<number | undefined> => {
    try {
      const { data } = await lnUsdInvoiceFeeProbe({
        variables: {
          input: {
            walletId: record.payment.walletId,
            paymentRequest: record.quote.request,
          },
        },
      })
      const probe = data?.lnUsdInvoiceFeeProbe
      if (!probe || probe.errors.length > 0 || typeof probe.amount !== "number")
        return undefined
      return probe.amount
    } catch {
      return undefined
    }
  }

  /** One tap: VERIFY_PIN, so a wrong PIN is found before anything is paid. */
  const checkPin = (card: Pick<CashuCardInfo, "pubkey" | "sealed">, pin: string) =>
    runCardOperation(
      (transceive) =>
        verifyCardPin(transceive, pin, { sealed: card.sealed, cardPubkey: card.pubkey }),
      card.pubkey,
    )

  /**
   * The mint's NUT-07 word on the card's spent slots, as the last read found
   * them, or undefined when the mint could not be asked. Never fatal: a load
   * without verdicts frees no slot and goes on with the empty ones.
   */
  const verdictsFor = async (
    card: Pick<CashuCardInfo, "pubkey" | "spentSlots">,
  ): Promise<ReadonlyMap<string, ProofState> | undefined> => {
    if (!card.spentSlots?.length) return new Map()
    return reclaimVerdicts(deps, card.pubkey, card.spentSlots).catch(() => undefined)
  }

  /**
   * What the load tap's reclaim will do with the card's spent slots, for the
   * amount step to count as room (ENG-631): asks the mint now, off the card.
   */
  const reclaimPlanFor = async (
    card: Pick<CashuCardInfo, "pubkey" | "spentSlots">,
  ): Promise<ReclaimPlan> => reclaimPlan(card.spentSlots ?? [], await verdictsFor(card))

  /**
   * Opens the tap for loading, the way this card and phone allow (spec/APDU.md,
   * LOAD_PROOF): the owner's grant (ALLOW_LOAD) when this phone holds a key
   * for the card, else the PIN, else nothing on a card with no PIN. A grant
   * the card refuses (6A91: not this phone's card; 6A90: no owner) falls back
   * to the PIN. Without a PIN to fall back to, a card with one refuses here,
   * before any load APDU (`not-owner`): the screen asks for the PIN and taps
   * again. The grant is per tap, so it is asked for in the tap that loads.
   * A seed-derived key the card took is saved for next time.
   */
  const openForLoading = async (
    transceive: Transceiver,
    card: Pick<CashuCardInfo, "pubkey" | "pinState" | "sealed">,
    { pin, owner }: { pin?: string; owner?: OwnerKey },
  ) => {
    if (owner) {
      try {
        await allowLoad(transceive, ownerSigner(owner.privateKey))
        await saveOwnerKey(card.pubkey, owner).catch(() => undefined)
        return
      } catch (err) {
        const refused =
          err instanceof CardError &&
          (err.sw === SW_OWNER_PROOF || err.sw === SW_NO_OWNER)
        if (!refused) throw err
      }
    }
    if (pin) {
      await verifyCardPin(transceive, pin, {
        sealed: card.sealed,
        cardPubkey: card.pubkey,
      })
      return
    }
    if (card.pinState !== "unset") {
      throw new TopUpError(
        "not-owner",
        "the card wants its PIN: this phone is not its owner",
      )
    }
  }

  /**
   * One tap: the owner's grant, or VERIFY_PIN (`openForLoading`), then the
   * reclaim of the card's settled spent slots (`reclaimSpentSlots`), then the
   * load, in the same session. Everything the mint is asked is asked before
   * the tap, and the owner key is found before it too (a seed's derivation
   * takes a moment), so the card session never waits: a resumed load's word
   * on each of its proofs, which it cannot do without (`mint-unreachable`,
   * nothing touches the card), and the verdicts on the spent slots, which it
   * can (no slot is freed, and the refusal says how many are still settling).
   * The reclaim's read of the card is handed to the load when it still holds
   * (`inventory`, nothing cleared), so no slot is read twice in the tap.
   * A load the engine refuses carries what the reclaim found (`reclaim`).
   * Nothing in the tap is retried: a load APDU goes out once.
   */
  const load = async (
    record: TopUpRecord,
    card: Pick<
      CashuCardInfo,
      "pubkey" | "maxSlots" | "spentSlots" | "pinState" | "sealed" | "hasOwner"
    >,
    pin?: string,
  ): Promise<{ record: TopUpRecord; reclaim: ReclaimResult }> => {
    let mintStates: Awaited<ReturnType<typeof proofStatesForLoad>>
    try {
      mintStates = await proofStatesForLoad(deps, record.id)
    } catch (err) {
      // The engine's own refusals (a top-up no longer saved) keep their reason.
      if (err instanceof TopUpError) throw err
      throw new TopUpError(
        "mint-unreachable",
        `the mint could not be asked about the top-up's proofs: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }
    const verdicts = await verdictsFor(card)
    const owner = card.hasOwner
      ? await ownerKeyFor(card.pubkey).catch(() => undefined)
      : undefined
    return runCardOperation(async (transceive) => {
      await openForLoading(transceive, card, { pin, owner })
      const reclaim = await reclaimSpentSlots(transceive, {
        maxSlots: card.maxSlots,
        verdicts,
      })
      try {
        const loaded = await loadTopUp(deps, {
          id: record.id,
          transceive,
          card,
          mintStates,
          // The reclaim's read of the card, when it still holds (no
          // CLEAR_SPENT went out): the load reads nothing twice.
          inventory: reclaim.inventory,
        })
        return { record: loaded, reclaim }
      } catch (err) {
        // The engine's own error, so its stack still points at the check
        // that refused; the reclaim rides along for the `slots` message.
        if (err instanceof TopUpError) err.reclaim = reclaim
        throw err
      }
    }, record.cardPubkey)
  }

  return { deps, feeFor, checkPin, load, reclaimPlanFor }
}

/**
 * The card's top-ups still waiting for a payment, a mint or a tap, re-read
 * each time the screen is focused: at once, then again once the mint has had
 * its say (`advanceTopUps` mints what landed and drops what never can). A
 * store that cannot be read shows none here and writes nothing.
 *
 * `dismiss` drops one whose quote the mint still holds unpaid well after it
 * expired; it refuses anything that may still be paid. A refused dismiss
 * reads the top-ups again, the same way (one the mint holds as paid is saved
 * as paid by then, and gets minted), and still rejects, so the screen can
 * say why it stays.
 */
export const useUnfinishedTopUps = (cardPubkey: string | undefined) => {
  const [records, setRecords] = useState<TopUpRecord[]>([])
  // The focused screen's read-again; none while it is not focused.
  const refresh = useRef<(() => Promise<unknown>) | undefined>(undefined)
  useFocusEffect(
    useCallback(() => {
      if (!cardPubkey) return undefined
      let live = true
      const list = () =>
        unfinishedTopUps({ store }, cardPubkey)
          .then((found) => live && setRecords(found))
          .catch(() => live && setRecords([]))
      const readAgain = () =>
        list()
          .then(() => advanceTopUps(cardFreeDeps()))
          .then(list, () => undefined)
      refresh.current = readAgain
      readAgain()
      return () => {
        live = false
        refresh.current = undefined
      }
    }, [cardPubkey]),
  )
  const dismiss = useCallback(async (id: string) => {
    try {
      await cancelTopUp(cardFreeDeps(), id)
    } catch (err) {
      refresh.current?.()
      throw err
    }
    setRecords((current) => current.filter((record) => record.id !== id))
  }, [])
  return { records, dismiss }
}

/** How often, in the foreground, the mint is asked about a payment on its way. */
export const TOP_UP_POLL_MS = 15_000

let nudgeMinter: (() => void) | undefined

/** Ask the mint about every saved top-up now: a payment just went out. */
export const nudgeTopUpMinter = () => nudgeMinter?.()

/**
 * Mounted once, for the whole app (app.tsx). Mints a paid top-up without the
 * card, and drops quotes nobody can pay any more, at launch, on each return
 * to the foreground, on a nudge, and every `TOP_UP_POLL_MS` while a payment
 * may still land (`createMinterLoop`). Nutshell refuses to mint a paid quote
 * once its expiry has passed, so this cannot wait for the user to come back
 * to the top-up with the card.
 */
export const useTopUpMinter = () => {
  useEffect(() => {
    const loop = createMinterLoop({
      // A card tidy the card signed is swapped without the card too (ENG-702).
      run: async () => {
        const deps = cardFreeDeps()
        const result = await advanceTopUps(deps)
        try {
          await advanceTidies(deps)
        } catch {
          // Asked again on the next pass.
        }
        return result
      },
      pollMs: TOP_UP_POLL_MS,
      isActive: () => AppState.currentState === "active",
    })
    nudgeMinter = loop.nudge
    loop.nudge()
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") loop.nudge()
      else loop.pause()
    })
    return () => {
      subscription.remove()
      loop.stop()
      nudgeMinter = undefined
    }
  }, [])
}
