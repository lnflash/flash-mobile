import { payLightningBreez, payLnurlBreez, payOnchainBreez } from "@app/utils/breez-sdk"

// The self-custodial BTC wallet as one seam (ENG-686, Phase 1a of ENG-684).
//
// `sendPayment` (./send-payment.ts) reaches Breez only through this type, so
// the caller decides which rail it gets: the confirmation screen's hook passes
// `breezBtcRail`, and a test passes a mock. Every signature is the existing
// `@app/utils/breez-sdk` wrapper's own, taken with `typeof`, so this file does
// not import `@breeztech/breez-sdk-spark-react-native` itself.
//
// `app/utils/breez-sdk/spark.ts` is the only module that calls the SDK.
// Other modules import SDK enums and types, and ENG-693 moves those behind
// this rail.
type SameAs<F extends (...args: never[]) => unknown> = (
  ...args: Parameters<F>
) => ReturnType<F>

// The rail holds only the three sends the send path makes. The spec's other
// members (docs/ai-assistant-tool-registry.md §2.1) are added by the tickets
// that first call them: getBalanceSats and listPayments by ENG-687, and
// createInvoice, getOnchainAddress and probeFee by ENG-688. Each takes the
// shape the spec gives it, which is not always a wrapper's own. The balance
// is the case in point: with advance mode off, Breez is not initialized and
// getInfo() throws a generic Error, but the rail has to report that as a
// `disabled` state, never as a zero balance.
export type BtcRail = {
  payInvoice: SameAs<typeof payLightningBreez>
  payLnurl: SameAs<typeof payLnurlBreez>
  payOnchain: SameAs<typeof payOnchainBreez>
}

// One-line delegates, resolved at call time.
export const breezBtcRail: BtcRail = {
  payInvoice: (...args) => payLightningBreez(...args),
  payLnurl: (...args) => payLnurlBreez(...args),
  payOnchain: (...args) => payOnchainBreez(...args),
}
