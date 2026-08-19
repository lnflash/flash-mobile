/**
 * Operations the global `RetryLink` must never replay.
 *
 * Every entry is non-idempotent: running it twice moves money twice, or mints
 * something twice that the customer pays for. The retry link in client.tsx
 * fires on ANY link error that is not a 401, up to 5 times with exponential
 * backoff — and "link error" includes the cases where the request reached the
 * resolver and only the RESPONSE was lost (gateway 502, dropped socket, an
 * app backgrounded mid-flight). The server has already committed by then; a
 * retry commits again.
 *
 * Kept in its own module, rather than inline in client.tsx, so the invariant
 * can be asserted against the generated documents in a test
 * (__tests__/graphql/no-retry-operations.spec.ts) instead of living as a list
 * nobody checks. Importing client.tsx from a test is not an option: it pulls
 * in AsyncStorage, NetInfo, DeviceInfo and the whole provider tree.
 */
export const noRetryOperations = [
  "intraLedgerPaymentSend",
  "intraLedgerUsdPaymentSend",

  "lnInvoiceFeeProbe",
  "lnInvoicePaymentSend",
  "lnNoAmountInvoiceFeeProbe",
  "lnNoAmountInvoicePaymentSend",
  "lnNoAmountUsdInvoiceFeeProbe",
  "lnUsdInvoiceFeeProbe",
  "lnNoAmountUsdInvoicePaymentSend",

  "onChainPaymentSend",
  "onChainUsdPaymentSend",
  "onChainUsdPaymentSendAsBtcDenominated",
  "onChainTxFee",
  "onChainUsdTxFee",
  "onChainUsdTxFeeAsBtcDenominated",

  // Mints a server-side allowance RESERVATION, and the backend subtracts holds
  // from `remaining` the moment they exist. A replayed checkout request
  // therefore holds the amount AGAIN: five attempts at ~300ms backoff all land
  // inside CardPayment's 10s deadline, so a customer asking for $60 against a
  // $125 allowance can end up with $180 held. They pay nothing, are told
  // nothing was charged, and are then locked out of card top-ups — "$0.00 of
  // $125.00 left today / $180.00 is held by a payment link you haven't
  // completed" — until the duplicate holds lapse.
  "fygaroCheckoutCreate",

  // no need to retry to upload the token
  // specially as it's running on app start
  // and can create some unwanted loop when token is not valid
  "deviceNotificationTokenCreate",
]
