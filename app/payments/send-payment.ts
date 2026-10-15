import type {
  ApolloClient,
  DocumentNode,
  FetchResult,
  MutationFunctionOptions,
  MutationOptions,
  OperationVariables,
} from "@apollo/client"
import { mergeOptions } from "@apollo/client/utilities"
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
// The deep path, never the @app/utils/breez-sdk barrel: the leaf module loads
// no SDK, and Jest maps the barrel to a mock without this class.
import { LnurlPayOutcomeUnknownError } from "@app/utils/breez-sdk/lnurl-pay-errors"

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
 * `client.mutate`'s does. Each trigger here makes that same call, with the
 * refetch attached explicitly and the options merged by Apollo's own
 * `mergeOptions`. A call option replaces a default only when it is defined,
 * so a call that passes `refetchQueries: undefined` still refetches
 * HomeAuthed, as it did in the hook. The hook also acted on a call's
 * `client`, `onCompleted` and `onError` itself, and `client.mutate` ignores
 * them; no builder passes them, since the builders pass only `variables`.
 * Tracking `loading` is the caller's job; `useSendPayment` does it.
 */
export const createGraphqlMutationFns = (
  client: ApolloClient<unknown>,
): GraphqlMutationFns => {
  const mutateWith =
    <TData, TVariables extends OperationVariables>(mutation: DocumentNode) =>
    (
      options: MutationFunctionOptions<TData, TVariables> = {},
    ): Promise<FetchResult<TData>> =>
      client.mutate<TData, TVariables>(
        mergeOptions<
          MutationOptions<TData, TVariables>,
          MutationOptions<TData, TVariables>
        >({ mutation, refetchQueries: [HomeAuthedDocument] }, options),
      )

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
 *
 * A Breez on-chain send (ENG-714) holds an attempt with a key and no
 * closure. The key goes to sdk.sendPayment. The attempt is cleared once the
 * outcome is known, and kept, with Confirm disarmed, when it is not.
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
  // The GraphQL send closure. A Breez on-chain attempt has none.
  run?: (params: SendPaymentMutationParams) => ReturnType<SendPaymentMutation>
}

/**
 * The caller's attempt state. The refs are passed in and never created here:
 * the attempt has to outlive any one call (a retry after a throw must find
 * the same closure and key), so it belongs to whoever outlives the calls.
 * For the screen that is `useSendPayment`.
 *
 * Invariant (ENG-533): one `AttemptState` per logical payment attempt. The
 * caller creates its refs once and hands the same `inFlightRef` and
 * `attemptRef` to every call for that payment, each retry included (the
 * wrapper object may be rebuilt per call, as `useSendPayment` does).
 * `sendPayment` mints the idempotency key itself, when a GraphQL send or a
 * Breez on-chain send starts a new `Attempt`, and keeps it in `attemptRef`
 * until the outcome is known; nothing else holds it between calls.
 *
 * - Never recreate the refs per call (per Confirm tap, say). A retry after a
 *   dropped response would then find no `Attempt` and mint a new key. If the
 *   first dispatch did execute, the backend cannot tell the retry from a new
 *   payment and can execute it a second time: a double pay.
 * - A new attempt (a re-prepared action, new amounts) gets a new state,
 *   because a reused one can carry the old attempt over. After a GraphQL
 *   send throws, the next GraphQL call re-runs the retained `Attempt`'s
 *   frozen closure instead of the `sendPaymentMutation` it is given. After
 *   a success the in-flight guard stays set, so the next call comes back
 *   `ignored` and sends nothing.
 *
 * So the assistant's executor (ENG-687/688) must keep one state per prepared
 * action, for as long as that action can be retried.
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
   * True when this call was suppressed by the in-flight guard: a second
   * call (on the screen, a second tap) that landed while the first send was
   * still on the wire. Nothing was sent and `status` is undefined. The
   * caller must return immediately: no spinner toggle, no analytics, no
   * error toast or failure card. Otherwise a double-tap on a SUCCESSFUL
   * payment shows a failure and logs a phantom undefined-status result.
   */
  ignored?: boolean
}

