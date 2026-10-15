// The LNURL-pay rejection the send path must tell apart (ENG-711).
//
// This module is intentionally free of react-native / SDK imports (like
// ./fee-errors.ts), so app/payments can import it without loading spark.ts,
// and a test gets the same class the production code throws. Import it by this
// deep path, not through the @app/utils/breez-sdk barrel: Jest maps the barrel
// to __mocks__/breez-sdk.js, which does not export it, and an `instanceof`
// against undefined throws a TypeError.

/**
 * `sdk.lnurlPay` rejected, so nobody knows whether the payment left.
 *
 * In spark-sdk 0.22.3 that rejection can come after the SSP already has the
 * payment: a connection dropped after the leaves went out, an SSP answer the
 * SDK cannot read, a failed storage write. The call carries no idempotency
 * key, so a retry prepares and pays a fresh invoice: a second payment.
 * `payLnurlBreez` (./spark.ts) throws this only for a rejection from
 * `lnurlPay` itself; whatever fails before the dispatch passes through as it
 * is. `sendPayment` (app/payments/send-payment.ts) answers it by keeping
 * Confirm disarmed and sending the user to their transaction history.
 *
 * `sdkError` is the SDK's own rejection, untouched. It is not called `cause`,
 * so it cannot clash with `Error.cause` once `lib` reaches ES2022.
 */
export class LnurlPayOutcomeUnknownError extends Error {
  constructor(readonly sdkError: unknown) {
    super(sdkError instanceof Error ? sdkError.message : String(sdkError))
    this.name = "LnurlPayOutcomeUnknownError"
  }
}
