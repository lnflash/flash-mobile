// The mutation input of a send, as DATA.
//
// Why this exists at all: the server binds a cached idempotent result to a
// `requestFingerprint` built from the WIRE input — `ln|${paymentRequest}`,
// `ln-noamount-usd|${paymentRequest}|${amount}`,
// `intraledger|${recipientWalletId}|${amount}` (lnflash/flash
// `src/app/payments/`) — while our attempt fingerprint is deliberately built
// from what SURVIVES a retry, which excludes both a re-minted LNURL bolt11 and
// a price-derived settlement amount (see send-attempt-key.ts). A repeat has to
// carry the same key AND the same input, or the backend answers
// `IdempotencyKeyReuseError` instead of replaying.
//
// Holding the first Confirm's send CLOSURE would pair the two, but only for as
// long as the process lives. A force-quit is the normal reaction to a payment
// that appears to have failed, and it takes every closure with it while the
// server keeps its cached outcome for 24h — so the rebuilt detail would go out
// under the re-derived key and land on exactly the reuse error. Data survives
// a force-quit; a closure does not. Everything the repeat needs is therefore
// expressed as a plain JSON-round-trippable object, frozen and persisted by
// send-attempt-key.ts and fed back in through
// `SendPaymentMutationParams.frozenInput`.
import { IdempotentSendInput, IDEMPOTENT_SEND_INPUTS } from "./idempotency-support"

/**
 * The fields of a send input, restricted to what JSON round-trips losslessly.
 *
 * A frozen input is written to storage and read back a launch later, so
 * anything that cannot survive `JSON.parse(JSON.stringify(x))` unchanged has
 * no business here — the whole point is that the replay is byte-identical.
 */
export type SendWireInputFields = Readonly<Record<string, string | number | undefined>>

/**
 * A send's mutation input, tagged with the GraphQL input type it belongs to.
 *
 * The tag is load-bearing on replay: it is what lets a payment detail refuse an
 * input frozen for a *different* mutation rather than coercing it into its own
 * (see `replayableInput`).
 */
export type SendWireInput = {
  readonly inputType: IdempotentSendInput
  readonly input: SendWireInputFields
}

/**
 * The input to send for this attempt: the frozen one when we are repeating a
 * send, the freshly built one otherwise.
 *
 * The `inputType` check is not ceremony. A frozen input is looked up by the
 * attempt fingerprint, which pins the wallet, the payment type, the
 * destination, the authored amount and the memo — so the detail rebuilt for a
 * repeat targets the same mutation in every case we know how to reach. If that
 * ever stops being true, sending the FRESH input is the safe way to be wrong:
 * a mismatched input risks the reuse error, while a wrongly-shaped one is
 * rejected during coercion and takes the send path down.
 */
export const replayableInput = <I extends SendWireInputFields>(
  inputType: IdempotentSendInput,
  fresh: I,
  frozen: SendWireInput | undefined,
): I => (frozen && frozen.inputType === inputType ? (frozen.input as I) : fresh)

const INPUT_TYPES: readonly string[] = Object.values(IDEMPOTENT_SEND_INPUTS)

/**
 * Whether a value read back from storage is a send input we are willing to
 * replay.
 *
 * Storage is the one place this type is not enforced by the compiler: the
 * entry may have been written by a build that shaped it differently, or
 * corrupted outright. Anything unrecognised is dropped, which degrades to
 * "nothing frozen" — the behaviour before any of this existed — rather than
 * putting a malformed input on the wire.
 */
export const isSendWireInput = (value: unknown): value is SendWireInput => {
  const candidate = value as Partial<SendWireInput> | null
  if (!candidate || typeof candidate !== "object") return false
  if (typeof candidate.inputType !== "string") return false
  if (!INPUT_TYPES.includes(candidate.inputType)) return false

  const input = candidate.input
  if (!input || typeof input !== "object") return false
  // Every send input names the debited wallet; a frozen entry without one
  // could only ever be rejected by the server.
  if (typeof (input as SendWireInputFields).walletId !== "string") return false

  return Object.values(input).every(
    (field) =>
      field === undefined || typeof field === "string" || typeof field === "number",
  )
}
