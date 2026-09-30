import { useCallback, useMemo, useState } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { v4 as uuidv4 } from "uuid"

import { CASHU_MINT_URL } from "@app/config/appinfo"
import {
  HomeAuthedDocument,
  PaymentSendResult,
  useLnInvoicePaymentSendMutation,
  useLnUsdInvoiceFeeProbeMutation,
} from "@app/graphql/generated"
import { useI18nContext } from "@app/i18n/i18n-react"
import {
  IDEMPOTENT_SEND_INPUTS,
  UnresolvedAttemptKeyRefusedError,
  isIdempotencyKeyReuseError,
  withIdempotencyKey,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"
import { CardInfo, verifyCardPin } from "@app/utils/cashu-card"
import {
  PayOutcome,
  TopUpDeps,
  TopUpMint,
  TopUpRecord,
  createTopUpMint,
  createTopUpStore,
  loadTopUp,
  unfinishedTopUps,
} from "@app/utils/cashu-card-topup"

import { useAppConfig } from "./use-app-config"
import { useFlashcard } from "./useFlashcard"

// One store for the whole app: its write queue is what keeps two screens from
// saving over each other. One client for the connected mint, so its keysets
// are fetched once.
const store = createTopUpStore()
let connectedMint: TopUpMint | undefined
const mint = (): TopUpMint => {
  connectedMint ??= createTopUpMint(CASHU_MINT_URL)
  return connectedMint
}

/**
 * The Cashu card top-up (ENG-616), wired to this app: the mint it is
 * connected to, the Keychain store, the Cash wallet paying the mint's invoice
 * through the same idempotent send the send flow uses, and the card through
 * `runCardOperation`.
 */
export const useCardTopUp = () => {
  const {
    appConfig: {
      galoyInstance: { graphqlUri },
    },
  } = useAppConfig()
  const { LL } = useI18nContext()
  const { runCardOperation } = useFlashcard()
  const [lnInvoicePaymentSend] = useLnInvoicePaymentSendMutation({
    refetchQueries: [HomeAuthedDocument],
  })
  const [lnUsdInvoiceFeeProbe] = useLnUsdInvoiceFeeProbeMutation()

  const deps: TopUpDeps = useMemo(
    () => ({
      mint: mint(),
      store,
      now: Date.now,
      newId: uuidv4,
      pay: async ({
        walletId,
        paymentRequest,
        idempotencyKey,
        isRetry,
        onKeylessDispatch,
      }): Promise<PayOutcome> => {
        let result
        try {
          result = await withIdempotencyKey(
            { idempotencyKey, isRetry, onKeylessDispatch },
            { apiEndpoint: graphqlUri, inputType: IDEMPOTENT_SEND_INPUTS.lnInvoice },
            async (keyField) => {
              const { data } = await lnInvoicePaymentSend({
                variables: {
                  input: {
                    walletId,
                    paymentRequest,
                    memo: LL.FlashcardV2.topUpMemo(),
                    ...keyField,
                  },
                },
              })
              return data?.lnInvoicePaymentSend
            },
          )
        } catch (err) {
          // The key was refused on a retry: the earlier dispatch's outcome is
          // unknown, and only the mint's quote state can settle it.
          if (err instanceof UnresolvedAttemptKeyRefusedError) return { kind: "unknown" }
          throw err
        }
        // The server holds an outcome for this key under other parameters:
        // never read as a failure, which would take a fresh key and pay again.
        if (isIdempotencyKeyReuseError(result?.errors)) return { kind: "unknown" }
        switch (result?.status) {
          case PaymentSendResult.Success:
          case PaymentSendResult.AlreadyPaid:
            return { kind: "paid" }
          case PaymentSendResult.Pending:
            return { kind: "pending" }
          case PaymentSendResult.Failure:
            return { kind: "failed", message: result.errors?.[0]?.message }
          default:
            return { kind: "unknown" }
        }
      },
    }),
    [graphqlUri, lnInvoicePaymentSend, LL],
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

  /** One tap: VERIFY_PIN when the card has a PIN, then the load, in the same session. */
  const load = (record: TopUpRecord, card: Pick<CardInfo, "maxSlots">, pin?: string) =>
    runCardOperation(async (transceive) => {
      if (pin) await verifyCardPin(transceive, pin)
      return loadTopUp(deps, { id: record.id, transceive, card })
    }, record.cardPubkey)

  return { deps, feeFor, checkPin, load }
}

/**
 * The card's top-ups still waiting for a payment, a mint or a tap, re-read
 * each time the screen is focused. A store that cannot be read shows none
 * here (this only lists; nothing is written from it).
 */
export const useUnfinishedTopUps = (cardPubkey: string | undefined): TopUpRecord[] => {
  const [records, setRecords] = useState<TopUpRecord[]>([])
  useFocusEffect(
    useCallback(() => {
      if (!cardPubkey) return undefined
      let live = true
      unfinishedTopUps({ store }, cardPubkey)
        .then((found) => live && setRecords(found))
        .catch(() => live && setRecords([]))
      return () => {
        live = false
      }
    }, [cardPubkey]),
  )
  return records
}
