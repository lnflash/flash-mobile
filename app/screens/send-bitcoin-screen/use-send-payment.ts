import { useCallback, useMemo, useRef, useState } from "react"
import { useApolloClient } from "@apollo/client"

// gql
import { WalletCurrency } from "@app/graphql/generated"

// hooks
import { useAppConfig } from "@app/hooks"

// payments
import { breezBtcRail } from "@app/payments/btc-rail"
import {
  Attempt,
  GraphqlMutationFns,
  SendPaymentOutcome,
  createGraphqlMutationFns,
  sendPayment as dispatchSendPayment,
} from "@app/payments/send-payment"

// types
import { PaymentDetail, SendPaymentMutation } from "./payment-details/index.types"

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
  /**
   * An outcome that comes back `ignored` must be dropped on the spot; the
   * contract is on `SendPaymentOutcome` (app/payments/send-payment.ts).
   */
  sendPayment: (() => Promise<SendPaymentOutcome>) | undefined | null
}

/**
 * Wraps each GraphQL trigger so `loading` keeps the meaning it had when it was
 * the OR of the nine `use*Mutation` hooks' own flags: true exactly while a
 * mutation promise is pending. So it stays false for the whole of a Breez
 * send, goes false the moment a mutation settles however it settles (success,
 * failure, an IdempotencyKeyReuseError answer, a throw), and is true once per
 * dispatch when the idempotency gate falls back to a keyless re-send. It is
 * counted per call, not per attempt, for that reason.
 */
const trackPending = (
  fns: GraphqlMutationFns,
  onPendingChange: (delta: 1 | -1) => void,
): GraphqlMutationFns => {
  const track =
    <O, R>(fn: (options?: O) => Promise<R>) =>
    async (options?: O): Promise<R> => {
      onPendingChange(1)
      try {
        return await fn(options)
      } finally {
        onPendingChange(-1)
      }
    }
  return {
    intraLedgerPaymentSend: track(fns.intraLedgerPaymentSend),
    intraLedgerUsdPaymentSend: track(fns.intraLedgerUsdPaymentSend),
    lnInvoicePaymentSend: track(fns.lnInvoicePaymentSend),
    lnNoAmountInvoicePaymentSend: track(fns.lnNoAmountInvoicePaymentSend),
    lnNoAmountUsdInvoicePaymentSend: track(fns.lnNoAmountUsdInvoicePaymentSend),
    onChainPaymentSend: track(fns.onChainPaymentSend),
    onChainPaymentSendAll: track(fns.onChainPaymentSendAll),
    onChainUsdPaymentSend: track(fns.onChainUsdPaymentSend),
    onChainUsdPaymentSendAsBtcDenominated: track(
      fns.onChainUsdPaymentSendAsBtcDenominated,
    ),
  }
}

export const useSendPayment = (
  sendPaymentMutation?: SendPaymentMutation | null,
  paymentDetail?: PaymentDetail<WalletCurrency>,
  selectedFeeType?: "fast" | "medium" | "slow",
): UseSendPaymentResult => {
  const { lnAddressHostname, graphqlUri } = useAppConfig().appConfig.galoyInstance

  const client = useApolloClient()
  const pendingRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const mutations = useMemo(
    () =>
      trackPending(createGraphqlMutationFns(client), (delta) => {
        pendingRef.current += delta
        setLoading(pendingRef.current > 0)
      }),
    [client],
  )

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
  // That lifecycle is the GraphQL attempt's. A Breez on-chain attempt
  // (ENG-714) holds a key and no closure: it is cleared on a known outcome,
  // and on an unknown one it is kept with Confirm disarmed, and never retried
  // until ENG-715 proves the SDK replays the key.
  //
  // Deliberately NOT persisted. A force-quit mid-send discards the attempt,
  // which leaves exactly today's pre-existing risk — no worse — and avoids
  // guessing across sessions with content fingerprints. Cross-session
  // recovery wants a server-side lookup, not client heuristics.
  const attemptRef = useRef<Attempt | null>(null)

  // Synchronous double-tap guard. `hasAttemptedSend` gates whether
  // `sendPayment` is DEFINED, but that is decided at render time: two taps in
  // one frame both capture the closure from the render where it was still
  // defined. A ref is written synchronously, so the second tap sees it.
  const inFlightRef = useRef(false)

  // The dispatch itself lives in app/payments/send-payment.ts so the assistant
  // can share it. This hook owns the React state and the refs and passes them
  // in; sendPayment never creates its own.
  const sendPayment = useMemo(() => {
    return sendPaymentMutation && !hasAttemptedSend
      ? () =>
          dispatchSendPayment(
            { sendPaymentMutation, paymentDetail, selectedFeeType },
            { mutations, btcRail: breezBtcRail, graphqlUri, lnAddressHostname },
            { inFlightRef, attemptRef, setHasAttemptedSend },
          )
      : undefined
  }, [
    sendPaymentMutation,
    hasAttemptedSend,
    paymentDetail,
    selectedFeeType,
    graphqlUri,
    lnAddressHostname,
    mutations,
  ])

  const isInFlight = useCallback(() => inFlightRef.current, [])

  return {
    hasAttemptedSend,
    loading,
    sendPayment,
    isInFlight,
  }
}
