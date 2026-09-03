import { useCallback, useMemo, useRef, useState } from "react"
import { v4 as uuidv4 } from "uuid"

// gql
import {
  HomeAuthedDocument,
  PaymentSendResult,
  useIntraLedgerPaymentSendMutation,
  useIntraLedgerUsdPaymentSendMutation,
  useLnInvoicePaymentSendMutation,
  useLnNoAmountInvoicePaymentSendMutation,
  useLnNoAmountUsdInvoicePaymentSendMutation,
  useOnChainPaymentSendMutation,
  useOnChainPaymentSendAllMutation,
  useOnChainUsdPaymentSendAsBtcDenominatedMutation,
  useOnChainUsdPaymentSendMutation,
  WalletCurrency,
} from "@app/graphql/generated"

// hooks
import { useAppConfig } from "@app/hooks"

// utils
import { getErrorMessages } from "@app/graphql/utils"
import {
  CHECK_TRANSACTION_HISTORY_MESSAGE,
  isIdempotencyKeyReuseError,
} from "./payment-details/idempotency-support"

// types
import {
  PaymentDetail,
  SendPaymentMutation,
  SendPaymentMutationParams,
} from "./payment-details/index.types"

// Breez SDK
import { payLightningBreez, payOnchainBreez, payLnurlBreez } from "@app/utils/breez-sdk"

type UseSendPaymentResult = {
  loading: boolean
  hasAttemptedSend: boolean
  /**
   * Synchronous read of the in-flight guard. The screen's handler must decide
   * BEFORE its side effects (analytics, spinner) whether this tap is a
   * duplicate: `sendPayment`'s own `ignored` answer only arrives after the
   * call, by which point `logPaymentAttempt` would already have fired and
   * inflated attempt counts against results. A ref-backed getter (not state)
   * so two taps in one frame see the truth.
   */
  isInFlight: () => boolean
  sendPayment:
    | (() => Promise<{
        status: PaymentSendResult | null | undefined
        errorsMessage?: string
        /**
         * True when this call was suppressed by the in-flight guard: a second
         * tap that landed while the first send was still on the wire. The
         * caller must return immediately — no spinner toggle, no analytics,
         * no error toast — or a double-tap on a SUCCESSFUL payment shows a
         * failure toast and logs a phantom undefined-status result.
         */
        ignored?: boolean
      }>)
    | undefined
    | null
}

