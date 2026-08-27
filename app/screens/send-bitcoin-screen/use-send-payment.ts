import { useCallback, useMemo, useRef, useState } from "react"

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

// types
import { PaymentDetail, SendPaymentMutation } from "./payment-details/index.types"

// Breez SDK
import { payLightningBreez, payOnchainBreez, payLnurlBreez } from "@app/utils/breez-sdk"

// idempotency
import { attemptFingerprintOf, attemptKey, retireAttemptKey } from "./send-attempt-key"

export type SendPaymentResult = {
  status: PaymentSendResult | null | undefined
  errorsMessage?: string
  /**
   * The tap never became a request — the in-flight guard swallowed it because
   * an earlier send is still on the wire.
   *
   * Distinguishable on purpose. Without it a suppressed tap is indistinguishable
   * from a real result with no status, and the caller then stops the spinner
   * while the first send is still running, records a `payment_result` with an
   * undefined status into the analytics ENG-533 is measured on, and shows a
   * failure toast plus an error haptic over a payment that is about to succeed.
   */
  ignored?: boolean
}

type UseSendPaymentResult = {
  loading: boolean
  hasAttemptedSend: boolean
  sendPayment: (() => Promise<SendPaymentResult>) | undefined | null
  /**
   * Whether a send already owns this screen, read SYNCHRONOUSLY.
   *
   * `sendPayment()` reports the same thing through `ignored`, but only once
   * its promise resolves — i.e. after the first send's round trip. A caller
   * that wants to do anything *before* the request (log the attempt, start a
   * spinner) has to be able to ask first, or the second of two taps in one
   * frame records an event for a request that never went out.
   */
  sendIsInFlight: () => boolean
}

export const useSendPayment = (
  sendPaymentMutation?: SendPaymentMutation | null,
  paymentDetail?: PaymentDetail<WalletCurrency>,
  selectedFeeType?: "fast" | "medium" | "slow",
): UseSendPaymentResult => {
  const { lnAddressHostname } = useAppConfig().appConfig.galoyInstance

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

  // `hasAttemptedSend` alone does not stop a double send. It gates whether
  // `sendPayment` is defined, but that is decided at RENDER time: two taps in
  // the same frame both capture the closure from the render where it was still
  // defined, and both run before React re-renders with the flag set. A ref is
  // written synchronously, so the second tap sees it immediately.
  const inFlightRef = useRef(false)

  // One key per ATTEMPT, and the attempt is what the user sees — this wallet,
  // this destination, this amount — NOT this hook instance. If a send is
  // repeated because its response was lost, the repeat must carry the SAME key
  // or the backend cannot tell it from a genuine second payment, and the retry
  // a user can actually perform here is a back-navigation, which unmounts this
  // hook. A ref would therefore mint a fresh uuid for precisely the repeat it
  // is supposed to make recognisable; deriving the key from the attempt's own
  // content survives the remount. See send-attempt-key.ts.
  const fingerprint = useMemo(
    () => (paymentDetail ? attemptFingerprintOf(paymentDetail) : undefined),
    [paymentDetail],
  )

  // The same reading `ignored` reports, but available BEFORE the request — see
  // UseSendPaymentResult.
  const sendIsInFlight = useCallback(() => inFlightRef.current, [])

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
    // Narrowed once, here, rather than re-checked inside every branch: a
    // payment detail is what a send IS, so without one there is nothing to
    // send and nothing to derive a key from.
    if (!sendPaymentMutation || !paymentDetail || !fingerprint || hasAttemptedSend) {
      return undefined
    }
    const detail = paymentDetail
    const sendFingerprint = fingerprint

    return async (): Promise<SendPaymentResult> => {
      // Synchronous, before any await — see inFlightRef.
      if (inFlightRef.current) {
        return { status: undefined, errorsMessage: undefined, ignored: true }
      }
      inFlightRef.current = true
      setHasAttemptedSend(true)

      // The reset policy, decided in ONE place for every exit.
      //
      // Without this the state the screen is left in depended on which shape
      // the send happened to take: a resolved FAILURE unlocked the button,
      // while a THROWN mutation — the dropped socket, the gateway 502, the
      // backgrounded app, i.e. the very case the idempotency key exists for —
      // left the screen wedged in-flight forever, so the retained key could
      // never actually be resent.
      //
      // "Settled" means the server owns the outcome now: SUCCESS, PENDING and
      // ALREADY_PAID all mean another tap would be a second payment. Anything
      // else — a definitive FAILURE, an exception, an unreadable response —
      // leaves the user able to try again.
      const run = async (): Promise<SendPaymentResult> => {
        if (detail.sendingWalletDescriptor.currency === "BTC") {
          const { settlementAmount, memo, destination, paymentType } = detail

          try {
            if (paymentType === "lightning") {
              console.log("Starting payLightningBreez")
              const response = await payLightningBreez(
                destination,
                settlementAmount.amount,
              )
              console.log("Response payLightningBreez: ", response)
              return {
                status: response.success
                  ? PaymentSendResult.Success
                  : PaymentSendResult.Failure,
                errorsMessage: response.error,
              }
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

              return {
                status: response.success
                  ? PaymentSendResult.Success
                  : PaymentSendResult.Failure,
                errorsMessage: response.error,
              }
            }
            return {
              status: PaymentSendResult.Failure,
              errorsMessage: "Wrong invoice type",
            }
          } catch (err) {
            return {
              status: PaymentSendResult.Failure,
              errorsMessage: err instanceof Error ? err.message : String(err),
            }
          }
        } else {
          console.log("Starting sendPaymentMutation using GraphQL")
          const response = await sendPaymentMutation({
            idempotencyKey: attemptKey(sendFingerprint),
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
          let errorsMessage = undefined
          if (response.errors) {
            errorsMessage = getErrorMessages(response.errors)
          }
          if (response.status === PaymentSendResult.Failure) {
            // The server answered, and the answer is that nothing settled.
            // Only here is a fresh key correct: reusing this one would make
            // the backend replay the recorded failure and the customer could
            // never succeed. Every other exit keeps the key, which is the
            // conservative side — a repeat that the server already committed
            // returns the original result instead of paying twice.
            retireAttemptKey(sendFingerprint)
          }
          return { status: response.status, errorsMessage }
        }
      }

      let result: SendPaymentResult | undefined
      try {
        result = await run()
        return result
      } finally {
        const settled =
          result?.status === PaymentSendResult.Success ||
          result?.status === PaymentSendResult.Pending ||
          result?.status === PaymentSendResult.AlreadyPaid
        if (!settled) {
          // A ref used as a mutex is the point here, not an accident: it is
          // written synchronously so a second tap in the same frame observes
          // it, and releasing it here is exactly what makes a thrown mutation
          // retryable. require-atomic-updates is reasoning about ordinary
          // state.
          // eslint-disable-next-line require-atomic-updates
          inFlightRef.current = false
          setHasAttemptedSend(false)
        }
      }
    }
  }, [
    sendPaymentMutation,
    hasAttemptedSend,
    paymentDetail,
    fingerprint,
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

  return {
    hasAttemptedSend,
    loading,
    sendPayment,
    sendIsInFlight,
  }
}
