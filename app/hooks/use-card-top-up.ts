import { useCallback, useEffect, useMemo, useState } from "react"
import { AppState } from "react-native"
import { gql } from "@apollo/client"
import { useFocusEffect } from "@react-navigation/native"
import { v4 as uuidv4 } from "uuid"

import { CASHU_MINT_URL } from "@app/config/appinfo"
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
import { CardInfo, verifyCardPin } from "@app/utils/cashu-card"
import {
  CardFreeDeps,
  PayOutcome,
  TopUpDeps,
  TopUpMint,
  TopUpRecord,
  advanceTopUps,
  cancelTopUp,
  createMinterLoop,
  createTopUpMint,
  createTopUpStore,
  loadTopUp,
  proofStatesForLoad,
  unfinishedTopUps,
} from "@app/utils/cashu-card-topup"

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

// One store for the whole app: its write queue is what keeps two screens from
// saving over each other. One client for the connected mint, so its keysets
// are fetched once.
const store = createTopUpStore()
let connectedMint: TopUpMint | undefined
const mint = (): TopUpMint => {
  connectedMint ??= createTopUpMint(CASHU_MINT_URL)
  return connectedMint
}
/** What the card-free steps need: the mint and the store, no wallet, no card. */
const cardFreeDeps = (): CardFreeDeps => ({ mint: mint(), store, now: Date.now })

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
 * a same-key request still executing (ResourceAttemptsLockServiceError, sent
 * as ROUTE_FINDING_ERROR with an empty message) must be retried under the
 * same key (src/app/payments/idempotency.ts), and IBEX's generic error (no
 * code) can come back after IBEX debited.
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
      // caches under the key. Nothing left the wallet.
      if (errors.length === 0) return { kind: "failed" }
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

  const deps: TopUpDeps = useMemo(
    () => ({
      ...cardFreeDeps(),
      newId: uuidv4,
      pay: async ({ walletId, paymentRequest, idempotencyKey }): Promise<PayOutcome> => {
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
    }),
    [payInvoice, LL],
  )

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
  const checkPin = (cardPubkey: string, pin: string) =>
    runCardOperation((transceive) => verifyCardPin(transceive, pin), cardPubkey)

  /**
   * One tap: VERIFY_PIN when the card has a PIN, then the load, in the same
   * session. A resumed load asks the mint about each proof first, before the
   * tap, so the card session never waits on the network.
   */
  const load = async (
    record: TopUpRecord,
    card: Pick<CardInfo, "maxSlots">,
    pin?: string,
  ): Promise<TopUpRecord> => {
    const mintStates = await proofStatesForLoad(deps, record.id)
    return runCardOperation(async (transceive) => {
      if (pin) await verifyCardPin(transceive, pin)
      return loadTopUp(deps, { id: record.id, transceive, card, mintStates })
    }, record.cardPubkey)
  }

  return { deps, feeFor, checkPin, load }
}

/**
 * The card's top-ups still waiting for a payment, a mint or a tap, re-read
 * each time the screen is focused: at once, then again once the mint has had
 * its say (`advanceTopUps` mints what landed and drops what never can). A
 * store that cannot be read shows none here and writes nothing.
 *
 * `dismiss` drops one whose quote the mint still holds unpaid well after it
 * expired; it refuses anything that may still be paid.
 */
export const useUnfinishedTopUps = (cardPubkey: string | undefined) => {
  const [records, setRecords] = useState<TopUpRecord[]>([])
  useFocusEffect(
    useCallback(() => {
      if (!cardPubkey) return undefined
      let live = true
      const list = () =>
        unfinishedTopUps({ store }, cardPubkey)
          .then((found) => live && setRecords(found))
          .catch(() => live && setRecords([]))
      list()
        .then(() => advanceTopUps(cardFreeDeps()))
        .then(list, () => undefined)
      return () => {
        live = false
      }
    }, [cardPubkey]),
  )
  const dismiss = useCallback(async (id: string) => {
    await cancelTopUp(cardFreeDeps(), id)
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
      run: () => advanceTopUps(cardFreeDeps()),
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