/**
 * What `payLnurl` resolves with: the Spark SDK's `LnurlPayResponse`, typed
 * through the rail so this module does not import the SDK
 * (docs/ai-assistant-tool-registry.md §2.1).
 */
type LnurlPayAnswer = Awaited<ReturnType<BtcRail["payLnurl"]>>

/**
 * ENG-694: which payment statuses mean an LNURL or intraledger send went out,
 * keyed by the SDK's generated `PaymentStatus` values. The Record is
 * exhaustive over that enum, so an SDK bump that adds a status fails tsc here
 * until someone decides what the new status means for a send.
 */
const LNURL_PAYMENT_SENT: Record<LnurlPayAnswer["payment"]["status"], boolean> = {
  0: true, // Completed
  // Pending: in flight. The SDK's LNURL pay returns without waiting for the
  // payment to settle, so this is its usual answer. The lightning branch also
  // reports a payment that is still pending after its own wait as Success.
  1: true,
  2: false, // Failed
}

/**
 * The confirmation screen's own copy for a Failure that carries no message
 * (send-bitcoin-confirmation-screen.tsx). A Failed payment comes back without
 * a reason, so the LNURL branch shows that copy instead of a new string.
 */
const LNURL_PAYMENT_FAILED_MESSAGE = "Something went wrong"

/**
 * Whether `payLnurl`'s answer reports a payment that went out: a Completed or
 * Pending one. A Failed payment is not one, and neither is an answer that
 * carries no payment status: the SDK always sets one, so an answer without
 * it did not come from the SDK and proves nothing.
 */
const lnurlPaymentSent = (answer: LnurlPayAnswer | undefined): boolean => {
  const status = answer?.payment?.status
  return status !== undefined && LNURL_PAYMENT_SENT[status] === true
}

