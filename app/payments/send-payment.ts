import type {
  ApolloClient,
  DocumentNode,
  FetchResult,
  MutationFunctionOptions,
  OperationVariables,
} from "@apollo/client"
import { v4 as uuidv4 } from "uuid"

// gql
import {
  HomeAuthedDocument,
  IntraLedgerPaymentSendDocument,
  IntraLedgerUsdPaymentSendDocument,
  LnInvoicePaymentSendDocument,
  LnNoAmountInvoicePaymentSendDocument,
  LnNoAmountUsdInvoicePaymentSendDocument,
  OnChainPaymentSendAllDocument,
  OnChainPaymentSendDocument,
  OnChainUsdPaymentSendAsBtcDenominatedDocument,
  OnChainUsdPaymentSendDocument,
  PaymentSendResult,
  WalletCurrency,
} from "@app/graphql/generated"

// utils
import { getErrorMessages } from "@app/graphql/utils"
import {
  CHECK_TRANSACTION_HISTORY_MESSAGE,
  isIdempotencyKeyReuseError,
} from "@app/screens/send-bitcoin-screen/payment-details/idempotency-support"

// types
import {
  PaymentDetail,
  SendPaymentMutation,
  SendPaymentMutationParams,
} from "@app/screens/send-bitcoin-screen/payment-details/index.types"
import type { BtcRail } from "./btc-rail"

// The send path without React (ENG-686, Phase 1a of ENG-684).
//
// `useSendPayment` (app/screens/send-bitcoin-screen/use-send-payment.ts) used
// to be the only correct executor of a send: it held the nine `use*Mutation`
// hooks, the Breez branch and the ENG-533 attempt/idempotency state machine.
// The dispatch now lives here, so the confirmation screen and, later, the
// assistant (ENG-687) share one path instead of forking it. The hook keeps the
// React state and the refs, and passes them in.
//
// Which mutation and which variables a send uses is still decided by the
// `sendPaymentMutation` closure each payment-details builder returns. This
// module only supplies the nine triggers that closure calls and runs the
// attempt lifecycle around it.

/**
 * The nine GraphQL send triggers a `SendPaymentMutation` closure is handed,
 * named and typed exactly as `SendPaymentMutationParams` declares them.
 */
export type GraphqlMutationFns = Pick<
  SendPaymentMutationParams,
  | "intraLedgerPaymentSend"
  | "intraLedgerUsdPaymentSend"
  | "lnInvoicePaymentSend"
  | "lnNoAmountInvoicePaymentSend"
  | "lnNoAmountUsdInvoicePaymentSend"
  | "onChainPaymentSend"
  | "onChainPaymentSendAll"
  | "onChainUsdPaymentSend"
  | "onChainUsdPaymentSendAsBtcDenominated"
>

/**
 * The nine triggers on `client.mutate`, in place of the nine `use*Mutation`
 * hooks the screen used to hold.
 *
 * In Apollo 3.9.0-alpha.5 a hook's trigger is
 * `client.mutate(mergeOptions({ ...hookOptions, mutation }, callOptions))`
 * plus the hook's own `loading`/`error` state. The screen's hooks were created
 * with `{ refetchQueries: [HomeAuthedDocument] }` and no `onError` or
 * `onCompleted`, so each trigger's promise resolved and rejected exactly as
 * `client.mutate`'s does. The refetch is attached here explicitly, and the
 * call options are spread last so they win, as they did in `mergeOptions`.
 * The builders pass only `variables`. Tracking `loading` is the caller's job;
 * `useSendPayment` does it.
 */
export const createGraphqlMutationFns = (
  client: ApolloClient<unknown>,
): GraphqlMutationFns => {
  const mutateWith =
    <TData, TVariables extends OperationVariables>(mutation: DocumentNode) =>
    (options?: MutationFunctionOptions<TData, TVariables>): Promise<FetchResult<TData>> =>
      client.mutate<TData, TVariables>({
        mutation,
        refetchQueries: [HomeAuthedDocument],
        ...options,
      })

  return {
    intraLedgerPaymentSend: mutateWith(IntraLedgerPaymentSendDocument),
    intraLedgerUsdPaymentSend: mutateWith(IntraLedgerUsdPaymentSendDocument),
    lnInvoicePaymentSend: mutateWith(LnInvoicePaymentSendDocument),
    lnNoAmountInvoicePaymentSend: mutateWith(LnNoAmountInvoicePaymentSendDocument),
    lnNoAmountUsdInvoicePaymentSend: mutateWith(LnNoAmountUsdInvoicePaymentSendDocument),
    onChainPaymentSend: mutateWith(OnChainPaymentSendDocument),
    onChainPaymentSendAll: mutateWith(OnChainPaymentSendAllDocument),
    onChainUsdPaymentSend: mutateWith(OnChainUsdPaymentSendDocument),
    onChainUsdPaymentSendAsBtcDenominated: mutateWith(
      OnChainUsdPaymentSendAsBtcDenominatedDocument,
    ),
  }
}

