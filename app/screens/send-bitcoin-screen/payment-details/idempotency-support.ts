// Runtime capability gate for `idempotencyKey` on every send input this app
// passes it to.
//
// The hazard: GraphQL rejects unknown input-object fields during *input
// coercion*, before execution. Against a server whose input predates the
// resolver that added the field, an unconditional `idempotencyKey` therefore
// does not degrade — it errors the whole mutation out, and that entire send
// path stops working. `yarn graphql-check` cannot catch that: it validates our
// operations against the checked-in snapshot, not against the deployed server.
// The repo already isolates card-top-up operations for exactly this reason
// (see use-card-topup-allowance.ts); the send path must not be the exception,
// since the app can ship ahead of any given environment's API.
//
// ALL FIVE inputs go through here, not just the newest one. The app had never
// sent any of these fields before — the schema snapshot this PR refreshed was
// 224 lines stale, which is the PR's own premise — so "ENG-530 is long
// deployed" is an assumption nothing in this repo measures. If a single
// environment is behind it, an ungated field takes out every intraledger and
// lightning send from a USD wallet: a worse outage than the double-debit being
// fixed. The gate is generic and already tested; four extra call sites buy the
// assumption away.
//
// The check is an observation rather than an introspection round trip: the
// first send that is refused for this reason tells us, and because coercion
// happens before execution a refusal proves NOTHING settled — so retrying the
// same send without the field cannot double-pay.
import { AppState, AppStateStatus } from "react-native"

/**
 * The GraphQL input-object type names that carry `idempotencyKey`, exactly as
 * the server declares them.
 *
 * These strings are load-bearing twice over: they scope the gate (below) and
 * they are what a coercion refusal has to name before it is read as being
 * about THIS input. A typo silently disables the gate rather than failing
 * loudly, which is why `__tests__/send-bitcoin/idempotency-support.spec.ts`
 * pins them against app/graphql/public-schema.graphql.
 */
export const IDEMPOTENT_SEND_INPUTS = {
  intraLedger: "IntraLedgerPaymentSendInput",
  intraLedgerUsd: "IntraLedgerUsdPaymentSendInput",
  lnInvoice: "LnInvoicePaymentInput",
  lnNoAmountInvoice: "LnNoAmountInvoicePaymentInput",
  lnNoAmountUsdInvoice: "LnNoAmountUsdInvoicePaymentInput",
} as const

export type IdempotentSendInput =
  (typeof IDEMPOTENT_SEND_INPUTS)[keyof typeof IDEMPOTENT_SEND_INPUTS]

/**
 * What a refusal is scoped to.
 *
 * Both halves matter:
 *
 *  - `apiEndpoint`, because the app can switch `galoyInstance` at runtime
 *    (useSendPayment reads `useAppConfig().appConfig.galoyInstance`). A single
 *    process-global would let one send against staging, or against a custom
 *    instance, disarm idempotency for prod for the rest of the session.
 *  - `inputType`, because the five inputs gained the field in different server
 *    releases. One input's refusal says nothing about the other four, and
 *    treating it as though it did throws away protection on paths that have it.
 */
export type IdempotencyGate = {
  /** The GraphQL endpoint the send is going to — `galoyInstance.graphqlUri`. */
  apiEndpoint: string
  inputType: IdempotentSendInput
}

const gateId = ({ apiEndpoint, inputType }: IdempotencyGate): string =>
  `${apiEndpoint}\u0000${inputType}`

// Gates observed to refuse the field. Empty is the normal state; an entry is
// only ever added by a refusal the server actually sent.
const refusedGates = new Set<string>()

let foregroundSubscription: { remove: () => void } | undefined

/**
 * Re-arm every gate.
 *
 * A refusal is evidence about the pod that answered, not about the deployment:
 * during a rolling deploy a stale pod can refuse while the rest of the fleet
 * accepts. Left latched, that one pod costs the whole session's protection.
 * Foreground is the cheap, natural moment to reconsider — the app has been away
 * long enough for a deploy to finish, and the cost of being wrong is one
 * refused round trip that provably settled nothing.
 */
