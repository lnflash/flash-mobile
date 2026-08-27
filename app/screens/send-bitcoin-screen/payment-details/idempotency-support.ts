// Runtime capability gate for `idempotencyKey` on the ONE input this app sends
// that only gained the field recently.
//
// The hazard: GraphQL rejects unknown input-object fields during *input
// coercion*, before execution. Against a server whose
// `LnNoAmountUsdInvoicePaymentInput` predates flash#494 (merged 2026-08-26),
// an unconditional `idempotencyKey` therefore does not degrade — it errors the
// whole mutation out, and every no-amount USD lightning send stops working.
// `yarn graphql-check` cannot catch that: it validates our operations against
// the checked-in snapshot, not against the deployed server. The repo already
// isolates card-top-up operations for exactly this reason (see
// use-card-topup-allowance.ts); the send path must not be the exception, since
// the app can ship ahead of any given environment's API.
//
// The other four send inputs the app uses (IntraLedger, IntraLedgerUsd,
// LnInvoice, LnNoAmountInvoice) have carried the field since ENG-530 and are
// long deployed, so they pass it unconditionally and never come through here.
//
// The check is an observation rather than an introspection round trip: the
// first send that is refused for this reason tells us, and because coercion
// happens before execution a refusal proves NOTHING settled — so retrying the
// same send without the field cannot double-pay. Every later send in the
// session skips the field outright, which is precisely today's behaviour.

let serverAcceptsIdempotencyKey = true

/** Test seam — module state would otherwise leak between cases. */
export const resetIdempotencyKeySupport = (): void => {
  serverAcceptsIdempotencyKey = true
}

/** Whether the field is still believed to be accepted. Exposed for tests. */
export const idempotencyKeySupported = (): boolean => serverAcceptsIdempotencyKey

// The ONE sentence graphql-js emits for an unknown input-object field, matched
// whole. Anchoring on the sentence rather than on loose halves is the whole
// point: `coerceVariableValues` writes EVERY input-coercion error as
// `Variable "$input" got invalid value ${inspect(invalidValue)}...; <reason>`,
// and for an input-object error `invalidValue` is the entire input object —
// which contains `idempotencyKey` whenever we sent it. A pair of tests like
// "mentions the field" AND "says got invalid value" therefore matches any
// coercion error at all: the server adds an unrelated required field, answers
// `...; Field "x" of required type "Y!" was not provided.`, and the gate reads
// that as "the server lacks idempotencyKey", disarms itself for the process
// lifetime, and every later no-amount USD send goes out bare — so a lost
// response plus a retry double-pays, silently, on the path this exists to
// protect.
const REJECTS_THE_FIELD = /Field "idempotencyKey" is not defined by type/

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
 * Whether `err` is the server saying it does not know this input field —
 * as opposed to any other failure, which must propagate untouched.
 */
export const isUnsupportedIdempotencyKeyError = (err: unknown): boolean =>
  messagesOf(err).some((message) => REJECTS_THE_FIELD.test(message))

/**
 * Run `send` with the idempotency key when the server is known to accept it,
 * and fall back to today's un-keyed input when it turns out not to.
 *
 * The fallback fires only on a coercion refusal, and a coercion refusal means
 * the mutation never executed, so the retry is not a second payment attempt.
 */
export const withIdempotencyKey = async <T>(
  idempotencyKey: string,
  send: (keyField: { idempotencyKey?: string }) => Promise<T>,
): Promise<T> => {
  if (!serverAcceptsIdempotencyKey) return send({})

  try {
    return await send({ idempotencyKey })
  } catch (err) {
    if (!isUnsupportedIdempotencyKeyError(err)) throw err
    serverAcceptsIdempotencyKey = false
    return send({})
  }
}