/**
 * Send one payment: through the BTC rail for the BTC wallet, through
 * GraphQL for every other wallet.
 *
 * `state` must be the caller's one `AttemptState` for this logical payment
 * attempt, created once and reused across every retry of that attempt; a
 * new attempt (a re-prepared action, new amounts) gets a new state (ENG-533,
 * see `AttemptState`). The idempotency key is minted in here, when a GraphQL
 * send or a Breez on-chain send starts a new `Attempt`, so a caller that
 * recreates the state per call sends each retry under a new key, and a retry
 * after a dropped response can pay twice.
 *
 * The code is useSendPayment's dispatch moved here unchanged (ENG-686) apart
 * from three substitutions: the Breez calls go through `deps.btcRail`, the
 * nine triggers come from `deps.mutations` (spread ahead of the attempt's
 * own fields, so they cannot replace them), and `graphqlUri` and
 * `lnAddressHostname` come from `deps`. ENG-694 then changed one behavior
 * the move had kept: the LNURL/intraledger Breez branch reads the rail's
 * answer instead of reporting Success unconditionally.
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

  // Shared failure epilogue for the Breez branch: re-arm the button for a
  // fresh attempt, as the GraphQL branch below does for a Failure. The next
  // tap is a new send, never a replay of the first: the bolt11 and LNURL
  // sends carry no key, and the on-chain branch drops its attempt, key and
  // all, before it re-arms (ENG-714). Re-arming is therefore only safe when
  // the outcome is known and nothing went out: a payment the SDK reports
  // Failed, or a rejection before the SDK dispatched. A rejection after the
  // SDK dispatched is not one. payLnurlBreez rethrows sdk.lnurlPay's as
  // LnurlPayOutcomeUnknownError, which the catch below answers without
  // re-arming (ENG-711). payOnchainBreez answers sdk.sendPayment's with
  // outcomeUnknown, which the on-chain branch answers without calling finish
  // (ENG-714). payInvoice still brings one here: payLightningBreez turns every
  // rejection into success: false, so the bolt11 branch re-arms on it (the
  // bolt11 half of ENG-714, still open). A keyed retry is ENG-715.
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
        // payLightningBreez answers success: true for any payment
        // sdk.sendPayment resolves with, and it waits up to 60 s for the
        // payment to settle, so one that fails inside that wait comes back
        // Failed with success: true and reads as Success here: ENG-712.
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
        // ENG-694: read the answer, as the lightning branch reads its own: the
        // payment's status says whether it went out. A rejection before
        // sdk.lnurlPay dispatches (parse, prepare, "Unsupported input type")
        // is a failure, and the catch below re-arms on it. A rejection from
        // lnurlPay itself proves nothing: in SDK 0.22.3 it can come after the
        // payment left (a dropped connection after the leaves went to the SSP,
        // an SSP answer the SDK cannot read, a failed storage write). A second
        // tap would prepare a fresh invoice and could pay the recipient twice,
        // so payLnurlBreez rethrows that one as LnurlPayOutcomeUnknownError,
        // and the catch below answers it as an unknown outcome: it stays
        // disarmed and sends the user to their history, as the GraphQL branch
        // does (ENG-711).
        const sent = lnurlPaymentSent(response)
        return finish({
          status: sent ? PaymentSendResult.Success : PaymentSendResult.Failure,
          errorsMessage: sent ? undefined : LNURL_PAYMENT_FAILED_MESSAGE,
        })
      } else if (paymentType === "onchain") {
        console.log("Starting payOnchainBreez")
        // ENG-714: one key per attempt, minted here as the GraphQL branch mints
        // its own, and sent with the withdrawal. An attempt kept from an
        // earlier call keeps its key.
        if (!attemptRef.current) {
          attemptRef.current = { key: uuidv4(), dispatched: false, wentKeyless: false }
        }
        const attempt = attemptRef.current
        attempt.dispatched = true
        const response = await deps.btcRail.payOnchain(
          destination,
          settlementAmount.amount,
          selectedFeeType || "fast",
          attempt.key,
        )
        console.log("Response payOnchainBreez: ", response)

        // ENG-714: sdk.sendPayment itself rejected, so the withdrawal may have
        // left, and the next tap could withdraw again. No finish():
        // inFlightRef and hasAttemptedSend keep the true set above, so Confirm
        // stays disarmed, a second call comes back ignored, and the attempt
        // keeps its key. The user gets the history message, the answer the
        // GraphQL branch gives an outcome it cannot prove, and never
        // response.error, the SDK's raw message.
        if (!response.success && response.outcomeUnknown) {
          return {
            status: PaymentSendResult.Failure,
            errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
          }
        }

        // A known outcome: the withdrawal went out, or it was refused before
        // the dispatch. The attempt is over.
        // eslint-disable-next-line require-atomic-updates -- ref as a synchronous flag; the write-after-await IS the design
        attemptRef.current = null
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
      // ENG-711: sdk.lnurlPay rejected, so the payment may have left. No
      // finish(): inFlightRef and hasAttemptedSend keep the true set above, so
      // Confirm stays disarmed and a second call comes back ignored. Same
      // answer as the GraphQL branch gives an outcome it cannot prove.
      if (err instanceof LnurlPayOutcomeUnknownError) {
        return {
          status: PaymentSendResult.Failure,
          errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
        }
      }
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
    // ENG-714: an attempt with no closure belongs to a Breez on-chain send
    // whose withdrawal may have left. There is nothing here to replay, so stay
    // disarmed with the history message, as for a keyless retry below, and
    // never throw. Only a state reused for a different send gets here, which
    // AttemptState forbids.
    if (!attempt.run) {
      return {
        status: PaymentSendResult.Failure,
        errorsMessage: CHECK_TRANSACTION_HISTORY_MESSAGE,
      }
    }
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
      // The triggers are spread first so the attempt's own fields win.
      // `GraphqlMutationFns` is a structural Pick, so `deps.mutations` may be
      // a whole `SendPaymentMutationParams`, with some other key, a stale
      // `attemptIsRetry: false` (which reopens the gate's keyless fallback on
      // a retry), its own keyless recorder and its own endpoint. Spread last,
      // those would replace this attempt's, and a retry could pay twice.
      response = await attempt.run({
        ...deps.mutations,
        idempotencyKey: attempt.key,
        attemptIsRetry,
        onKeylessDispatch: () => {
          attempt.wentKeyless = true
        },
        apiEndpoint: graphqlUri,
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