export const rearmIdempotencyKeySupport = (): void => {
  refusedGates.clear()
}

const watchForeground = (): void => {
  if (foregroundSubscription) return
  // Subscribed lazily rather than at import time: this module is imported by
  // the payment-detail builders, which unit tests construct directly.
  foregroundSubscription =
    AppState.addEventListener?.("change", (state: AppStateStatus) => {
      if (state === "active") rearmIdempotencyKeySupport()
    }) ?? undefined
}

/** Test seam — module state would otherwise leak between cases. */
export const resetIdempotencyKeySupport = (): void => {
  refusedGates.clear()
  foregroundSubscription?.remove()
  foregroundSubscription = undefined
}

/** Whether the field is still believed to be accepted for this gate. */
export const idempotencyKeySupported = (gate: IdempotencyGate): boolean =>
  !refusedGates.has(gateId(gate))

// The ONE sentence graphql-js emits for an unknown input-object field, matched
// whole and NAMING THE INPUT. Anchoring on the sentence rather than on loose
// halves is the whole point: `coerceVariableValues` writes EVERY input-coercion
// error as `Variable "$input" got invalid value ${inspect(invalidValue)}...;
// <reason>`, and for an input-object error `invalidValue` is the entire input
// object — which contains `idempotencyKey` whenever we sent it. A pair of
// checks like "mentions the field" AND "says got invalid value" therefore
// matches any coercion error at all: the server adds an unrelated required
// field, answers `...; Field "x" of required type "Y!" was not provided.`, and
// the gate reads that as "the server lacks idempotencyKey", disarms itself, and
// later sends go out bare — so a lost response plus a retry double-pays,
// silently, on the path this exists to protect.
//
// Including the type name also keeps one input's refusal from disarming
// another's.
const refusalSentence = (inputType: IdempotentSendInput): string =>
  `Field "idempotencyKey" is not defined by type "${inputType}"`

const messagesOf = (err: unknown): string[] => {
  const candidate = err as {
    message?: unknown
    graphQLErrors?: readonly { message?: unknown }[]
  } | null
  if (!candidate) return []

  const messages: string[] = []
  if (typeof candidate.message === "string") messages.push(candidate.message)
  if (Array.isArray(candidate.graphQLErrors)) {
    for (const graphQLError of candidate.graphQLErrors) {
      if (typeof graphQLError?.message === "string") messages.push(graphQLError.message)
    }
  }
  return messages
}

/**
 * Whether `err` is the server saying it does not know this input field, on
 * THIS input — as opposed to any other failure, which must propagate untouched.
 */
export const isUnsupportedIdempotencyKeyError = (
  err: unknown,
  inputType: IdempotentSendInput,
): boolean =>
  messagesOf(err).some((message) => message.includes(refusalSentence(inputType)))

/**
 * The one sentence shown whenever the client cannot prove an earlier dispatch
 * of this payment did NOT settle — an idempotency-key reuse answer, a key
 * refused on a retry, or a retry of an attempt that once went out keyless.
 * Shared so the copy cannot drift between the modules that surface it
 * (use-send-payment.ts is the other one).
 */
export const CHECK_TRANSACTION_HISTORY_MESSAGE =
  "This payment may have already been sent. Check your transaction history before trying again."

/**
 * Thrown in place of a keyless fallback when the key is refused on a RETRY of
 * an attempt that has already been dispatched once. The earlier dispatch's
 * outcome is unknown — that is what makes it a retry — so re-sending without
 * the key would re-execute a payment the server may have already settled. The
 * only safe move is to surface an error and send the user to their history.
 */
export class UnresolvedAttemptKeyRefusedError extends Error {
  constructor() {
    super(CHECK_TRANSACTION_HISTORY_MESSAGE)
    this.name = "UnresolvedAttemptKeyRefusedError"
  }
}