export const useSendPayment = (
  sendPaymentMutation?: SendPaymentMutation | null,
  paymentDetail?: PaymentDetail<WalletCurrency>,
  selectedFeeType?: "fast" | "medium" | "slow",
): UseSendPaymentResult => {
  const { lnAddressHostname, graphqlUri } = useAppConfig().appConfig.galoyInstance

  const [intraLedgerPaymentSend, { loading: intraLedgerPaymentSendLoading }] =
    useIntraLedgerPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [intraLedgerUsdPaymentSend, { loading: intraLedgerUsdPaymentSendLoading }] =
    useIntraLedgerUsdPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [lnInvoicePaymentSend, { loading: lnInvoicePaymentSendLoading }] =
    useLnInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [lnNoAmountInvoicePaymentSend, { loading: lnNoAmountInvoicePaymentSendLoading }] =
    useLnNoAmountInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [
    lnNoAmountUsdInvoicePaymentSend,
    { loading: lnNoAmountUsdInvoicePaymentSendLoading },
  ] = useLnNoAmountUsdInvoicePaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainPaymentSend, { loading: onChainPaymentSendLoading }] =
    useOnChainPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainPaymentSendAll, { loading: onChainPaymentSendAllLoading }] =
    useOnChainPaymentSendAllMutation({ refetchQueries: [HomeAuthedDocument] })
  const [onChainUsdPaymentSend, { loading: onChainUsdPaymentSendLoading }] =
    useOnChainUsdPaymentSendMutation({ refetchQueries: [HomeAuthedDocument] })
  const [
    onChainUsdPaymentSendAsBtcDenominated,
    { loading: onChainUsdPaymentSendAsBtcDenominatedLoading },
  ] = useOnChainUsdPaymentSendAsBtcDenominatedMutation({
    refetchQueries: [HomeAuthedDocument],
  })

  const [hasAttemptedSend, setHasAttemptedSend] = useState(false)

  // ── The retained attempt: freeze-the-attempt, in one object ──
  //
  // ENG-533's history is six review rounds of trying to RECOGNISE a repeated
  // send from its content — and every fingerprint that ignored a re-minted
  // LNURL invoice or a price-ticked amount either collided two deliberate
  // payments or mismatched the server's own fingerprint and turned the one
  // retry this feature exists for into IdempotencyKeyReuseError → "failed" →
  // a fresh key → a double pay.
  //
  // So nothing here recognises anything. An attempt IS this object: the send
  // closure captured at the first tap (whose wire input is therefore frozen —
  // a later re-render may rebuild the payment detail, re-mint the invoice,
  // re-derive the amount, and none of it matters because we never call the
  // new closure) plus one random key. Lifecycle:
  //
  //   created   at the first tap
  //   retained  when the send THROWS (dropped socket, 502, backgrounded) —
  //             the outcome is unknown, so the retry re-runs the same closure
  //             with the same key and the backend replays the original result
  //             if it had committed
  //   cleared   on ANY server-supplied status — the outcome is known, so the
  //             next tap is a new payment with a fresh key by construction.
  //             This also kills both residual bugs of the fingerprint design:
  //             no deliberate repeat can collide (fresh uuid every attempt),
  //             and no 24h cached FAILURE can lock anyone out (its key is
  //             never reused).
  //
  // Deliberately NOT persisted. A force-quit mid-send discards the attempt,
  // which leaves exactly today's pre-existing risk — no worse — and avoids
  // guessing across sessions with content fingerprints. Cross-session
  // recovery wants a server-side lookup, not client heuristics.
  const attemptRef = useRef<{
    key: string
    // Flipped on the attempt's first dispatch. A later run of the same
    // attempt is therefore a RETRY — an earlier dispatch with an unknown
    // outcome exists — which the idempotency-support gate must know: its
    // keyless fallback on a coercion refusal is only safe on a first
    // dispatch, where the refusal proves nothing executed.
    dispatched: boolean
    // Flipped (via onKeylessDispatch) when any dispatch of this attempt went
    // out WITHOUT the key — the gate's keyless fallback. The design contract
    // "a retry re-runs identical input under the same key and the backend
    // replays" only holds when the earlier dispatch actually CARRIED the key.
    // If a keyless dispatch throws with its outcome unknown, a keyed retry is
    // not a replay — the server never saw the key — so it could execute a
    // second payment. Such an attempt must never be auto-retried; the user is
    // sent to their history instead.
    wentKeyless: boolean
    run: (params: SendPaymentMutationParams) => ReturnType<SendPaymentMutation>
  } | null>(null)

  // Synchronous double-tap guard. `hasAttemptedSend` gates whether
  // `sendPayment` is DEFINED, but that is decided at render time: two taps in
  // one frame both capture the closure from the render where it was still
  // defined. A ref is written synchronously, so the second tap sees it.
  const inFlightRef = useRef(false)

  const loading =
    intraLedgerPaymentSendLoading ||
    intraLedgerUsdPaymentSendLoading ||
    lnInvoicePaymentSendLoading ||
    lnNoAmountInvoicePaymentSendLoading ||
    lnNoAmountUsdInvoicePaymentSendLoading ||
    onChainPaymentSendLoading ||
    onChainPaymentSendAllLoading ||
    onChainUsdPaymentSendLoading ||
    onChainUsdPaymentSendAsBtcDenominatedLoading

  const sendPayment = useMemo(() => {
    return sendPaymentMutation && !hasAttemptedSend
      ? async () => {
          if (inFlightRef.current) {
            return { status: undefined, errorsMessage: undefined, ignored: true }
          }
          inFlightRef.current = true
          setHasAttemptedSend(true)

          // Shared failure epilogue for the Breez branch: a Failure is a KNOWN
          // outcome, so re-arm the button for a fresh attempt — same semantics
          // as the GraphQL branch below. (Breez sends are local SDK calls with
          // no idempotency key; a retry is simply a new attempt.)
          const finish = (result: {
            status: PaymentSendResult
            errorsMessage?: string
          }) => {
            if (result.status === PaymentSendResult.Failure) {
              inFlightRef.current = false
              setHasAttemptedSend(false)
            }
            return result
          }

          if (paymentDetail && paymentDetail.sendingWalletDescriptor.currency === "BTC") {
            const { settlementAmount, memo, destination, paymentType } = paymentDetail

            try {
              if (paymentType === "lightning") {
                console.log("Starting payLightningBreez")
                const response = await payLightningBreez(
                  destination,
                  settlementAmount.amount,
                )
                console.log("Response payLightningBreez: ", response)
                return finish({
                  status: response.success
                    ? PaymentSendResult.Success
                    : PaymentSendResult.Failure,
                  errorsMessage: response.error,
                })
              } else if (paymentType === "lnurl" || paymentType === "intraledger") {
                console.log("Starting payLnurlBreez", memo)
                const updatedDestination =
                  paymentType === "intraledger"
                    ? destination + `@${lnAddressHostname}`
                    : destination
                const response = await payLnurlBreez(
                  updatedDestination,
                  settlementAmount?.amount,
                  "",
                )
                console.log("Response payLnurlBreez: ", response)
                return {
                  status: PaymentSendResult.Success,
                  errorsMessage: undefined,
                }
              } else if (paymentType === "onchain") {
                console.log("Starting payOnchainBreez")
                const response = await payOnchainBreez(
                  destination,
                  settlementAmount.amount,
                  selectedFeeType || "fast",
                )
                console.log("Response payOnchainBreez: ", response)

                return finish({
                  status: response.success
                    ? PaymentSendResult.Success
                    : PaymentSendResult.Failure,
                  errorsMessage: response.error,
                })
              } else {
                return finish({
                  status: PaymentSendResult.Failure,
                  errorsMessage: "Wrong invoice type",
                })
              }
            } catch (err: any) {
              return finish({
                status: PaymentSendResult.Failure,
                errorsMessage: err.message,
              })
            }
          } else {
            console.log("Starting sendPaymentMutation using GraphQL")
            // Repeat of an unresolved attempt → the retained closure and key.
            // First tap of a new attempt → freeze the CURRENT closure with a
            // fresh key. See attemptRef above for why this is the whole design.
            if (!attemptRef.current) {
              attemptRef.current = {
                key: uuidv4(),
                dispatched: false,
                wentKeyless: false,
                run: sendPaymentMutation,
              }
            }
            const attempt = attemptRef.current
            const attemptIsRetry = attempt.dispatched

            // A retry of an attempt whose earlier dispatch went out KEYLESS:
            // the server has never seen this key, so there is nothing for it
            // to replay — re-dispatching (keyed or not) could execute a second
            // payment while the keyless one may have committed. Same answer as
            // the IdempotencyKeyReuseError branch below: keep the button
            // disarmed and send the user to their history.
            if (attemptIsRetry && attempt.wentKeyless) {
              return {
                status: PaymentSendResult.Failure,
                errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
              }
            }
            attempt.dispatched = true

            let response
            try {
              response = await attempt.run({
                idempotencyKey: attempt.key,
                attemptIsRetry,
                onKeylessDispatch: () => {
                  attempt.wentKeyless = true
                },
                apiEndpoint: graphqlUri,
                intraLedgerPaymentSend,
                intraLedgerUsdPaymentSend,
                lnInvoicePaymentSend,
                lnNoAmountInvoicePaymentSend,
                lnNoAmountUsdInvoicePaymentSend,
                onChainPaymentSend,
                onChainPaymentSendAll,
                onChainUsdPaymentSend,
                onChainUsdPaymentSendAsBtcDenominated,
              })
            } catch (err) {
              // Outcome unknown — the case this design exists for. Keep the
              // attempt so the retry re-runs the same input under the same
              // key, and re-arm the button.
              // eslint-disable-next-line require-atomic-updates -- ref as a synchronous flag; the write-after-await IS the design
              inFlightRef.current = false
              setHasAttemptedSend(false)
              throw err
            }

            // A status came back at all → the outcome is known and this
            // attempt is finished, whatever the answer was.
            if (response.status) {
              // eslint-disable-next-line require-atomic-updates -- ref as a synchronous flag; the write-after-await IS the design
              attemptRef.current = null
            }
            let errorsMessage = undefined
            if (response.errors) {
              errorsMessage = getErrorMessages(response.errors)
            }
            // Defense in depth: the frozen-closure design should make key
            // reuse unreachable (a key is only ever re-sent with the same
            // frozen input), but if the server ever answers with
            // IdempotencyKeyReuseError it is telling us it HOLDS an outcome
            // for this key. Treating that as an ordinary Failure would retire
            // the key and re-arm the button — the next tap gets a fresh key
            // for a payment that may already have settled, and the money
            // leaves twice. So: keep the button disarmed and send the user to
            // their history instead.
            if (
              response.status === PaymentSendResult.Failure &&
              isIdempotencyKeyReuseError(response.errors)
            ) {
              return {
                status: response.status,
                errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
              }
            }
            if (response.status === PaymentSendResult.Failure) {
              // eslint-disable-next-line require-atomic-updates -- ref as a synchronous flag; the write-after-await IS the design
              inFlightRef.current = false
              setHasAttemptedSend(false)
            }
            return { status: response.status, errorsMessage }
          }
        }
      : undefined
  }, [
    sendPaymentMutation,
    hasAttemptedSend,
    graphqlUri,
    paymentDetail,
    selectedFeeType,
    intraLedgerPaymentSend,
    intraLedgerUsdPaymentSend,
    lnInvoicePaymentSend,
    lnNoAmountInvoicePaymentSend,
    lnNoAmountUsdInvoicePaymentSend,
    onChainPaymentSend,
    onChainPaymentSendAll,
    onChainUsdPaymentSend,
    onChainUsdPaymentSendAsBtcDenominated,
  ])

  const isInFlight = useCallback(() => inFlightRef.current, [])

  return {
    hasAttemptedSend,
    loading,
    sendPayment,
    isInFlight,
  }
}