/**
 * One send attempt: the send closure captured at the first tap plus one
 * random key. Why an attempt is an object and not a content fingerprint, and
 * when one is created, retained and cleared, is the ENG-533 comment on
 * `attemptRef` in use-send-payment.ts.
 */
export type Attempt = {
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
}

/**
 * The caller's attempt state. The refs are passed in and never created here:
 * the attempt has to outlive any one call (a retry after a throw must find
 * the same closure and key), so it belongs to whoever outlives the calls.
 * For the screen that is `useSendPayment`.
 */
export type AttemptState = {
  inFlightRef: { current: boolean }
  attemptRef: { current: Attempt | null }
  setHasAttemptedSend: (hasAttemptedSend: boolean) => void
}

export type SendPaymentDeps = {
  mutations: GraphqlMutationFns
  btcRail: BtcRail
  /** `galoyInstance.graphqlUri`: scopes the idempotency-support gate. */
  graphqlUri: string
  /** `galoyInstance.lnAddressHostname`: completes a BTC intraledger handle. */
  lnAddressHostname: string
}

export type SendPaymentArgs = {
  sendPaymentMutation: SendPaymentMutation
  paymentDetail?: PaymentDetail<WalletCurrency>
  selectedFeeType?: "fast" | "medium" | "slow"
}

export type SendPaymentOutcome = {
  status: PaymentSendResult | null | undefined
  errorsMessage?: string
  /**
   * True when the in-flight guard suppressed this call: a second tap landed
   * while the first send was still on the wire. See `UseSendPaymentResult`.
   */
  ignored?: boolean
}

/**
 * Send one payment: through the BTC rail for the BTC wallet, through
 * GraphQL for every other wallet.
 *
 * The code is useSendPayment's dispatch moved here unchanged (ENG-686) apart
 * from three substitutions: the Breez calls go through `deps.btcRail`, the
 * nine triggers come from `deps.mutations`, and `graphqlUri` and
 * `lnAddressHostname` come from `deps`. Moving it unchanged also keeps
 * behavior a later ticket will fix, such as the LNURL/intraledger Breez
 * branch reporting Success without reading the rail's answer (ENG-694).
 */
export const sendPayment = async (
  { sendPaymentMutation, paymentDetail, selectedFeeType }: SendPaymentArgs,
  deps: SendPaymentDeps,
  state: AttemptState,
): Promise<SendPaymentOutcome> => {
  const { graphqlUri, lnAddressHostname } = deps
  const { inFlightRef, attemptRef, setHasAttemptedSend } = state

  if (inFlightRef.current) {
    return { status: undefined, errorsMessage: undefined, ignored: true }
  }
  inFlightRef.current = true
  setHasAttemptedSend(true)

  // Shared failure epilogue for the Breez branch: a Failure is a KNOWN
  // outcome, so re-arm the button for a fresh attempt — same semantics
  // as the GraphQL branch below. (Breez sends are local SDK calls with
  // no idempotency key; a retry is simply a new attempt.)
  const finish = (result: { status: PaymentSendResult; errorsMessage?: string }) => {
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
        const response = await deps.btcRail.payInvoice(
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
        const response = await deps.btcRail.payLnurl(
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
        const response = await deps.btcRail.payOnchain(
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
        // eslint-disable-next-line no-else-return -- moved verbatim from useSendPayment (ENG-686); reshaping it is not this change
      } else {
        return finish({
          status: PaymentSendResult.Failure,
          errorsMessage: "Wrong invoice type",
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- moved verbatim from useSendPayment (ENG-686)
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
    // fresh key. See Attempt above for why this is the whole design.
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
        ...deps.mutations,
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