/**
 * The attempt half of a keyed dispatch: the key itself, plus whether this is
 * a RETRY of an attempt that has already been dispatched once (see
 * `attemptRef` in use-send-payment.ts — a retry exists precisely because the
 * earlier dispatch's outcome is unknown).
 */
export type IdempotentAttempt = {
  idempotencyKey: string
  isRetry: boolean
  /**
   * Called synchronously, immediately before any dispatch that goes out
   * WITHOUT the key. The caller owns the attempt's lifecycle and must know:
   * once an attempt has gone out keyless, a later retry of it cannot lean on
   * the server replaying the key — the server never saw one — so re-dispatching
   * could execute a second payment. use-send-payment.ts records the flag and
   * refuses to auto-retry such an attempt.
   */
  onKeylessDispatch?: () => void
}

/**
 * Run `send` with the idempotency key when the gate is known to accept it, and
 * fall back to today's un-keyed input when it turns out not to.
 *
 * The keyless fallback fires only on the FIRST dispatch of an attempt: there a
 * coercion refusal means the mutation never executed, so the un-keyed retry is
 * not a second payment attempt. On a RETRY of a dispatched attempt that
 * reasoning covers only the dispatch that was just refused — it says nothing
 * about the earlier keyed dispatch whose outcome is unknown (the exact
 * mixed-fleet scenario the re-arm logic above defends against: tap 1 commits
 * on a new pod, the response is lost, the retry hits a stale pod that refuses
 * the field). A keyless send there could execute a second payment, so a retry
 * NEVER goes out keyless: it is always dispatched with the key — the one
 * spelling the server can recognise as a repeat — and a refusal surfaces as
 * `UnresolvedAttemptKeyRefusedError` instead of a silent re-execution.
 */
export const withIdempotencyKey = async <T>(
  attempt: IdempotentAttempt,
  gate: IdempotencyGate,
  send: (keyField: { idempotencyKey?: string }) => Promise<T>,
): Promise<T> => {
  watchForeground()

  if (!idempotencyKeySupported(gate) && !attempt.isRetry) {
    attempt.onKeylessDispatch?.()
    return send({})
  }

  try {
    return await send({ idempotencyKey: attempt.idempotencyKey })
  } catch (err) {
    if (!isUnsupportedIdempotencyKeyError(err, gate.inputType)) throw err
    refusedGates.add(gateId(gate))
    if (attempt.isRetry) throw new UnresolvedAttemptKeyRefusedError()
    attempt.onKeylessDispatch?.()
    return send({})
  }
}

/**
 * The server's answer when a key it already has a result for is presented with
 * DIFFERENT payment parameters (`IdempotencyKeyReuseError`, mapped through
 * lnflash/flash `src/graphql/error-map.ts`).
 *
 * Matched on the sentence rather than a code because the code is the generic
 * `INVALID_INPUT` that every validation error carries. Pinned by test against
 * the string the server actually builds.
 */
const KEY_REUSE_SENTENCE = "idempotency key was already used for a different payment"

/**
 * Whether a mutation's `errors` payload is the backend refusing to replay
 * because our input no longer matches the one it cached.
 *
 * This must never be treated as an ordinary failure. It arrives as
 * `{ status: "failed" }`, and a failure is what retires the key and re-enables
 * the Confirm button — so reading it as one hands the user a FRESH key for a
 * payment the server has already settled, and the money leaves twice. The
 * server owns an outcome here; the only safe move is to stop and tell the user
 * to look at their history.
 */
export const isIdempotencyKeyReuseError = (
  errors: readonly { message?: string | null }[] | null | undefined,
): boolean =>
  Boolean(
    errors?.some((error) =>
      (error?.message ?? "").toLowerCase().includes(KEY_REUSE_SENTENCE),
    ),
  )
